import { Service, Endpoint } from './service.js';
import { HTMLRewriter } from '../adapt/html-rewriter.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { renderProxySubmitForm, renderLoginForm } from '../ui/proxy.js';
import { renderUpdateActionScript } from '../ui/shared.js';

// MARK: ProxyService Class

export class ProxyService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.proxy);
  }
  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Endpoint.proxy, this.requestURL.origin);
    this.requestHeaders = ProxyService.sanitizedRequestHeaders(request.headers);
    this.requestMethod = request.method;
    this.targetURL = Codec.decode(this.requestURL) || URL.parse(this.requestURL.searchParams.get('url'));
    this.option = Option.getOption(this.requestURL.searchParams.get('option'));
  }
  
  async handleRequest() {
    try {
      if (!this.targetURL) return this.getSubmitForm();
      if (!this.authKey) {
        return renderError(401, 'The key parameter was missing or incorrect', this.requestURL.pathname);
      }

      let resolvedOption = this.option;
      if (resolvedOption === Option.auto) {
        console.log(`[ProxyService.handleRequest] autodetecting: ${this.targetURL.toString()}`);
        resolvedOption = await Option.fetchAutoOption(this.targetURL);
        console.log(`[ProxyService.handleRequest] autodetected: Option.${resolvedOption}`);
      }

      if (this.requestURL.searchParams.get('url')) return await this.getSubmitResult(resolvedOption);
      if (!resolvedOption) return renderError(502, 'The target could not be reached', this.targetURL.pathname);

      return await this.dispatchOption(resolvedOption);
    } catch (error) {
      console.error(`[ProxyService.handleRequest] error: ${error.message}`);
      return renderError(500, 'An internal server error occurred', this.requestURL.pathname);
    }
  }

  async dispatchOption(option) {
    if (option === Option.feed) return this.getFeed();
    if (option === Option.asset) return this.getAsset();
    if (option === Option.image) return this.getImage();
    if (option === Option.html) return this.getHTML();
    return renderError(400, 'Invalid proxy option requested', this.requestURL.pathname);
  }

  getSubmitForm() {
    const key = this.requestURL.searchParams.get('key') || '';
    const actionUrl = Endpoint.proxy + (key ? `?key=${key}` : '');
    const headExtras = renderUpdateActionScript(Endpoint.proxy);
    const content = this.authKey ? renderProxySubmitForm(key) : renderLoginForm(key, actionUrl);
    return new Response(renderLayout('RSS THE PLANET: Proxy', content, headExtras), {
      headers: { 'Content-Type': 'text/html' },
      status: 200
    });
  }

  async getSubmitResult(option) { 
    if (!(this.targetURL instanceof URL) || !(this.baseURL instanceof URL) || !this.authKey) {
      throw new Error('Parameter Error: targetURL, baseURL, authKey');
    }
    const encodedURL = Codec.encode(this.targetURL, option, this.baseURL, this.authKey);
    const bodyContent = `${encodedURL.toString()}`;
    const encodedBody = new TextEncoder().encode(bodyContent);
    return new Response(encodedBody, {
      headers: { 'Content-Type': 'text/plain', 'Content-Length': encodedBody.byteLength.toString() },
      status: 200
    });
  }

  async getFeed() { 
    this.validateParams();
    const headers = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    if (this.requestMethod !== 'GET') {
      return fetch(this.targetURL, { method: this.requestMethod, headers, redirect: 'follow' });
    }
    
    console.log(`[ProxyService.feed] rewrite-start: ${this.targetURL.toString()}`);
    try {
      const response = await fetch(this.targetURL, { method: this.requestMethod, headers, redirect: 'follow' });
      if (!response.ok) {
        console.error(`[ProxyService.feed] fetch() response(${response.status})`);
        return response;
      }
      
      const originalXML = await response.text();
      const rewrittenXML = await this.rewriteFeedXML(originalXML);
      const encodedXML = new TextEncoder().encode(rewrittenXML);
      const resHeaders = ProxyService.sanitizedResponseHeaders(response.headers);
      resHeaders.set('Content-Type', 'text/xml; charset=utf-8');
      resHeaders.set('Content-Length', encodedXML.byteLength.toString());
      resHeaders.set('Cache-Control', 'public, max-age=600');
      console.log(`[ProxyService.feed] rewrite-done: ${this.targetURL.toString()} size: ${encodedXML.byteLength.toString()}`);
      return new Response(encodedXML, { status: response.status, headers: resHeaders });
    } catch (error) {
      console.error(`[ProxyService.feed] error: ${error.message}`);
      return renderError(502, 'The target could not be reached', this.targetURL.pathname);
    }
  }

  validateParams() {
    if (!(this.targetURL instanceof URL) || !(this.baseURL instanceof URL) || !this.requestHeaders || !this.requestMethod || typeof this.authKey !== 'string') {
      throw new Error('Parameter Error');
    }
  }

  async getHTML() { 
    this.validateParams();
    const headers = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    if (this.requestMethod !== 'GET') {
      return fetch(this.targetURL, { method: this.requestMethod, headers, redirect: 'follow' });
    }
    
    console.log(`[ProxyService.html] rewrite-start: ${this.targetURL.toString()}`);
    try {
      const response = await fetch(this.targetURL, { method: this.requestMethod, headers, redirect: 'follow' });
      if (!response.ok) return response;
      const rewrittenResponse = await this.rewriteHTML(response);
      const resHeaders = ProxyService.sanitizedResponseHeaders(rewrittenResponse.headers);
      resHeaders.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(rewrittenResponse.body, { status: response.status, headers: resHeaders });
    } catch (error) {
      console.error(`[ProxyService.html] error: ${error.message}`);
      return renderError(502, 'The target could not be reached', this.targetURL.pathname);
    }
  }

  getAsset() { 
    this.validateParams();
    const headers = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    console.log(`[ProxyService.asset] passing through: ${this.targetURL.toString()}`);
    return fetch(this.targetURL, { method: this.requestMethod, headers, redirect: 'follow' });
  }

  getImage() { 
    this.validateParams();
    const headers = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    const wsrvURL = new URL('https://wsrv.nl/');
    wsrvURL.searchParams.set('url', this.targetURL.toString());
    wsrvURL.searchParams.set('w', '1024');
    wsrvURL.searchParams.set('h', '1024');
    wsrvURL.searchParams.set('fit', 'inside');
    wsrvURL.searchParams.set('we', '1');
    wsrvURL.searchParams.set('output', 'jpg');
    wsrvURL.searchParams.set('q', '75');
    console.log(`[ProxyService.image] resizing via wsrv.nl: ${this.targetURL.toString()}`);
    return fetch(wsrvURL, { headers });
  }

  async rewriteFeedXML(originalXML) {
    if (typeof originalXML !== 'string') throw new Error('Parameter Error');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, cdataPropName: '__cdata' });
    const builder = new XMLBuilder({ ignoreAttributes: false, format: false, suppressBooleanAttributes: false, suppressEmptyNode: true, cdataPropName: '__cdata' });
    
    let xml = parser.parse(originalXML);
    if (xml['?xml-stylesheet']) delete xml['?xml-stylesheet'];
    
    if (xml.rss?.channel) {
      await this.patchRSSChannel(xml.rss.channel);
    } else if (xml.feed) {
      await this.patchAtomFeed(xml.feed);
    }

    return builder.build(xml);
  }

  async patchRSSChannel(channel) {
    delete channel['itunes:new-feed-url'];
    await this.XML_encodeURL(channel['itunes:image'], '@_href', Option.image);    
    await this.XML_encodeURL(channel['atom:link'], '@_href', Option.feed, i => i['@_rel'] === 'self');
    await this.XML_encodeURL(channel.image, 'url', Option.image);
    await this.XML_encodeURL(channel.image, 'link', Option.auto);
    // TODO: See if this fixes rss icons not appearing
    // await this.XML_encodeURL(channel, 'link', Option.auto);
    
    let items = channel.item || [];
    if (!Array.isArray(items)) items = [items];
    channel.item = items.slice(0, 30);
    for (const item of channel.item) {
      await this.XML_encodeURL(item, 'link', Option.auto);
      await this.XML_encodeURL(item['itunes:image'], '@_href', Option.image);
      await this.XML_encodeURL(item.enclosure, '@_url', Option.asset);
      await this.XML_encodeURL(item['media:content'], '@_url', Option.asset);
      await this.XML_rewriteEntryHTML(item);
    }
  }

  async patchAtomFeed(feed) {
    let links = feed.link || [];
    if (!Array.isArray(links)) links = [links];
    feed.link = links;
    for (const link of links) {
      const url = URL.parse(link['@_href']);
      if (!url) continue;
      const opt = this.getAtomLinkOption(link);
      link['@_href'] = Codec.encode(url, opt, this.baseURL, this.authKey).toString();
    }
    
    await this.XML_encodeURL(feed, 'logo', Option.image);
    await this.XML_encodeURL(feed, 'icon', Option.image);
    
    let entries = feed.entry || [];
    if (!Array.isArray(entries)) entries = [entries];
    feed.entry = entries.slice(0, 30);
    for (const entry of feed.entry) {
      await this.patchAtomEntry(entry);
    }
  }

  getAtomLinkOption(link) {
    const type = String(link['@_type'] || '').toLowerCase();
    const rel = String(link['@_rel'] || '').toLowerCase();
    
    if (type.includes('html')) return Option.html;
    if (type.includes('audio')) return Option.asset;
    if (type.includes('image')) return Option.image;
    if (rel.includes('self') || /xml|rss|atom/.test(type)) return Option.feed;
    
    return Option.auto;
  }

  async patchAtomEntry(entry) {
    let links = entry.link || [];
    if (!Array.isArray(links)) links = [links];
    entry.link = links;
    for (const link of links) {
      const url = URL.parse(link['@_href']);
      if (!url) continue;
      const opt = this.getAtomLinkOption(link);
      link['@_href'] = Codec.encode(url, opt, this.baseURL, this.authKey).toString();
    }
    await this.XML_rewriteEntryHTML(entry);
  }

  async XML_rewriteEntryHTML(entry) {
    const fields = ['description', 'content:encoded', 'content', 'summary'];
    for (const field of fields) {
      if (!entry[field]) continue;
      const val = entry[field];
      const original = (typeof val === 'object' && val.__cdata) ? val.__cdata : val;
      const rewritten = await this.rewriteHTMLString(original);
      if (typeof val === 'object' && val.__cdata) val.__cdata = rewritten;
      else entry[field] = rewritten;
    }
  }

  async XML_encodeURL(parent, key, option, where) {
    if (!parent) return;
    if (Array.isArray(parent)) {
      for (const item of parent) await this.XML_encodeURL(item, key, option, where);
      return;
    }
    this.XML_encodeSingleURL(parent, key, option, where);
  }

  XML_encodeSingleURL(parent, key, option, where) {
    const target = parent[key];
    if (!target || (where && !where(parent))) return;
    const raw = (typeof target === 'object' && target.__cdata) ? target.__cdata : target;
    if (typeof raw !== 'string') return;
    const url = URL.parse(raw.trim());
    if (!url) return;
    const final = Codec.encode(url, option, this.baseURL, this.authKey).toString();
    if (typeof target === 'object' && '__cdata' in target) {
      target.__cdata = final;
    } else {
      parent[key] = final;
    }
  }

  async rewriteHTMLString(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return htmlString;
    const transformed = await this.rewriteHTML(new Response(htmlString));
    return await transformed.text();
  }

  async rewriteHTML(response) { 
    const removeScripts = new HTMLRewriter()
      .on('script', { element: el => el.remove() })
      .on('noscript', { element: el => el.removeAndKeepContent() })
      .transform(response);
    
    const rewriter = new HTMLRewriter()
      .on('a', { element: el => this.rewriteAttr(el, 'href', Option.auto) })
      .on('*', { element: el => this.removeOnAttrs(el) })
      .on('img', { element: el => this.rewriteAttr(el, 'src', Option.image) })
      .on('video, audio, source', { element: el => this.rewriteAttr(el, 'src', Option.asset) })
      .on('link[rel="stylesheet"]', { element: el => this.rewriteAttr(el, 'href', Option.asset) })
      .on('img, source', { element: el => this.handleSrcset(el) });

    return rewriter.transform(removeScripts);
  }

  rewriteAttr(el, attr, option) {
    const val = el.getAttribute(attr);
    if (val) {
      const target = URL.parse(val, this.targetURL);
      if (target) {
        el.setAttribute(attr, Codec.encode(target, option, this.baseURL, this.authKey).toString());
      }
    }
  }

  removeOnAttrs(el) {
    for (const [name] of el.attributes) {
      if (name.startsWith('on')) el.removeAttribute(name);
    }
  }

  handleSrcset(el) {
    const srcset = el.getAttribute('srcset');
    if (!srcset) return;
    const candidates = srcset.split(',').map(entry => {
      const parts = entry.trim().split(/\s+/);
      const width = parts[1] && parts[1].endsWith('w') ? parseInt(parts[1].slice(0, -1), 10) : 0;
      return { url: parts[0], width };
    });

    const suitable = candidates.filter(c => c.width > 0 && c.width <= 1000).sort((a, b) => b.width - a.width);
    const winner = suitable.length > 0 ? suitable[0] : candidates[0];
    if (winner?.url) {
      const target = URL.parse(winner.url, this.targetURL);
      if (target) {
        el.setAttribute('src', Codec.encode(target, Option.image, this.baseURL, this.authKey).toString());
      }
    }
    el.removeAttribute('srcset');
    el.removeAttribute('sizes');
  }

  static sanitizedRequestHeaders(incomingHeaders) {
    const forbidden = ['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'if-none-match', 'if-modified-since'];
    const headers = new Headers();
    for (const [key, value] of incomingHeaders.entries()) {
      if (!forbidden.includes(key.toLowerCase())) headers.set(key, value);
    }
    if (!headers.has('user-agent')) headers.set('User-Agent', 'Overcast/3.0 (+http://overcast.fm/; iOS podcast app)');
    return headers;
  }

  static sanitizedResponseHeaders(incomingHeaders) {
    const forbidden = [
      'content-length',
      'content-encoding',
      'transfer-encoding',
      'connection',
      'keep-alive',
      'content-security-policy-report-only',
      'content-security-policy',
    ];

    const headers = new Headers();
    for (const [key, value] of incomingHeaders.entries()) {
      if (!forbidden.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    return headers;
  }
}
