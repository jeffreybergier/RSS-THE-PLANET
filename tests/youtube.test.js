import { describe, it, expect, vi } from 'vitest';
import { YouTubeService } from '../src/serve/youtube.js';
import { Endpoint } from '../src/serve/service.js';
import { Auth } from '../src/lib/auth.js';
import { KVSValue } from '../src/adapt/kvs.js';

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
    
    // Verify KVS storage (in-memory Map in our mock env)
    const kvsMap = env.RSS_THE_PLANET_KVS;
    expect(kvsMap.size).toBeGreaterThan(0);
    
    // Find the YouTube entry.
    let found = false;
    for (const val of kvsMap.values()) {
      if (val.service === 'YOUTUBE') {
        const data = JSON.parse(val.value);
        expect(data.refresh_token).toBe('mock-refresh');
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('should fetch and display playlists', async () => {
    Auth.load(env);
    const kvsMap = env.RSS_THE_PLANET_KVS;
    kvsMap.set('test-uuid', new KVSValue(
      'test-uuid', 
      'test@example.com', 
      JSON.stringify({ refresh_token: 'mock-refresh' }), 
      'YOUTUBE', 
      'test-key'
    ));

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
  });

  it('should render the dashboard when authorized', async () => {
    Auth.load(env);
    // Seed KVS with an account
    const kvsMap = env.RSS_THE_PLANET_KVS;
    kvsMap.set('test-uuid-2', new KVSValue(
      'test-uuid-2', 
      'test@example.com', 
      JSON.stringify({ refresh_token: 'some-token' }), 
      'YOUTUBE', 
      'test-key'
    ));

    const req = createRequest(Endpoint.youtube + '?key=test-key');
    const service = new YouTubeService(req, env, {});
    const res = await service.handleRequest();

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('test@example.com');
    expect(body).toContain('View Playlists');
  });
});
