import { describe, it, expect } from 'vitest';
import * as Router from '../src/router.js';

describe('Masto Service Integration', () => {
  const env = {
    VALID_KEYS: '["test-key"]',
    RSS_THE_PLANET_KVS: new Map()
  };
  const ctx = {};

  it('should return 200 for the Masto entry point', async () => {
    const request = new Request('http://example.com/masto/');
    const response = await Router.route(request, env, ctx);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Mastodon');
  });

  it('should save Mastodon credentials', async () => {
    const formData = new FormData();
    formData.append('server', 'https://mastodon.social');
    formData.append('apiKey', 'masto-token-123');
    
    const request = new Request('http://example.com/masto/?key=test-key', {
      method: 'POST',
      body: formData
    });

    const response = await Router.route(request, env, ctx);
    // Should redirect back to list
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('/masto/');

    // Verify it was saved in KVS
    const entries = Array.from(env.RSS_THE_PLANET_KVS.values());
    const mastoEntry = entries.find(e => e.service === 'MASTO');
    expect(mastoEntry).toBeDefined();
    expect(mastoEntry.name).toBe('https://mastodon.social');
    expect(mastoEntry.value).toBe('masto-token-123');
  });

  it('should delete Mastodon credentials', async () => {
    // 1. First save an entry
    const formData = new FormData();
    formData.append('server', 'https://delete.me');
    formData.append('apiKey', 'token');
    const saveRequest = new Request('http://example.com/masto/?key=test-key', {
      method: 'POST',
      body: formData
    });
    await Router.route(saveRequest, env, ctx);

    const entries = Array.from(env.RSS_THE_PLANET_KVS.values());
    const entry = entries.find(e => e.name === 'https://delete.me');
    const id = entry.key;

    // 2. Delete it
    const deleteRequest = new Request(`http://example.com/masto/${id}/delete?key=test-key`);
    const deleteResponse = await Router.route(deleteRequest, env, ctx);
    expect(deleteResponse.status).toBe(302);

    // 3. Verify it's gone
    const postDeleteEntries = Array.from(env.RSS_THE_PLANET_KVS.values());
    const deletedEntry = postDeleteEntries.find(e => e.key === id);
    expect(deletedEntry).toBeUndefined();
  });
});
