import { Service } from './service.js';
import * as Auth from '../lib/auth.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
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
  }

  async handleRequest() {
    try {
      if (this.request.method === "POST") {
        return await this.handlePost();
      }
      return this.getSubmitForm();
    } catch (error) {
      console.error(`[OPMLService.handleRequest] Internal Error: ${error.message}`);
      return renderError(500, "An internal server error occurred", this.requestURL.pathname);
    }
  }

  getSubmitForm() {
    const key = this.requestURL.searchParams.get('key') || '';
    const actionUrl = Auth.OPML_VALID_PATH + (key ? `?key=${key}` : '');

    const headExtras = `
      <script>
        function updateAction() {
          const key = document.getElementById('key').value;
          const form = document.getElementById('opml-form');
          const baseUrl = "${Auth.OPML_VALID_PATH}";
          form.action = baseUrl + (key ? '?key=' + encodeURIComponent(key) : '');
        }
      </script>
    `;

    const content = `
      <h2>RSS THE PLANET: OPML Rewriter</h2>
      <p>Upload an OPML file to rewrite all feed URLs through this proxy.</p>
      <form id="opml-form" action="${actionUrl}" method="POST" enctype="multipart/form-data">
        <p>
          <label for="key">API Key (if not in URL):</label>
          <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
        </p>
        <p>
          <label for="opml">OPML File:</label>
          <input type="file" id="opml" name="opml" accept=".opml,.xml">
        </p>
        <p>
          <button type="submit">Rewrite OPML</button>
        </p>
      </form>
    `;

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
    
    // 4. Parse and Rewrite
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
      console.error(`[OPMLService.handlePost] XML Parse Error: ${e.message}`);
      return new Response("Invalid OPML/XML format", { status: 400 });
    }

    // OPML structure is usually <opml><body><outline>...
    // With preserveOrder: true, the structure is an array of objects
    const processNode = (nodes) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        // Find the tag name (ignoring the attributes key ':@')
        const tagName = Object.keys(node).find(k => k !== ':@');
        if (!tagName) continue;

        if (tagName === 'opml' || tagName === 'body' || tagName === 'outline') {
            const children = node[tagName];
            
            // Check attributes of the current node if it's an outline
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

            // Recurse into children
            if (Array.isArray(children)) {
                processNode(children);
            }
        }
      }
    };

    processNode(jsonObj);

    const rewrittenOpml = builder.build(jsonObj);
    
    return new Response(rewrittenOpml, {
      headers: {
        "Content-Type": "text/x-opml",
        "Content-Disposition": `attachment; filename="rewritten_${file.name || 'feeds.opml'}"`
      }
    });
  }
}

function ProxyService_getAuthorizedAPIKey(apiKey) {
  if (!apiKey) return null;
  return Auth.VALID_KEYS.has(apiKey) ? apiKey : null;
}
