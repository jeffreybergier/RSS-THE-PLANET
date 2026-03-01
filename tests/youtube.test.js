import { describe, it, expect, vi } from 'vitest';
import { YouTubeService, __setRotationOffset } from '../src/serve/youtube.js';
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
    return new Request(`http://localhost:3000${path}`, { method, ...options });
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
    const adapter = new KVSAdapter(env, 'YOUTUBE', 'test-key', new SHA256(env));
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
          items: [{ snippet: { title: 'Mock Playlist', publishedAt: '2023-01-01T00:00:00Z' } }]
        }), { status: 200 }));
      }
      if (urlStr.includes('youtube/v3/videos')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ 
            id: 'v1', 
            snippet: { 
              title: 'Video 1', 
              publishedAt: new Date().toISOString(), 
              description: 'Desc 1', 
              channelTitle: 'Chan 1',
              thumbnails: { high: { url: 'https://example.com/thumb.jpg' } }
            }, 
            statistics: { likeCount: '10', commentCount: '5' } 
          }]
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
    expect(body).toContain('<table>');
    expect(body).toContain('<tr><td>Video 1 Chan 1</td></tr>');
    expect(body).toContain('<tr><td>http://www.youtube.com/v/v1</td></tr>');
    expect(body).toContain('<tr><td>vnd.youtube://v1</td></tr>');
    expect(body).toContain('<a href="http://www.youtube.com/v/v1"><img');
    expect(body).toContain('<guid isPermaLink="true">http://www.youtube.com/v/v1</guid>');
    expect(body).not.toContain('Browser Link');
    expect(body).not.toContain('Deep Link');
    expect(body).not.toContain('View on YouTube');
    expect(body).toContain('👍 10');
  });

  it('should generate a randomized subscriptions mix feed', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }));
      }
      if (urlStr.includes('/subscriptions')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ snippet: { resourceId: { channelId: 'UC123' } } }]
        }), { status: 200 }));
      }
      if (urlStr.includes('/playlistItems') && urlStr.includes('playlistId=UU123')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { contentDetails: { videoId: 'v_sub1' } },
            { contentDetails: { videoId: 'v_sub2' } }
          ]
        }), { status: 200 }));
      }
      if (urlStr.includes('/videos')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { id: 'v_sub1', snippet: { title: 'Sub Video 1', publishedAt: new Date().toISOString(), channelTitle: 'Sub Chan' }, statistics: { likeCount: '5', commentCount: '2' } },
            { id: 'v_sub2', snippet: { title: 'Sub Video 2', publishedAt: new Date().toISOString(), channelTitle: 'Sub Chan' }, statistics: { likeCount: '10', commentCount: '4' } }
          ]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest('/youtube/test-uuid/subs?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<title>Subscriptions</title>');
    expect(body).toContain('<link>https://www.youtube.com/feed/subscriptions</link>');
    expect(body).toContain('Sub Video 1');
    expect(body).toContain('Sub Video 2');
    expect(body).toContain('Sub Chan');
  });

  it('should filter out shorts in the subscription feed', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }));
      }
      if (urlStr.includes('/subscriptions')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ snippet: { resourceId: { channelId: 'UC123' } } }]
        }), { status: 200 }));
      }
      if (urlStr.includes('/playlistItems')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { contentDetails: { videoId: 'v_regular' } },
            { contentDetails: { videoId: 'v_short' } }
          ]
        }), { status: 200 }));
      }
      if (urlStr.includes('/videos')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { 
              id: 'v_regular', 
              snippet: { title: 'Regular Video', publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, 
              statistics: { likeCount: '5' },
              contentDetails: { duration: 'PT3M5S' } // 185 seconds
            },
            { 
              id: 'v_short', 
              snippet: { title: 'Short Video', publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, 
              statistics: { likeCount: '10' },
              contentDetails: { duration: 'PT2M55S' } // 175 seconds
            }
          ]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest('/youtube/test-uuid/subs?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Regular Video');
    expect(body).not.toContain('Short Video');
  });

  it('should handle various duration formats and invalid inputs', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr === mockConfig.web.token_uri) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }));
      }
      if (urlStr.includes('/subscriptions')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ snippet: { resourceId: { channelId: 'UC123' } } }]
        }), { status: 200 }));
      }
      if (urlStr.includes('/playlistItems')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { contentDetails: { videoId: 'v_1h' } },
            { contentDetails: { videoId: 'v_10s' } },
            { contentDetails: { videoId: 'v_invalid' } },
            { contentDetails: { videoId: 'v_missing' } }
          ]
        }), { status: 200 }));
      }
      if (urlStr.includes('/videos')) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            { id: 'v_1h', snippet: { title: '1 Hour Video', publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, contentDetails: { duration: 'PT1H' } },
            { id: 'v_10s', snippet: { title: '10 Second Video', publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, contentDetails: { duration: 'PT10S' } },
            { id: 'v_invalid', snippet: { title: 'Invalid Video', publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, contentDetails: { duration: 'PT' } },
            { id: 'v_missing', snippet: { title: 'Missing Duration Video', publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, contentDetails: {} }
          ]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });

    const req = createRequest('/youtube/test-uuid/subs?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('1 Hour Video');
    expect(body).not.toContain('10 Second Video');
    // Invalid/missing durations should be included by default (filter returns false)
    expect(body).toContain('Invalid Video');
    expect(body).toContain('Missing Duration Video');
  });

  it('should rotate through subscriptions sequentially', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
    kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));

    // Create 15 mock channels UC01 to UC15
    const channels = Array.from({ length: 15 }, (_, i) => ({
      snippet: { resourceId: { channelId: `UC${(i + 1).toString().padStart(2, '0')}` } }
    }));

    const getFeed = async (offset) => {
      Auth.load(env);
      // Ensure KVS entry is present with consistent encryption
      const encryptedValue = await SHA256.__encrypt(JSON.stringify({ refresh_token: 'mock-refresh' }), 'test-secret' + 'test-key');
      kvsMap.set('test-uuid', new KVSValue('test-uuid', 'test@example.com', encryptedValue, 'YOUTUBE', 'test-key'));
      
      __setRotationOffset(offset);
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = url.toString();
        // Handle token refresh
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }));
        }
        if (urlStr.includes('/subscriptions')) {
          return Promise.resolve(new Response(JSON.stringify({ items: channels }), { status: 200 }));
        }
        if (urlStr.includes('/playlistItems')) {
          const playlistId = new URL(urlStr).searchParams.get('playlistId');
          return Promise.resolve(new Response(JSON.stringify({
            items: [{ contentDetails: { videoId: `v_${playlistId}` } }]
          }), { status: 200 }));
        }
        if (urlStr.includes('/videos')) {
          const ids = new URL(urlStr).searchParams.get('id').split(',');
          return Promise.resolve(new Response(JSON.stringify({
            items: ids.map(id => ({ 
              id, 
              snippet: { title: `Video ${id}`, publishedAt: new Date().toISOString(), channelTitle: 'Chan' }, 
              contentDetails: { duration: 'PT10M' } 
            }))
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('', { status: 404 }));
      });

      const req = createRequest('/youtube/test-uuid/subs?key=test-key');
      const service = new YouTubeService(req, env, {});
      const res = await service.handleRequest();
      return await res.text();
    };

    const body1 = await getFeed(0);
    const body2 = await getFeed(1);
    const body3 = await getFeed(2);

    const getChannels = (body) => {
      const matches = body.match(/http:\/\/www.youtube.com\/v\/v_UU\d{2}/g);
      if (!matches) return [];
      const ids = matches.map(m => {
        const idMatch = m.match(/UU\d{2}/);
        return idMatch ? idMatch[0] : null;
      }).filter(id => id !== null);
      return [...new Set(ids)].sort();
    };

    const c1 = getChannels(body1);
    const c2 = getChannels(body2);
    const c3 = getChannels(body3);

    expect(c1.length).toBe(5);
    expect(c2.length).toBe(5);
    expect(c3.length).toBe(5);

    // Ensure they are different batches
    expect(c1).not.toEqual(c2);
    expect(c2).not.toEqual(c3);
    expect(c1).not.toEqual(c3);
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
            { id: 'pl1', snippet: { title: 'Playlist 1', publishedAt: '2023-01-01T00:00:00Z' } },
            { id: 'pl2', snippet: { title: 'Playlist 2', publishedAt: '2023-01-01T00:00:00Z' } }
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
