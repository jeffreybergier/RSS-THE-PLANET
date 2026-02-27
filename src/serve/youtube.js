import { Service, Endpoint } from './service.js';
import { Auth } from '../lib/auth.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue } from '../adapt/kvs.js';
import * as UI from '../ui/youtube.js';
import { renderUpdateActionScript } from '../ui/shared.js';

// MARK: YouTubeService Class

export class YouTubeService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.youtube) || url.pathname.startsWith('/callback/');
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.authKey = null;
    this.kvs = null;

    // Parse path components for /youtube/auth, /youtube/UUID/playlists, or /youtube/UUID/playlist/PLAYLIST_ID
    const path = this.requestURL.pathname.split('/');
    const idx = path.indexOf('youtube');
    if (idx !== -1 && path[idx + 1]) {
      if (path[idx + 1] === 'auth') {
        this.action = 'auth';
      } else {
        this.uuid = path[idx + 1];
        this.action = path[idx + 2] || null;
        this.playlistId = path[idx + 3] || null;
      }
    }
  }

  async handleRequest() {
    try {
      if (!this.env.YOUTUBE_APP_KEY) {
        return renderError(503, 'YouTube Service is not configured on this server.', this.requestURL.pathname);
      }

      this.authKey = await Auth.validate(this.request);
      if (this.authKey) {
        this.kvs = new KVSAdapter(this.env, 'YOUTUBE', this.authKey);
      }

      if (this.requestURL.pathname.startsWith('/callback/')) {
        return await this.handleCallback();
      }

      if (this.action === 'auth') return this.redirectToGoogle();
      if (this.action === 'delete') return await this.handleDelete();
      if (this.action === 'playlists') return await this.viewPlaylists();
      if (this.action === 'playlist' && this.playlistId) return await this.getPlaylistRSS();

      return await this.getSubmitForm();
    } catch (e) {
      console.error(`[YouTubeService.handleRequest] error: ${e.message}`);
      return renderError(500, 'Internal server error', this.requestURL.pathname);
    }
  }

  getGoogleConfig() {
    const configStr = this.env.YOUTUBE_APP_KEY;
    // Note: handleRequest already checks for existence, but we keep this robust
    if (!configStr) throw new Error('YOUTUBE_APP_KEY not found in environment');
    const config = JSON.parse(configStr);
    return config.web;
  }

  redirectToGoogle() {
    if (!this.authKey) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    
    const config = this.getGoogleConfig();
    const authUrl = new URL(config.auth_uri);
    
    authUrl.searchParams.set('client_id', config.client_id);
    authUrl.searchParams.set('redirect_uri', this.getRedirectUri(config));
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.email');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    // Store authKey in state to verify on callback
    authUrl.searchParams.set('state', this.authKey);

    return Response.redirect(authUrl.toString(), 302);
  }

  getRedirectUri(config) {
    // Pick the redirect URI that matches current environment
    const isLocal = this.requestURL.hostname === 'localhost';
    return config.redirect_uris.find(uri => isLocal ? uri.includes('localhost') : uri.includes('.workers.dev'));
  }

  async handleCallback() {
    const code = this.requestURL.searchParams.get('code');
    const stateAuthKey = this.requestURL.searchParams.get('state');
    if (!code || !stateAuthKey) return renderError(400, 'Missing code or state', '/callback/');

    const config = this.getGoogleConfig();
    const tokenRes = await fetch(config.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: this.getRedirectUri(config),
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error(`[YouTubeService.callback] Token exchange failed: ${err}`);
      return renderError(500, 'Failed to exchange code for tokens', '/callback/');
    }

    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) {
      console.error('[YouTubeService.callback] No refresh token received');
      // If we don't get a refresh token, we might already have one or user didn't consent properly
    }

    // Get user email to name the entry
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const userInfo = userRes.ok ? await userRes.json() : { email: 'YouTube Account' };

    // Save refresh token to KVS
    const kvs = new KVSAdapter(this.env, 'YOUTUBE', stateAuthKey);
    const value = JSON.stringify({
      refresh_token: tokens.refresh_token,
      email: userInfo.email
    });
    
    await kvs.put(new KVSValue(null, userInfo.email, value, 'YOUTUBE', stateAuthKey));

    return Response.redirect(`${this.requestURL.origin}${Endpoint.youtube}?key=${stateAuthKey}`, 302);
  }

  async handleDelete() {
    if (!this.authKey || !this.kvs) return renderError(401, 'Unauthorized', this.requestURL.pathname);
    if (!this.uuid) return renderError(400, 'ID required', this.requestURL.pathname);
    await this.kvs.delete(this.uuid);
    return Response.redirect(`${this.requestURL.origin}${Endpoint.youtube}?key=${this.authKey}`, 302);
  }

  async getSubmitForm() {
    const key = this.requestURL.searchParams.get('key') || '';
    const headExtras = renderUpdateActionScript(Endpoint.youtube);
    
    if (!this.authKey) {
      return new Response(renderLayout('RSS THE PLANET: YouTube', UI.renderLoginForm(key, `${Endpoint.youtube}?key=${key}`), headExtras), {
        headers: { 'Content-Type': 'text/html' },
        status: 200
      });
    }

    const entries = await this.kvs.list();
    const rows = entries.length === 0 
      ? '<tr class="empty-state"><td colspan="3">No YouTube Accounts connected.</td></tr>' 
      : entries.map(f => UI.renderAccountTableRow(f, this.authKey)).join('');

    const authUrl = `${Endpoint.youtube}auth?key=${this.authKey}`;
    const content = UI.renderDashboard(this.authKey, authUrl, rows);

    return new Response(renderLayout('RSS THE PLANET: YouTube', content, headExtras), {
      headers: { 'Content-Type': 'text/html' },
      status: 200
    });
  }

  async viewPlaylists() {
    // Placeholder for next step
    return renderError(501, 'Playlist viewing not yet implemented', this.requestURL.pathname);
  }

  async getPlaylistRSS() {
    // Placeholder for next step
    return renderError(501, 'Playlist RSS not yet implemented', this.requestURL.pathname);
  }
}
