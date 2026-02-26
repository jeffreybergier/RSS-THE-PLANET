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
          media_attachments: [],
          language: "en"
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
      expect(response.headers.get('Content-Type')).toContain('text/xml');
      expect(response.headers.get('Content-Length')).toBeDefined();
      expect(parseInt(response.headers.get('Content-Length'))).toBeGreaterThan(0);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=600');
      
      const xml = await response.text();
      expect(xml).toContain('<rss');
      expect(xml).toContain('<channel>');
      expect(xml).toContain('<title>mastodon.test - Home</title>');
      expect(xml).toContain('<link>https://mastodon.test</link>');
      expect(xml).toContain('<description>RSS-THE-PLANET Mastodon Feed</description>');
      expect(xml).toContain('<sy:updatePeriod>hourly</sy:updatePeriod>');
      expect(xml).toContain('<sy:updateFrequency>1</sy:updateFrequency>');
      expect(xml).toContain('<generator>RSS-THE-PLANET</generator>');
      expect(xml).not.toContain('<atom:link');
      expect(xml).toContain('<dc:language>en</dc:language>');
      expect(xml).toContain('test post');
      // Verify avatar is present (proxied) and has the correct size
      // Base64 of encodeURIComponent('https://mastodon.test/avatar.png')
      expect(xml).toContain('aHR0cHMlM0ElMkYlMkZtYXN0b2Rvbi50ZXN0JTJGYXZhdGFyLnBuZw'); 
      // check for forced .jpg extension and 96px size
      expect(xml).toContain('avatar.jpg');
      expect(xml).toContain('width="96" height="96"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should highlight boosts and replies in RSS', async () => {
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

    // 2. Mock fetch for the status call with boost and reply
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.toString().includes('/api/v1/timelines/home')) {
        return new Response(JSON.stringify([
          { 
            id: '1', 
            created_at: new Date().toISOString(),
            url: 'https://mastodon.test/@booster/1',
            reblog: {
              id: '10',
              url: 'https://mastodon.test/@original/10',
              content: '<p>boosted content with <a href="https://mastodon.test/@mentioned">profile link</a></p>',
              account: {
                username: 'original',
                acct: 'original',
                display_name: 'Original Author',
                avatar: 'https://mastodon.test/avatar.png'
              },
              mentions: [{ id: '11', acct: 'mentioned', username: 'mentioned', url: 'https://mastodon.test/@mentioned' }]
            },
            account: {
              username: 'booster',
              acct: 'booster',
              display_name: 'The Booster',
              avatar: 'https://mastodon.test/avatar.png'
            }
          },
          { 
            id: '2', 
            in_reply_to_id: '10',
            in_reply_to_account_id: '10',
            mentions: [{ id: '10', acct: 'original', username: 'original', url: 'https://mastodon.test/@original' }],
            created_at: new Date().toISOString(),
            url: 'https://mastodon.test/@replier/2',
            content: '<p>reply content</p>',
            account: {
              username: 'replier',
              acct: 'replier',
              display_name: 'The Replier',
              avatar: 'https://mastodon.test/avatar.png'
            }
          }
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(null, { status: 404 });
    };

    try {
      const statusRequest = new Request(`http://example.com/masto/${id}/status/home?key=test-key`);
      const response = await Router.route(statusRequest, env, ctx);
      const xml = await response.text();

      // Check Normal Status
      const normalStatusRequest = new Request(`http://example.com/masto/${id}/status/home?key=test-key`);
      // Mock fetch again for just a normal status to keep it clean
      const originalFetch2 = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify([{
        id: '3',
        created_at: new Date().toISOString(),
        url: 'https://mastodon.test/@user/3',
        content: '<p>normal post</p>',
        account: { username: 'user', acct: 'user', display_name: 'User', avatar: 'https://mastodon.test/avatar.png' }
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });

      const res2 = await Router.route(normalStatusRequest, env, ctx);
      const xml2 = await res2.text();
      expect(xml2).toContain('<title>💬 from User</title>');
      globalThis.fetch = originalFetch2;
      
      // Check Boost
      expect(xml).toContain('<title>🚀 by The Booster</title>');
      expect(xml).toContain('<dc:creator>Original Author (original@mastodon.test)</dc:creator>');
      expect(xml).toContain('<strong>Original Author (original@mastodon.test)</strong><br>');
      expect(xml).toContain('boosted content');

      // Check Reply
      expect(xml).toContain('<title>↩️ to original</title>');
      expect(xml).toContain('<dc:creator>The Replier (replier@mastodon.test)</dc:creator>');
      expect(xml).toContain('<strong>The Replier (replier@mastodon.test)</strong><br>');
      expect(xml).toContain('reply content');
      
      // Check Footer Emoji
      expect(xml).toContain('↩️ 0'); // replies_count

      // Check Complex Media Status (Images + Video + Link)
      const complexStatusRequest = new Request(`http://example.com/masto/${id}/status/home?key=test-key`);
      const originalFetch3 = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify([{
        id: '4',
        created_at: new Date().toISOString(),
        url: 'https://mastodon.test/@user/4',
        content: '<p>Check this <a href="https://example.com">Link</a></p>',
        account: { username: 'user', acct: 'user', display_name: 'User', avatar: 'https://mastodon.test/avatar.png' },
        media_attachments: [
          { type: 'image', url: 'https://mastodon.test/img.png' },
          { type: 'video', url: 'https://mastodon.test/vid.mp4' }
        ]
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });

      const res3 = await Router.route(complexStatusRequest, env, ctx);
      const xml3 = await res3.text();
      expect(xml3).toContain('<title>💬・📷・📹・🔗 from User</title>');
      globalThis.fetch = originalFetch3;

      // Check Thread Status (Self-Reply)
      const threadStatusRequest = new Request(`http://example.com/masto/${id}/status/home?key=test-key`);
      const originalFetch4 = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify([{
        id: '5',
        in_reply_to_id: '4',
        in_reply_to_account_id: 'author-id-123',
        created_at: new Date().toISOString(),
        url: 'https://mastodon.test/@author/5',
        content: '<p>continuation of thread</p>',
        account: { id: 'author-id-123', username: 'author', acct: 'author', display_name: 'Author Name', avatar: 'https://mastodon.test/avatar.png' },
        mentions: []
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });

      const res4 = await Router.route(threadStatusRequest, env, ctx);
      const xml4 = await res4.text();
      expect(xml4).toContain('<title>↩️ to Author Name</title>');
      globalThis.fetch = originalFetch4;

      // Check Brutaldon URL rewriting (Item link only)
      expect(xml).toContain('link>https://brutaldon.org/search_results?q=https%3A%2F%2Fmastodon.test%2F%40original%2F10</link>');
      // HTML content should remain original
      expect(xml).toContain('href="https://mastodon.test/@mentioned"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
