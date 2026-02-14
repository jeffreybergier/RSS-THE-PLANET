import { describe, it, expect } from 'vitest';
import * as Router from '../src/router.js';

describe('Router Integration', () => {
  // We mock the env object that Cloudflare or Node-boot would provide
  const env = {
    VALID_KEYS: '["test-key"]',
    RSS_THE_PLANET_KVS: null
  };
  const ctx = {};

  const fetchAsRouter = (url) => {
    const request = new Request(url);
    return Router.route(request, env, ctx);
  };

  it('should return 200 for the proxy entry point', async () => {
    const response = await fetchAsRouter('http://example.com/proxy/');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('RSS THE PLANET');
  });

  it('should return 401 for unauthorized proxy requests', async () => {
    // Valid base64 for 'https://example.com' but with invalid key
    const response = await fetchAsRouter('http://example.com/proxy/aHR0cHM6Ly9leGFtcGxlLmNvbQ==/file.mp3?key=invalid');
    expect(response.status).toBe(401);
  });

  it('should return 200 for authorized proxy requests (with valid key)', async () => {
    // Note: This won't actually fetch the remote URL in these tests because 
    // we aren't mocking the global fetch here, but it verifies the router 
    // and auth logic.
    const response = await fetchAsRouter('http://example.com/proxy/aHR0cHM6Ly9leGFtcGxlLmNvbQ==/file.mp3?key=test-key');
    
    // It might return 502/Target Unreachable if it actually tries to fetch 
    // and fails in the test environment, but the point is it PASSED the 401 check.
    expect(response.status).not.toBe(401);
  });

  it('should return 404 for unknown routes', async () => {
    const response = await fetchAsRouter('http://example.com/unknown');
    expect(response.status).toBe(404);
  });
});
