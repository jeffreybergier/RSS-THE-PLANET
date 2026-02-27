import { Service, Endpoint } from './service.js';
import { Auth } from '../lib/auth.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue } from '../adapt/kvs.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as UI from '../ui/opml.js';
import { renderUpdateActionScript } from '../ui/shared.js';

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
    const opmlIndex = pathComponents.indexOf('opml');
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
        this.kvs = new KVSAdapter(this.env, 'OPML', this.authKey);
      }

      if (this.request.method === 'POST') {
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
      console.error(`[OPMLService.handleRequest] error: ${error.message}`);
      return renderError(500, 'An internal server error occurred', this.requestURL.pathname);
    }
  }

  async handleDelete() {
    if (!this.authKey || !this.kvs) {
      return renderError(401, 'The key parameter was missing or incorrect', this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, 'File ID is required', this.requestURL.pathname);
    }

    try {
      await this.kvs.delete(id);
    } catch (e) {
      console.error(`[OPMLService.handleDelete] error: ${e.message}`);
      return renderError(400, 'Could not delete file', this.requestURL.pathname);
    }

    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${Endpoint.opml}?key=${this.authKey}`
      }
    });
  }

  async handleConvert() {
    if (!this.authKey) {
      return renderError(401, 'The key parameter was missing or incorrect', this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, 'File ID is required', this.requestURL.pathname);
    }

    const entry = await this.kvs.get(id);
    if (!entry) {
      return renderError(404, 'File not found or unauthorized', this.requestURL.pathname);
    }

    const rewrittenOpml = this.rewriteOPML(entry.value, this.authKey);
    if (!rewrittenOpml) {
      return renderError(500, 'Failed to rewrite OPML', this.requestURL.pathname);
    }

    const encodedOPML = new TextEncoder().encode(rewrittenOpml);
    return new Response(encodedOPML, {
      headers: {
        'Content-Type': 'text/x-opml',
        'Content-Disposition': `attachment; filename="proxied_${entry.name}"`,
        'Content-Length': encodedOPML.byteLength.toString()
      },
      status: 200
    });
  }

  async handleDownload() {
    if (!this.authKey) {
      return renderError(401, 'The key parameter was missing or incorrect', this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, 'File ID is required', this.requestURL.pathname);
    }

    const entry = await this.kvs.get(id);
    if (!entry) {
      return renderError(404, 'File not found or unauthorized', this.requestURL.pathname);
    }

    const encodedOPML = new TextEncoder().encode(entry.value);
    return new Response(encodedOPML, {
      headers: {
        'Content-Type': 'text/x-opml',
        'Content-Disposition': `attachment; filename="${entry.name}"`,
        'Content-Length': encodedOPML.byteLength.toString()
      },
      status: 200
    });
  }

  async getSubmitForm() {
    const key = this.requestURL.searchParams.get('key') || '';
    const actionUrl = Endpoint.opml + (key ? `?key=${key}` : '');
    const headExtras = renderUpdateActionScript(Endpoint.opml);

    let content;
    if (this.authKey) {
      const entries = await this.kvs.list();
      const table = UI.renderFileTable(entries, this.authKey);
      content = UI.renderDashboardForm(key, actionUrl, table);
    } else {
      content = UI.renderLoginForm(key, actionUrl);
    }

    return new Response(renderLayout('RSS THE PLANET: OPML Rewriter', content, headExtras), {
      headers: { 'Content-Type': 'text/html' },
      status: 200
    });
  }

  async handlePost() {
    if (!this.authKey) {
      return renderError(401, 'The key parameter was missing or incorrect', this.requestURL.pathname);
    }

    let formData;
    try {
      formData = await this.request.formData();
    } catch (e) {
      console.error(`[OPMLService.handlePost] error reading formData: ${e.message}`);
      return new Response('Invalid form data', { status: 400 });
    }

    const file = formData.get('opml');
    if (!file || typeof file === 'string' || file.size === 0) {
      console.log('[OPMLService.handlePost] No file provided');
      return new Response('No OPML file provided', { status: 400 });
    }

    const opmlText = await file.text();
    console.log(`[OPMLService.handlePost] Processing file: ${file.name} size: ${file.size}`);
    
    if (formData.get('mode') === 'save') {
      return await this.handleSaveMode(file.name || 'feeds.opml', opmlText);
    }
    return this.handleRewriteMode(file.name || 'feeds.opml', opmlText);
  }

  async handleSaveMode(filename, opmlText) {
    try {
      const entry = new KVSValue(null, filename, opmlText, 'OPML', this.authKey);
      const saved = await this.kvs.put(entry);
      if (!saved) throw new Error('Failed to save OPML');
      
      const content = UI.renderSaveConfirmation(filename, saved.key, this.authKey);
      return new Response(renderLayout('RSS THE PLANET: Saved', content), {
        headers: { 'Content-Type': 'text/html' },
        status: 200
      });
    } catch (e) {
      console.error(`[OPMLService.handleSaveMode] error: ${e.message}`);
      return renderError(500, 'Failed to save OPML', this.requestURL.pathname);
    }
  }

  handleRewriteMode(filename, opmlText) {
    const rewritten = this.rewriteOPML(opmlText);
    if (!rewritten) {
      return new Response('Invalid OPML/XML format', { status: 400 });
    }
    
    const encoded = new TextEncoder().encode(rewritten);
    return new Response(encoded, {
      headers: {
        'Content-Type': 'text/x-opml',
        'Content-Disposition': `attachment; filename="rewritten_${filename}"`,
        'Content-Length': encoded.byteLength.toString()
      }
    });
  }

  rewriteOPML(opmlText) {
    if (!this.authKey) return null;

    const options = { ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: true };
    const parser = new XMLParser(options);
    const builder = new XMLBuilder({ ...options, format: true });

    try {
      const jsonObj = parser.parse(opmlText);
      this.processNode(jsonObj);
      return builder.build(jsonObj);
    } catch (e) {
      console.error(`[OPMLService.rewriteOPML] error: ${e.message}`);
      return null;
    }
  }

  processNode(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const tagName = Object.keys(node).find(k => k !== ':@');
      if (!tagName || !['opml', 'body', 'outline'].includes(tagName)) {
        continue;
      }

      if (tagName === 'outline' && node[':@']) {
        this.rewriteAttributes(node[':@']);
      }

      if (Array.isArray(node[tagName])) {
        this.processNode(node[tagName]);
      }
    }
  }

  rewriteAttributes(attrs) {
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
}
