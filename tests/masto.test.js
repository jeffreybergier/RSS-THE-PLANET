import { describe, it, expect } from 'vitest';
import * as Router from '../src/router.js';
import { KVSAdapter } from '../src/adapt/kvs.js';
import { SHA256 } from '../src/adapt/crypto.js';

describe('Masto Service Integration', () => {
  const env = {
    VALID_KEYS: '["test-key"]',
    ENCRYPTION_SECRET: 'a-super-secret-key-for-testing',
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

    // Verify it was saved and can be decrypted
    request.env = env;
    const kvs = new KVSAdapter(env, 'MASTO', 'test-key', new SHA256(request));
    const entries = await kvs.list();
    const mastoEntry = entries.find(e => e.name === 'https://mastodon.social');
    const savedValue = await kvs.get(mastoEntry.key);

    expect(mastoEntry).toBeDefined();
    expect(mastoEntry.name).toBe('https://mastodon.social');
    expect(savedValue.value).toBe('masto-token-123');
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

    saveRequest.env = env;
    const kvs = new KVSAdapter(env, 'MASTO', 'test-key', new SHA256(saveRequest));
    const entries = await kvs.list();
    const entry = entries.find(e => e.name === 'https://delete.me');
    const id = entry.key;

    // 2. Delete it
    const deleteRequest = new Request(`http://example.com/masto/${id}/delete?key=test-key`);
    const deleteResponse = await Router.route(deleteRequest, env, ctx);
    expect(deleteResponse.status).toBe(302);

    // 3. Verify it's gone
    const getResult = await kvs.get(id);
    expect(getResult).toBeNull();
  });

  it('should route status requests to Mastodon API', async () => {
    // 1. Save an entry
    const formData = new FormData();
    formData.append('server', 'https://mastodon.test');
    formData.append('apiKey', 'test-token');
    const saveRequest = new Request('http://example.com/masto/?key=test-key', {
      method: 'POST',
      body: formData
    });
    await Router.route(saveRequest, env, ctx);
    
    saveRequest.env = env;
    const kvs = new KVSAdapter(env, 'MASTO', 'test-key', new SHA256(saveRequest));
    const entries = await kvs.list();
    const entry = entries.find(e => e.name === 'https://mastodon.test');
    const id = entry.key;

    // 2. Mock fetch for the status call
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.toString().includes('/api/v1/timelines/home')) {
        return new Response(JSON.stringify([{ 
          id: '1', 
          created_at: new Date().toISOString(),
          url: 'https://mastodon.test/@user/1',
          content: '<p>test post</p>',
          account: {
            username: 'testuser',
            acct: 'testuser',
            display_name: 'Test User',
            avatar: 'https://mastodon.test/avatar.png',
            url: 'https://mastodon.test/@user'
          },
          media_attachments: []
        }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(null, { status: 404 });
    };

    try {
      const statusRequest = new Request(`http://example.com/masto/${id}/status/home?key=test-key`);
      const response = await Router.route(statusRequest, env, ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/rss+xml');
      
      const xml = await response.text();
      expect(xml).toContain('<rss');
      expect(xml).toContain('<channel>');
      expect(xml).toContain('test post');
      // Verify avatar is present (proxied)
      // Base64 of encodeURIComponent('https://mastodon.test/avatar.png')
      expect(xml).toContain('aHR0cHMlM0ElMkYlMkZtYXN0b2Rvbi50ZXN0JTJGYXZhdGFyLnBuZw'); 
      // check for forced .jpg extension from Codec.sanitizeFileName
      expect(xml).toContain('avatar.jpg');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
