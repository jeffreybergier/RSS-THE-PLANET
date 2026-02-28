import { Service, Endpoint } from './service.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue } from '../adapt/kvs.js';
import * as UI from '../ui/youtube.js';
import { renderUpdateActionScript } from '../ui/shared.js';
import { XMLBuilder } from 'fast-xml-parser';

// MARK: YouTubeService Class

export class YouTubeService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.youtube) || url.pathname.startsWith('/callback/');
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Endpoint.proxy, this.requestURL.origin);
    
    this.kvs = this.authKey ? new KVSAdapter(this.env, 'YOUTUBE', this.authKey) : null;

    this.uuid = null;
    this.action = null;
    this.playlistId = null;
    this.feedAction = null;

    const path = this.requestURL.pathname.split('/');
    const idx = path.indexOf('youtube');
    if (idx !== -1 && path[idx + 1]) {
      if (path[idx + 1] === 'auth') {
        this.action = 'auth';
      } else {
        this.uuid = path[idx + 1];
        this.action = path[idx + 2] || null;
        this.playlistId = path[idx + 3] || null;
        this.feedAction = path[idx + 4] || null;
      }
    }
  }

  async handleRequest() {
    try {
      if (!this.env.YOUTUBE_APP_KEY) {
        return renderError(503, 'YouTube Service is not configured.', this.requestURL.pathname);
      }
      if (this.requestURL.pathname.startsWith('/callback/')) return await this.handleCallback();
      return await this.dispatchAction();
    } catch (e) {
      console.error(`[YouTubeService.handleRequest] error: ${e.message}`);
      return renderError(500, 'Internal server error', this.requestURL.pathname);
    }
  }

  async dispatchAction() {
    if (this.action === 'auth') return this.redirectToGoogle();
    if (this.action === 'delete') return await this.handleDelete();
    if (this.action === 'playlists') return await this.viewPlaylists();
    if (this.action === 'opml') return await this.getOPML();
    if (this.action === 'playlist' && this.playlistId && this.feedAction === 'feed') {
      return await this.getPlaylistRSS();
    }
    return await this.getSubmitForm();
  }

  async getOPML() {
    if (!this.authKey || !this.kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    const entry = await this.kvs.get(this.uuid);
    if (!entry) return renderError(404, 'Account not found', this.requestURL.pathname);
    const data = JSON.parse(entry.value);

    try {
      const token = await this.getAccessToken(data.refresh_token);
      const playlists = await this.fetchYouTubePlaylists(token);
      const opml = this.convertPlaylistsToOPML(playlists, data.email);
      const encoded = new TextEncoder().encode(opml);
      
      const emailPart = (data.email || 'youtube').replace(/@/g, '-');
      const filename = `${emailPart}-playlists.opml`;

      return new Response(encoded, {
        headers: {
          'Content-Type': 'text/x-opml',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': encoded.byteLength.toString()
        }
      });
    } catch (e) {
      console.error(`[YouTubeService.getOPML] error: ${e.message}`);
      return renderError(502, 'Failed to generate OPML', this.requestURL.pathname);
    }
  }

  convertPlaylistsToOPML(playlists, email) {
    const outlines = playlists.map(p => {
      const rssUrl = `${this.requestURL.origin}${Endpoint.youtube}${encodeURIComponent(this.uuid)}/playlist/${p.id}/feed?key=${this.authKey}`;
      return {
        '@_text': p.snippet.title,
        '@_title': p.snippet.title,
        '@_type': 'rss',
        '@_xmlUrl': rssUrl,
        '@_htmlUrl': `https://www.youtube.com/playlist?list=${p.id}`
      };
    });

    const opmlObj = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      opml: {
        '@_version': '2.0',
        head: { title: `Youtube (${email || 'YouTube'})` },
        body: { outline: outlines }
      }
    };

    return new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true }).build(opmlObj);
  }

  getGoogleConfig() {
    const configStr = this.env.YOUTUBE_APP_KEY;
    if (!configStr) throw new Error('YOUTUBE_APP_KEY not found');
    return JSON.parse(configStr).web;
  }

  redirectToGoogle() {
    if (!this.authKey) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    const config = this.getGoogleConfig();
    const authUrl = new URL(config.auth_uri);
    authUrl.searchParams.set('client_id', config.client_id);
    authUrl.searchParams.set('redirect_uri', this.getRedirectUri(config));
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/userinfo.email');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', this.authKey);
    return Response.redirect(authUrl.toString(), 302);
  }

  getRedirectUri(config) {
    const isLocal = this.requestURL.hostname === 'localhost';
    return config.redirect_uris.find(uri => isLocal ? uri.includes('localhost') : uri.includes('.workers.dev'));
  }

  async handleCallback() {
    const code = this.requestURL.searchParams.get('code'), stateAuthKey = this.requestURL.searchParams.get('state');
    if (!code || !stateAuthKey) return renderError(400, 'Missing code or state', '/callback/');
    const config = this.getGoogleConfig();
    const tokenRes = await fetch(config.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.client_id, client_secret: config.client_secret, redirect_uri: this.getRedirectUri(config), grant_type: 'authorization_code' })
    });
    if (!tokenRes.ok) return renderError(500, 'Token exchange failed', '/callback/');
    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) return renderError(400, 'Refresh token missing. Reconnect required.', '/callback/');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
    const userInfo = userRes.ok ? await userRes.json() : { email: 'YouTube Account' };
    await new KVSAdapter(this.env, 'YOUTUBE', stateAuthKey).put(new KVSValue(null, userInfo.email, JSON.stringify({ refresh_token: tokens.refresh_token, email: userInfo.email }), 'YOUTUBE', stateAuthKey));
    return Response.redirect(`${this.requestURL.origin}${Endpoint.youtube}?key=${stateAuthKey}`, 302);
  }

  async viewPlaylists() {
    const token = await this.getValidToken();
    if (token instanceof Response) return token;
    try {
      const playlists = await this.fetchYouTubePlaylists(token);
      const head = renderUpdateActionScript(Endpoint.youtube);
      return new Response(renderLayout('RSS: Playlists', UI.renderPlaylistTable(this.uuid, playlists, this.authKey), head), { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      console.error(`[YouTubeService.viewPlaylists] error: ${e.message}`);
      return renderError(502, 'Failed to fetch playlists', this.requestURL.pathname);
    }
  }

  async getValidToken() {
    if (!this.authKey || !this.kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    const entry = await this.kvs.get(this.uuid);
    if (!entry) return renderError(404, 'Account not found', this.requestURL.pathname);
    const data = JSON.parse(entry.value);
    return await this.getAccessToken(data.refresh_token);
  }

  async getAccessToken(refreshToken) {
    const config = this.getGoogleConfig();
    const res = await fetch(config.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: config.client_id, client_secret: config.client_secret, grant_type: 'refresh_token' })
    });
    if (!res.ok) throw new Error('Refresh failed');
    return (await res.json()).access_token;
  }

  async fetchYouTubePlaylists(accessToken) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('mine', 'true');
    url.searchParams.set('maxResults', '50');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error('Playlist fetch failed');
    return (await res.json()).items || [];
  }

  async getPlaylistRSS() {
    if (!this.authKey || !this.kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    const entry = await this.kvs.get(this.uuid);
    if (!entry) return renderError(404, 'Account not found', this.requestURL.pathname);
    const data = JSON.parse(entry.value);
    
    try {
      const token = await this.getAccessToken(data.refresh_token);
      const [pItems, playlistTitle] = await Promise.all([
        this.fetchPlaylistItems(token, this.playlistId),
        this.fetchPlaylistTitle(token, this.playlistId)
      ]);
      
      if (pItems.length === 0) return this.renderEmptyRSS();
      
      const videoIds = pItems.map(i => i.contentDetails.videoId).join(',');
      const videos = await this.fetchVideoDetails(token, videoIds);
      
      const feedTitle = playlistTitle;
      const rss = this.convertYouTubeToRSS(videos, feedTitle, this.playlistId);
      const encoded = new TextEncoder().encode(rss);
      return new Response(encoded, { headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': encoded.byteLength.toString(), 'Cache-Control': 'public, max-age=1800' } });
    } catch (e) {
      console.error(`[YouTubeService.getPlaylistRSS] error: ${e.message}`);
      return renderError(502, 'Failed to generate feed', this.requestURL.pathname);
    }
  }

  async fetchPlaylistTitle(accessToken, playlistId) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', playlistId);
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) return 'Playlist Feed';
    const data = await res.json();
    return data.items?.[0]?.snippet?.title || 'Playlist Feed';
  }

  async fetchPlaylistItems(accessToken, playlistId) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error('Items fetch failed');
    return (await res.json()).items || [];
  }

  async fetchVideoDetails(accessToken, videoIds) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('id', videoIds);
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error('Video details fetch failed');
    return (await res.json()).items || [];
  }

  renderEmptyRSS() {
    const rss = this.convertYouTubeToRSS([], 'YouTube Playlist Feed', this.playlistId);
    return new Response(rss, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  }

  convertYouTubeToRSS(videos, feedTitle, playlistId) {
    const rssItems = videos.map(v => {
      const proxiedThumb = this.proxyURL(this.getThumbnailURL(v), Option.image);
      return {
        title: v.snippet.title,
        link: `http://www.youtube.com/v/${v.id}`,
        guid: { '@_isPermaLink': 'false', '#text': v.id },
        pubDate: new Date(v.snippet.publishedAt).toUTCString(),
        description: { '__cdata': UI.renderVideoRSSContent(v, v.statistics, proxiedThumb) },
        'dc:creator': v.snippet.channelTitle
      };
    });
    return this.buildRSS(rssItems, feedTitle, playlistId);
  }

  getThumbnailURL(video) {
    const t = video.snippet.thumbnails;
    return t?.maxres?.url || t?.high?.url || '';
  }

  proxyURL(url, option) {
    if (!url) return '';
    try {
      return Codec.encode(new URL(url), option, this.baseURL, this.authKey).toString();
    } catch {
      return url;
    }
  }

  buildRSS(items, title, playlistId) {
    const rssObj = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      rss: {
        '@_version': '2.0',
        '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@_xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        channel: {
          title,
          link: playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : 'https://www.youtube.com',
          description: 'YouTube Playlist converted to RSS by RSS-THE-PLANET',
          lastBuildDate: new Date().toUTCString(),
          generator: 'RSS-THE-PLANET',
          item: items
        }
      }
    };
    return new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true, cdataPropName: '__cdata' }).build(rssObj);
  }

  async handleDelete() {
    if (!this.authKey || !this.kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    await this.kvs.delete(this.uuid);
    return Response.redirect(`${this.requestURL.origin}${Endpoint.youtube}?key=${this.authKey}`, 302);
  }

  async getSubmitForm() {
    const key = this.requestURL.searchParams.get('key') || '', head = renderUpdateActionScript(Endpoint.youtube);
    if (!this.authKey) return new Response(renderLayout('RSS: YouTube', UI.renderLoginForm(key, `${Endpoint.youtube}?key=${key}`), head), { headers: { 'Content-Type': 'text/html' } });
    const entries = await this.kvs.list();
    const rows = entries.length === 0 ? '<tr class="empty-state"><td colspan="3">No accounts connected.</td></tr>' : entries.map(f => UI.renderAccountTableRow(f, this.authKey)).join('');
    return new Response(renderLayout('RSS: YouTube', UI.renderDashboard(this.authKey, `${Endpoint.youtube}auth?key=${this.authKey}`, rows), head), { headers: { 'Content-Type': 'text/html' } });
  }
}
