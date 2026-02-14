import { Service } from './service.js';
import * as Auth from '../lib/auth.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter } from '../adapt/kvs.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// MARK: OPMLService Class

export class OPMLService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Auth.OPML_VALID_PATH);
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Auth.PROXY_VALID_PATH, this.requestURL.origin);
    this.authorizedAPIKey = ProxyService_getAuthorizedAPIKey(this.requestURL.searchParams.get('key'));
    this.kvs = new KVSAdapter(env);
  }

  async handleRequest() {
    try {
      if (this.request.method === "POST") {
        return await this.handlePost();
      }
      
      const action = this.requestURL.searchParams.get('action');
      if (action === 'download') {
        return await this.handleDownload();
      }
      if (action === 'convert') {
        return await this.handleConvert();
      }

      return await this.getSubmitForm();
    } catch (error) {
      console.error(`[OPMLService.handleRequest] Internal Error: ${error.message}`);
      return renderError(500, "An internal server error occurred", this.requestURL.pathname);
    }
  }

  async handleConvert() {
    if (!this.authorizedAPIKey) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.requestURL.searchParams.get('id');
    if (!id) {
      return renderError(400, "File ID is required", this.requestURL.pathname);
    }

    const key = `OPML::${id}`;
    const { value: content, metadata } = await this.kvs.getWithMetadata(key);
    
    if (!content) {
      return renderError(404, "File not found", this.requestURL.pathname);
    }

    if (metadata?.key && metadata.key !== this.authorizedAPIKey) {
      return renderError(401, "You do not have permission to access this file", this.requestURL.pathname);
    }

    const name = metadata?.filename || 'download.opml';

    const rewrittenOpml = this.rewriteOPML(content, this.authorizedAPIKey);
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
    if (!this.authorizedAPIKey) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.requestURL.searchParams.get('id');
    if (!id) {
      return renderError(400, "File ID is required", this.requestURL.pathname);
    }

    const key = `OPML::${id}`;
    const { value: content, metadata } = await this.kvs.getWithMetadata(key);
    
    if (!content) {
      return renderError(404, "File not found", this.requestURL.pathname);
    }

    if (metadata?.key && metadata.key !== this.authorizedAPIKey) {
      return renderError(401, "You do not have permission to access this file", this.requestURL.pathname);
    }

    const name = metadata?.filename || 'download.opml';

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
    const actionUrl = Auth.OPML_VALID_PATH + (key ? `?key=${key}` : '');

    const headExtras = `
      <script>
        function updateAction() {
          const key = document.getElementById('key').value;
          const form = document.getElementById('opml-form');
          const baseUrl = "${Auth.OPML_VALID_PATH}";
          form.action = baseUrl + (key ? '?key=' + encodeURIComponent(key) : '');
          
          // Update download links
          const links = document.querySelectorAll('.download-link');
          links.forEach(link => {
            const id = link.getAttribute('data-id');
            const action = link.getAttribute('data-action');
            link.href = baseUrl + '?action=' + action + '&id=' + encodeURIComponent(id) + (key ? '&key=' + encodeURIComponent(key) : '');
          });
        }
      </script>
    `;

    let content = '';

    if (!this.authorizedAPIKey) {
      content = `
        <h2>RSS THE PLANET: OPML Rewriter</h2>
        <p>Please enter your API Key to access the OPML Rewriter.</p>
        <form id="opml-form" action="${actionUrl}" method="GET">
          <p>
            <label for="key">API Key:</label><br>
            <div class="input-group">
              <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
              <button type="button" class="secondary" onclick="window.location.href='${Auth.OPML_VALID_PATH}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
            </div>
          </p>
        </form>
      `;
    } else {
      const list = await this.kvs.list({ prefix: "OPML::" });
      // Sort by filename (metadata) or ID if missing
      const files = list.keys
        .filter(k => k.metadata?.key === this.authorizedAPIKey)
        .map(k => ({
          id: k.name.replace("OPML::", ""),
          name: k.metadata?.filename || k.name.replace("OPML::", "")
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      let tableRows = '';
      if (files.length === 0) {
        tableRows = `<tr class="empty-state"><td colspan="3">No OPML Files Saved.</td></tr>`;
      } else {
        tableRows = files.map(f => `
          <tr>
            <td class="id-col">${f.id}</td>
            <td><strong>${f.name}</strong></td>
            <td class="actions">
              <a href="${Auth.OPML_VALID_PATH}?action=download&id=${encodeURIComponent(f.id)}&key=${this.authorizedAPIKey}" 
                 class="download-link action-link" 
                 data-id="${f.id}"
                 data-action="download">Original</a>
              <a href="${Auth.OPML_VALID_PATH}?action=convert&id=${encodeURIComponent(f.id)}&key=${this.authorizedAPIKey}" 
                 class="download-link action-link primary" 
                 data-id="${f.id}"
                 data-action="convert">Convert</a>
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
              <button type="button" class="secondary" onclick="window.location.href='${Auth.OPML_VALID_PATH}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
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
    // 1. Get the data
    let formData;
    try {
      formData = await this.request.formData();
    } catch (e) {
      console.error(`[OPMLService.handlePost] Error reading formData: ${e.message}`);
      return new Response("Invalid form data", { status: 400 });
    }

    // 2. Extract and validate API Key
    // Try Body first, then Search Params
    const apiKeyBody = formData.get('key');
    const apiKeyURL = this.requestURL.searchParams.get('key');
    const apiKey = (apiKeyBody && typeof apiKeyBody === 'string' && apiKeyBody.length > 0) 
                 ? apiKeyBody 
                 : apiKeyURL;

    const authorizedAPIKey = ProxyService_getAuthorizedAPIKey(apiKey);

    if (!authorizedAPIKey) {
      console.log(`[OPMLService.handlePost] Unauthorized: keySource(${apiKeyBody ? 'body' : (apiKeyURL ? 'url' : 'none')}) key(${apiKey})`);
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
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
      const uuid = crypto.randomUUID();
      const key = `OPML::${uuid}`;
      
      await this.kvs.put(key, opmlText, { 
        allowOverwrite: true,
        metadata: { 
          filename,
          key: authorizedAPIKey 
        }
      });
      
      const content = `
        <h2>File Saved</h2>
        <p>The file <strong>${filename}</strong> has been saved to the store.</p>
        <p>ID: ${uuid}</p>
        <p><a href="${Auth.OPML_VALID_PATH}?key=${authorizedAPIKey}">Back to OPML Rewriter</a></p>
      `;
      return new Response(renderLayout("RSS THE PLANET: Saved", content), {
        headers: { "Content-Type": "text/html" },
        status: 200
      });
    }

    // 5. Parse and Rewrite
    const rewrittenOpml = this.rewriteOPML(opmlText, authorizedAPIKey);
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

  rewriteOPML(opmlText, authorizedAPIKey) {
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
                        attrs['@_xmlUrl'] = Codec.encode(url, Option.feed, this.baseURL, authorizedAPIKey).toString();
                    }
                }
                if (attrs['@_htmlUrl']) {
                    const url = URL.parse(attrs['@_htmlUrl']);
                    if (url) {
                        attrs['@_htmlUrl'] = Codec.encode(url, Option.auto, this.baseURL, authorizedAPIKey).toString();
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

function ProxyService_getAuthorizedAPIKey(apiKey) {
  if (!apiKey) return null;
  return Auth.VALID_KEYS.has(apiKey) ? apiKey : null;
}
