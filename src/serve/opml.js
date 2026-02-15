import { Service, Endpoint } from './service.js';
import { Auth } from '../lib/auth.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue, KVSMeta } from '../adapt/kvs.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// MARK: OPMLService Class

export class OPMLService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.opml);
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Endpoint.proxy, this.requestURL.origin);
    this.authKey = null;

    const pathComponents = this.requestURL.pathname.split('/');
    const opmlIndex = pathComponents.indexOf("opml");
    if (opmlIndex !== -1 && pathComponents[opmlIndex + 1]) {
      this.uuid = pathComponents[opmlIndex + 1];
      this.action = pathComponents[opmlIndex + 2] || null;
    }

    this.kvs = null;
  }

  async handleRequest() {
    try {
      this.authKey = await Auth.validate(this.request);
      if (this.authKey) {
        this.kvs = new KVSAdapter(this.env, "OPML", this.authKey);
      }

      if (this.request.method === "POST") {
        return await this.handlePost();
      }
      
      const action = this.action;
      if (action === 'download') {
        return await this.handleDownload();
      }
      if (action === 'convert') {
        return await this.handleConvert();
      }
      if (action === 'delete') {
        return await this.handleDelete();
      }

      return await this.getSubmitForm();
    } catch (error) {
      console.error(`[OPMLService.handleRequest] Internal Error: ${error.message}`);
      return renderError(500, "An internal server error occurred", this.requestURL.pathname);
    }
  }

  async handleDelete() {
    if (!this.authKey || !this.kvs) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, "File ID is required", this.requestURL.pathname);
    }

    // Attempt delete (adapter handles ownership check)
    try {
      await this.kvs.delete(id);
    } catch (e) {
      console.error(`[OPMLService.handleDelete] Error: ${e.message}`);
      // We might want to return an error, or just redirect if it was already gone/unauthorized
      // For security, treating unauthorized delete as silent or generic error is often better.
      return renderError(400, "Could not delete file", this.requestURL.pathname);
    }

    // Redirect back to the list
    return new Response(null, {
      status: 302,
      headers: {
        "Location": `${Endpoint.opml}?key=${this.authKey}`
      }
    });
  }

  async handleConvert() {
    if (!this.authKey) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, "File ID is required", this.requestURL.pathname);
    }

    const entry = await this.kvs.get(id);
    if (!entry) {
      return renderError(404, "File not found or unauthorized", this.requestURL.pathname);
    }

    const name = entry.name;
    const content = entry.value;

    const rewrittenOpml = this.rewriteOPML(content, this.authKey);
    if (!rewrittenOpml) {
      return renderError(500, "Failed to rewrite OPML", this.requestURL.pathname);
    }

    return new Response(rewrittenOpml, {
      headers: {
        "Content-Type": "text/x-opml",
        "Content-Disposition": `attachment; filename="proxied_${name}"`
      },
      status: 200
    });
  }

  async handleDownload() {
    if (!this.authKey) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, "File ID is required", this.requestURL.pathname);
    }

    const entry = await this.kvs.get(id);
    if (!entry) {
      return renderError(404, "File not found or unauthorized", this.requestURL.pathname);
    }

    const name = entry.name;
    const content = entry.value;

    return new Response(content, {
      headers: {
        "Content-Type": "text/x-opml",
        "Content-Disposition": `attachment; filename="${name}"`
      },
      status: 200
    });
  }

  async getSubmitForm() {
    const key = this.requestURL.searchParams.get('key') || '';
    const actionUrl = Endpoint.opml + (key ? `?key=${key}` : '');

    const headExtras = `
      <script>
        function updateAction() {
          const key = document.getElementById('key').value;
          const form = document.getElementById('opml-form');
          const baseUrl = "${Endpoint.opml}";
          form.action = baseUrl + (key ? '?key=' + encodeURIComponent(key) : '');
          
          // Update download links
          const links = document.querySelectorAll('.download-link');
          links.forEach(link => {
            const id = link.getAttribute('data-id');
            const action = link.getAttribute('data-action');
            link.href = baseUrl + encodeURIComponent(id) + '/' + action + (key ? '?key=' + encodeURIComponent(key) : '');
          });
        }
      </script>
    `;

    let content = '';

    if (!this.authKey) {
      content = `
        <h2>RSS THE PLANET: OPML Rewriter</h2>
        <p>Please enter your API Key to access the OPML Rewriter.</p>
        <form id="opml-form" action="${actionUrl}" method="GET">
          <p>
            <label for="key">API Key:</label><br>
            <div class="input-group">
              <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
              <button type="button" class="secondary" onclick="window.location.href='${Endpoint.opml}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
            </div>
          </p>
        </form>
      `;
    } else {
      const entries = await this.kvs.list();
      let tableRows = '';
      if (entries.length === 0) {
        tableRows = `<tr class="empty-state"><td colspan="3">No OPML Files Saved.</td></tr>`;
      } else {
        tableRows = entries.map(f => `
          <tr>
            <td class="id-col">${f.key}</td>
            <td><strong>${f.name}</strong></td>
            <td class="actions">
              <a href="${Endpoint.opml}${encodeURIComponent(f.key)}/download?key=${this.authKey}" 
                 class="download-link action-link" 
                 data-id="${f.key}"
                 data-action="download">Original</a>
              <a href="${Endpoint.opml}${encodeURIComponent(f.key)}/convert?key=${this.authKey}" 
                 class="download-link action-link primary" 
                 data-id="${f.key}"
                 data-action="convert">Convert</a>
              <a href="${Endpoint.opml}${encodeURIComponent(f.key)}/delete?key=${this.authKey}" 
                 class="download-link action-link delete" 
                 data-id="${f.key}"
                 data-action="delete"
                 onclick="return confirm('Are you sure you want to delete ${f.name}?');">Delete</a>
            </td>
          </tr>
        `).join('');
      }

      const fileTable = `
        <h3>Stored OPML Files</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 30%;">ID</th>
              <th>Filename</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      `;

      content = `
        <h2>RSS THE PLANET: OPML Rewriter</h2>
        <p>Upload an OPML file to rewrite all feed URLs through this proxy.</p>
        <form id="opml-form" action="${actionUrl}" method="POST" enctype="multipart/form-data">
          <p>
            <label for="key">API Key (if not in URL):</label><br>
            <div class="input-group">
              <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
              <button type="button" class="secondary" onclick="window.location.href='${Endpoint.opml}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
            </div>
          </p>
          <fieldset>
            <legend>Mode</legend>
            <input type="radio" id="mode-rewrite" name="mode" value="rewrite" checked>
            <label for="mode-rewrite" style="display:inline;">Rewrite URLs (Process Now)</label><br>
            <input type="radio" id="mode-save" name="mode" value="save">
            <label for="mode-save" style="display:inline;">Save to Store</label>
          </fieldset>
          <p>
            <label for="opml">OPML File:</label><br>
            <input type="file" id="opml" name="opml" accept=".opml,.xml">
          </p>
          <p>
            <button type="submit">Submit</button>
          </p>
        </form>
        ${fileTable}
      `;
    }

    return new Response(renderLayout("RSS THE PLANET: OPML Rewriter", content, headExtras), {
      headers: { "Content-Type": "text/html" },
      status: 200
    });
  }

  async handlePost() {
    // 1. Check that we are authorized
    if (!this.authKey) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }

    // 2. Get the data
    let formData;
    try {
      formData = await this.request.formData();
    } catch (e) {
      console.error(`[OPMLService.handlePost] Error reading formData: ${e.message}`);
      return new Response("Invalid form data", { status: 400 });
    }

    // 3. Get the OPML file
    const file = formData.get('opml');
    if (!file || typeof file === 'string' || file.size === 0) {
      console.log(`[OPMLService.handlePost] No file provided`);
      return new Response("No OPML file provided", { status: 400 });
    }

    const opmlText = await file.text();
    console.log(`[OPMLService.handlePost] Processing file: ${file.name} size: ${file.size}`);
    
    // 4. Check Mode
    const mode = formData.get('mode');
    if (mode === 'save') {
      const filename = file.name || 'feeds.opml';
      
      // ID will be generated automatically if null is passed
      const newEntry = new KVSValue(null, filename, opmlText, "OPML", this.authKey);
      const savedEntry = await this.kvs.put(newEntry);
      
      if (!savedEntry) throw new Error("Failed to save OPML");
      
      const content = `
        <h2>File Saved</h2>
        <p>The file <strong>${filename}</strong> has been saved to the store.</p>
        <p>ID: ${savedEntry.key}</p>
        <p><a href="${Endpoint.opml}${encodeURIComponent(savedEntry.key)}/download?key=${this.authKey}">Download Original</a></p>
        <p><a href="${Endpoint.opml}${encodeURIComponent(savedEntry.key)}/convert?key=${this.authKey}">Download Proxied</a></p>
        <p><a href="${Endpoint.opml}?key=${this.authKey}">Back to OPML Rewriter</a></p>
      `;
      return new Response(renderLayout("RSS THE PLANET: Saved", content), {
        headers: { "Content-Type": "text/html" },
        status: 200
      });
    }

    // 5. Parse and Rewrite
    const rewrittenOpml = this.rewriteOPML(opmlText);
    if (!rewrittenOpml) {
      return new Response("Invalid OPML/XML format", { status: 400 });
    }
    
    return new Response(rewrittenOpml, {
      headers: {
        "Content-Type": "text/x-opml",
        "Content-Disposition": `attachment; filename="rewritten_${file.name || 'feeds.opml'}"`
      }
    });
  }

  rewriteOPML(opmlText) {
    if (!this.authKey) return null;

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      preserveOrder: true
    });
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      preserveOrder: true,
      format: true
    });

    let jsonObj;
    try {
      jsonObj = parser.parse(opmlText);
    } catch (e) {
      console.error(`[OPMLService.rewriteOPML] XML Parse Error: ${e.message}`);
      return null;
    }

    const processNode = (nodes) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        const tagName = Object.keys(node).find(k => k !== ':@');
        if (!tagName) continue;

        if (tagName === 'opml' || tagName === 'body' || tagName === 'outline') {
            const children = node[tagName];
            
            if (tagName === 'outline' && node[':@']) {
                const attrs = node[':@'];
                if (attrs['@_xmlUrl']) {
                    const url = URL.parse(attrs['@_xmlUrl']);
                    if (url) {
                        attrs['@_xmlUrl'] = Codec.encode(url, Option.feed, this.baseURL, this.authKey).toString();
                    }
                }
                if (attrs['@_htmlUrl']) {
                    const url = URL.parse(attrs['@_htmlUrl']);
                    if (url) {
                        attrs['@_htmlUrl'] = Codec.encode(url, Option.auto, this.baseURL, this.authKey).toString();
                    }
                }
            }

            if (Array.isArray(children)) {
                processNode(children);
            }
        }
      }
    };

    processNode(jsonObj);
    return builder.build(jsonObj);
  }
}

