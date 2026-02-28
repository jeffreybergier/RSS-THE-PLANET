import { Service, Endpoint } from './service.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue } from '../adapt/kvs.js';
import { XMLBuilder } from 'fast-xml-parser';
import * as Crypto from '../adapt/crypto.js';
import * as UI from '../ui/masto.js';
import { renderUpdateActionScript } from '../ui/shared.js';

const stripTags = (html) => {
  if (!html) return '';
  let res = '';
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<') inTag = true;
    else if (html[i] === '>') inTag = false;
    else if (!inTag) res += html[i];
  }
  return res;
};

// MARK: MastoService Class

export class MastoService extends Service {
  static canHandle(request) {
    return new URL(request.url).pathname.startsWith(Endpoint.masto);
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Endpoint.proxy, this.requestURL.origin);
    const path = this.requestURL.pathname.split('/');
    const idx = path.indexOf('masto');
    if (idx !== -1 && path[idx + 1]) {
      this.uuid = path[idx + 1];
      this.type = path[idx + 2] || null;
      this.subtype = path[idx + 3] || null;
    }

    this.kvs = null;
    if (this.authKey) {
      this.request.env = this.env;
      this.kvs = new KVSAdapter(this.env, 'MASTO', this.authKey, new Crypto.SHA256(this.request));
    }
  }

  async handleRequest() {
    try {
      if (!this.authKey && this.request.method === 'POST') return await this.handlePost(null, null);

      if (this.request.method === 'POST') return await this.handlePost(this.authKey, this.kvs);
      if (this.type === 'delete') return await this.handleDelete(this.authKey, this.kvs);
      if (this.type === 'status' || this.type === 'notifications') return await this.handleStatus(this.authKey, this.kvs);

      return await this.getSubmitForm(this.authKey, this.kvs);
    } catch (e) {
      console.error(`[MastoService.handleRequest] error: ${e.message}`);
      return renderError(500, 'Internal server error', this.requestURL.pathname);
    }
  }

  async handleDelete(authKey, kvs) {
    if (!authKey || !kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    if (!this.uuid) return renderError(400, 'ID required', this.requestURL.pathname);
    try {
      await kvs.delete(this.uuid);
    } catch (e) {
      console.error(`[MastoService.handleDelete] error: ${e.message}`);
      return renderError(400, 'Delete failed', this.requestURL.pathname);
    }
    return new Response(null, { status: 302, headers: { 'Location': `${Endpoint.masto}?key=${authKey}` } });
  }

  async handleStatus(authKey, kvs) {
    const err = this.validateStatusRequest(authKey, kvs);
    if (err) return err;

    const entry = await kvs.get(this.uuid);
    if (!entry || !entry.value) {
      return renderError(entry ? 500 : 404, entry ? 'Decryption failed' : 'Not found', this.requestURL.pathname);
    }

    const mode = this.type === 'notifications' ? 'notifications' : this.subtype;
    const apiPath = await this.getAPIPath(mode, entry.name, entry.value);
    if (apiPath instanceof Response) return apiPath;

    const all = await this.fetchStatuses(apiPath, entry.name, entry.value, mode);
    if (all instanceof Response) return all;

    return this.renderRSSResponse(all, mode, authKey, entry.name);
  }

  validateStatusRequest(authKey, kvs) {
    if (!authKey || !kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    if (!this.uuid) return renderError(400, 'ID required', this.requestURL.pathname);
    if (!this.subtype && this.type !== 'notifications') return renderError(400, 'Invalid Request', this.requestURL.pathname);
    return null;
  }

  renderRSSResponse(all, mode, authKey, serverName) {
    const rss = mode === 'notifications' 
      ? this.convertNotificationsJSONtoRSS(all, authKey, serverName) 
      : this.convertJSONtoRSS(all, mode, authKey, serverName);
    const encoded = new TextEncoder().encode(rss);
    const headers = { 
      'Content-Type': 'text/xml; charset=utf-8', 
      'Content-Length': encoded.byteLength.toString(), 
      'Cache-Control': 'public, max-age=600' 
    };
    return new Response(encoded, { headers });
  }

  async getAPIPath(mode, server, apiKey) {
    if (mode === 'home') return '/api/v1/timelines/home';
    if (mode === 'local') return '/api/v1/timelines/public?local=true';
    if (mode === 'user') return this.getUserAPIPath(server, apiKey);
    if (mode === 'notifications' && this.type === 'notifications') return '/api/v1/notifications';
    return renderError(400, 'Invalid status type', this.requestURL.pathname);
  }

  async getUserAPIPath(server, apiKey) {
    const res = await fetch(new URL('/api/v1/accounts/verify_credentials', server), { 
      headers: { 'Authorization': `Bearer ${apiKey}` } 
    });
    if (!res.ok) return res;
    const me = await res.json();
    return `/api/v1/accounts/${me.id}/statuses`;
  }

  async fetchStatuses(apiPath, server, apiKey, mode) {
    let all = [], maxId = null, attempts = 0;
    const maxAttempts = (mode === 'home') ? 3 : 1;
    while (all.length < 100 && attempts < maxAttempts) {
      const url = new URL(apiPath, server);
      if (maxId) url.searchParams.set('max_id', maxId);
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (!res.ok) return all.length > 0 ? all : res;
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) break;
      all = all.concat(json);
      maxId = json[json.length - 1].id;
      attempts++;
    }
    return all.slice(0, 100);
  }

  convertNotificationsJSONtoRSS(json, authKey, serverUrl) {
    if (!Array.isArray(json)) return '';
    const hostname = new URL(serverUrl).hostname;
    const items = json.map(n => this.mapNotificationToRSS(n, authKey, hostname));
    return this.buildRSS(items, `${hostname} - Notifications`, serverUrl);
  }

  mapNotificationToRSS(notif, authKey, hostname) {
    const { type, account, status } = notif;
    const name = account.display_name || account.username;
    const proxiedAvatar = this.proxyURL(account.avatar, Option.image, authKey);
    const triggerer = UI.renderTriggererSignature(account, hostname, proxiedAvatar);
    const content = status ? this.formatStatusContent(status, authKey, hostname) : '';
    const html = status ? `<div>${triggerer}<hr>${content}</div>` : `<div>${triggerer}</div>`;
    
    return {
      title: this.getNotificationTitle(type, name, status),
      link: this.wrapBrutaldon(status?.url || account.url),
      guid: { '@_isPermaLink': 'true', '#text': `${notif.id}-${type}` },
      pubDate: new Date(notif.created_at).toUTCString(),
      description: { '__cdata': html },
      'dc:creator': this.formatAccountName(account, hostname),
      'dc:language': status?.language || 'en'
    };
  }

  getNotificationTitle(type, name, status) {
    const titles = {
      mention: `💬 Mention from ${name}`,
      reblog: `🔁 Boosted by ${name}`,
      favourite: `⭐ Favorited by ${name}`,
      follow: `👤 Followed by ${name}`,
      follow_request: `🔒 Follow request from ${name}`,
      poll: `🗳️ Poll finished: ${status?.content?.substring(0, 30)}...`,
      status: `🔔 Post from ${name}`,
      update: `📝 Post edited by ${name}`
    };
    return titles[type] || `🔔 ${type} from ${name}`;
  }

  convertJSONtoRSS(json, subtype, authKey, serverUrl) {
    if (!Array.isArray(json)) return '';
    const hostname = new URL(serverUrl).hostname;
    const items = json.map(s => this.mapStatusToRSS(s, authKey, hostname));
    const title = `${hostname} - ${subtype.charAt(0).toUpperCase() + subtype.slice(1)}`;
    return this.buildRSS(items, title, serverUrl);
  }

  mapStatusToRSS(status, authKey, hostname) {
    const data = status.reblog || status;
    return {
      title: this.getStatusTitle(status),
      link: this.wrapBrutaldon(data.url),
      guid: { '@_isPermaLink': 'true', '#text': data.url },
      pubDate: new Date(data.created_at).toUTCString(),
      description: { '__cdata': this.formatStatusContent(data, authKey, hostname) },
      'dc:creator': this.formatAccountName(data.account, hostname),
      'dc:language': data.language || 'en'
    };
  }

  getStatusTitle(status) {
    if (status.reblog) {
      const booster = status.account.display_name || status.account.username;
      return `🚀 by ${booster}`;
    }
    const data = status;
    const author = data.account;
    if (data.in_reply_to_id) {
      const mentions = data.mentions || [];
      const replyTo = mentions.find(m => m.id === data.in_reply_to_account_id) || (data.in_reply_to_account_id === author.id ? author : null);
      const target = replyTo ? (replyTo.display_name || replyTo.username) : 'Post';
      return `↩️ to ${target}`;
    }
    return this.getOriginalStatusTitle(data);
  }

  getOriginalStatusTitle(data) {
    const types = [];
    if (stripTags(data.content).trim().length > 0) types.push('💬');
    
    const media = data.media_attachments || [];
    if (media.some(m => m.type === 'image')) types.push('📷');
    if (media.some(m => m.type === 'video' || m.type === 'gifv')) types.push('📹');

    if (this.hasLinks(data)) types.push('🔗');
    
    const name = data.account.display_name || data.account.username;
    return `${types.join('・') || '💬'} from ${name}`;
  }

  hasLinks(data) {
    const linkCount = (data.content?.match(/<a /g) || []).length;
    const mentions = (data.mentions || []).length;
    const tags = (data.tags || []).length;
    return data.card || linkCount > (mentions + tags);
  }

  buildRSS(items, title, serverUrl) {
    const rssObj = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      rss: {
        '@_version': '2.0',
        '@_xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@_xmlns:atom': 'http://www.w3.org/2005/Atom',
        '@_xmlns:sy': 'http://purl.org/rss/1.0/modules/syndication/',
        channel: {
          title, link: serverUrl, description: 'RSS-THE-PLANET Mastodon Feed',
          'sy:updatePeriod': 'hourly', 'sy:updateFrequency': '1', language: 'en-us',
          lastBuildDate: new Date().toUTCString(), generator: 'RSS-THE-PLANET', item: items
        }
      }
    };
    const options = { ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true, cdataPropName: '__cdata' };
    return new XMLBuilder(options).build(rssObj);
  }

  async handlePost(authKey, kvs) {
    if (!authKey || !kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    try {
      const formData = await this.request.formData();
      const server = formData.get('server'), apiKey = formData.get('apiKey');
      if (!server || !apiKey) return new Response('Server and API Key required', { status: 400 });
      const saved = await kvs.put(new KVSValue(null, server, apiKey, 'MASTO', authKey));
      if (!saved) throw new Error('KVS Put failed');
      return new Response(null, { status: 302, headers: { 'Location': `${Endpoint.masto}?key=${authKey}` } });
    } catch (e) {
      console.error(`[MastoService.handlePost] error: ${e.message}`);
      return renderError(500, 'Save failed', this.requestURL.pathname);
    }
  }

  proxyURL(url, option, authKey) {
    try { return Codec.encode(new URL(url), option, this.baseURL, authKey).toString(); }
    catch { return url; }
  }

  formatAccountName(account, hostname) {
    if (!account) return 'Unknown';
    const handle = account.acct.includes('@') ? account.acct : `${account.acct}@${hostname}`;
    return `${account.display_name || account.username} (${handle})`;
  }

  wrapBrutaldon(url) {
    return url ? `https://brutaldon.org/search_results?q=${encodeURIComponent(url)}` : url;
  }

  formatStatusContent(data, authKey, hostname) {
    let html = `<div><div>${data.content}</div>`;
    if (data.media_attachments?.length > 0) {
      html += '<div class="media">';
      data.media_attachments.forEach(m => { html += this.formatMedia(m, authKey); });
      html += '</div>';
    }
    const proxiedAvatar = this.proxyURL(data.account.avatar, Option.image, authKey);
    const footer = UI.renderStatusFooter(data, data.account, hostname, proxiedAvatar);
    return html + footer + '</div>';
  }

  formatMedia(m, authKey) {
    try {
      const alt = m.description || '';
      if (m.type === 'image') return this.renderImage(m, alt, authKey);
      if (m.type === 'video' || m.type === 'gifv') return this.renderVideo(m, authKey);
      return this.renderAttachmentLink(m, alt, authKey);
    } catch (e) {
      console.error(`[MastoService.formatMedia] error: ${e.message}`);
      return `<p><a href="${m.url}">View ${m.type} attachment</a></p>`;
    }
  }

  renderImage(m, alt, authKey) {
    const src = this.proxyURL(m.url, Option.image, authKey);
    return `<p><img src="${src}" alt="${alt}"></p>`;
  }

  renderVideo(m, authKey) {
    const pUrl = m.preview_url ? this.proxyURL(m.preview_url, Option.image, authKey) : null;
    const poster = pUrl ? 'poster="' + pUrl + '"' : '';
    const src = this.proxyURL(m.url, Option.asset, authKey);
    return `<p><video controls playsinline loop ${poster} src="${src}"></video></p>`;
  }

  renderAttachmentLink(m, alt, authKey) {
    const aSrc = this.proxyURL(m.url, Option.auto, authKey);
    const title = alt ? 'View ' + m.type + ': ' + alt : 'View ' + m.type + ' attachment';
    return `<p><a href="${aSrc}">${title}</a></p>`;
  }

  async getSubmitForm(authKey, kvs) {
    const key = this.requestURL.searchParams.get('key') || '';
    const actionUrl = Endpoint.masto + (key ? `?key=${key}` : '');
    const headExtras = renderUpdateActionScript(Endpoint.masto);
    let content;
    if (!authKey) {
      content = UI.renderLoginForm(key, actionUrl);
    } else {
      const entries = await kvs.list();
      const rows = this.renderServerRows(entries, authKey);
      content = UI.renderDashboardForm(key, actionUrl, rows);
    }
    return new Response(renderLayout('RSS THE PLANET: Mastodon', content, headExtras), { headers: { 'Content-Type': 'text/html' }, status: 200 });
  }

  renderServerRows(entries, authKey) {
    if (entries.length === 0) return '<tr class="empty-state"><td colspan="3">No Mastodon Servers Saved.</td></tr>';
    return entries.map(f => UI.renderServerTableRow(f, authKey)).join('');
  }
}
