import { describe, it, expect, vi } from 'vitest';
import { YouTubeService } from '../src/serve/youtube.js';
import { Endpoint } from '../src/serve/service.js';
import { Auth } from '../src/lib/auth.js';
import { KVSValue, KVSAdapter } from '../src/adapt/kvs.js';
import { SHA256 } from '../src/adapt/crypto.js';

describe('YouTube Service Integration', () => {
  const mockConfig = {
    web: {
      client_id: 'test-client-id',
      project_id: 'rss-the-planet',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      client_secret: 'test-client-secret',
      redirect_uris: ['http://localhost:3000/callback/']
    }
  };

  const env = {
    YOUTUBE_APP_KEY: JSON.stringify(mockConfig),
    VALID_KEYS: '["test-key"]',
    ENCRYPTION_SECRET: 'test-secret',
    RSS_THE_PLANET_KVS: new Map()
  };

  const createRequest = (path, method = 'GET', options = {}) => {
    const request = new Request(`http://localhost:3000${path}`, { method, ...options });
    request.env = env;
    return request;
  };

  it('should return 503 if YOUTUBE_APP_KEY is missing', async () => {
    Auth.load(env);
    const emptyEnv = { ...env, YOUTUBE_APP_KEY: undefined };
    const req = createRequest(Endpoint.youtube + '?key=test-key');
    const service = new YouTubeService(req, emptyEnv, {});
    const res = await service.handleRequest();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain('not configured');
  });

  it('should return 200 and login form if API key is missing', async () => {
    Auth.load(env);
    const req = createRequest(Endpoint.youtube);
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();
    expect(res.status).toBe(200); // Renders login form
    const body = await res.text();
    expect(body).toContain('Please enter your API Key');
  });

  it('should redirect to Google for authentication', async () => {
    Auth.load(env);
    const req = createRequest(Endpoint.youtube + 'auth?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();
    
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain('access_type=offline');
    expect(location).toContain('state=test-key');
  });

  it('should handle OAuth callback and store tokens', async () => {
    Auth.load(env);
    // Mock token exchange
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: 'mock-access',
          refresh_token: 'mock-refresh',
          expires_in: 3600
        }), { status: 200 }));
      }
      if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return Promise.resolve(new Response(JSON.stringify({
          email: 'test@example.com'
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest('/callback/?code=mock-code&state=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain(Endpoint.youtube);
    
    // Verify encrypted KVS storage
    const adapter = new KVSAdapter(env, 'YOUTUBE', 'test-key', new SHA256(req));
    const entries = await adapter.list();
    expect(entries.length).toBe(1);
    const entry = await adapter.get(entries[0].key);
    const data = JSON.parse(entry.value);
    expect(data.refresh_token).toBe('mock-refresh');
  });

  it('should fetch and display playlists', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: 'new-access'
        }), { status: 200 }));
      }
      if (urlStr.includes('youtube/v3/playlists')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { 
              id: 'pl1', 
              snippet: { title: 'My Favorites' },
              contentDetails: { itemCount: 10 }
            }
          ]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest(Endpoint.youtube + 'test-uuid/playlists?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('My Favorites');
    expect(body).toContain('pl1');
    expect(body).toContain('/playlist/pl1/feed');
  });

  it('should generate RSS feed for playlist', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }));
      }
      if (urlStr.includes('youtube/v3/playlistItems')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ 
            snippet: { title: 'Video 1', publishedAt: new Date().toISOString(), description: 'Desc 1', channelTitle: 'Chan 1' },
            contentDetails: { videoId: 'v1' }
          }]
        }), { status: 200 }));
      }
      if (urlStr.includes('youtube/v3/playlists')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ snippet: { title: 'Mock Playlist' } }]
        }), { status: 200 }));
      }
      if (urlStr.includes('youtube/v3/videos')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ id: 'v1', snippet: { title: 'Video 1', publishedAt: new Date().toISOString(), description: 'Desc 1', channelTitle: 'Chan 1' }, statistics: { likeCount: '10', commentCount: '5' } }]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest('/youtube/test-uuid/playlist/pl1/feed?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/xml');
    const body = await res.text();
    expect(body).toContain('<rss');
    expect(body).toContain('<title>Mock Playlist</title>');
    expect(body).toContain('<link>https://www.youtube.com/playlist?list=pl1</link>');
    expect(body).toContain('Video&nbsp;1&nbsp;Chan&nbsp;1');
    expect(body).toContain('<a href="http://www.youtube.com/v/v1">Browser Link</a>');
    expect(body).toContain('<a href="vnd.youtube://v1">Deep Link</a>');
    expect(body).not.toContain('View on YouTube');
    expect(body).toContain('👍 10');
  });

  it('should generate OPML for all playlists', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh', email: 'test@example.com' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }));
      }
      if (urlStr.includes('youtube/v3/playlists')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { id: 'pl1', snippet: { title: 'Playlist 1' } },
            { id: 'pl2', snippet: { title: 'Playlist 2' } }
          ]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest(Endpoint.youtube + 'test-uuid/opml?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/x-opml');
    expect(res.headers.get('Content-Disposition')).toContain('filename="test-example.com-playlists.opml"');
    const body = await res.text();
    expect(body).toContain('<opml');
    expect(body).toContain('xmlUrl="http://localhost:3000/youtube/test-uuid/playlist/pl1/feed?key=test-key"');
    expect(body).toContain('xmlUrl="http://localhost:3000/youtube/test-uuid/playlist/pl2/feed?key=test-key"');
  });

  it('should render the dashboard when authorized', async () => {
    Auth.load(env);
    // Seed KVS with an account
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    const req = createRequest(Endpoint.youtube + '?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('test@example.com');
    expect(body).toContain('View Playlists');
  });
});
