import { describe, it, expect } from 'vitest';
import * as Router from '../src/router.js';

describe('OPML Service Integration', () => {
  const env = {
    VALID_KEYS: '["test-key"]',
    RSS_THE_PLANET_KVS: new Map() // Shared store for all tests in this block
  };
  const ctx = {};

  it('should return 200 for the OPML entry point', async () => {
    const request = new Request('http://example.com/opml/');
    const response = await Router.route(request, env, ctx);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('OPML Rewriter');
  });

  it('should rewrite an uploaded OPML file', async () => {
    const originalOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My Feeds</title>
  </head>
  <body>
    <outline text="The Verge" title="The Verge" type="rss" xmlUrl="https://www.theverge.com/rss/index.xml" htmlUrl="https://www.theverge.com/"/>
  </body>
</opml>`;

    const formData = new FormData();
    formData.append('key', 'test-key');
    const file = new Blob([originalOpml], { type: 'text/x-opml' });
    formData.append('opml', file, 'test.opml');

    const request = new Request('http://example.com/opml/', {
      method: 'POST',
      body: formData
    });

    const response = await Router.route(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/x-opml');

    const rewrittenOpml = await response.text();
    expect(rewrittenOpml).toContain('proxy');
    // Codec encodes URI components, so '==' becomes '%3D%3D' etc.
    // 'aHR0cHM6Ly93d3cudGhldmVyZ2UuY29tL3Jzcy9pbmRleC54bWw=' becomes 'aHR0cHMlM0ElMkYlMkZ3d3cudGhldmVyZ2UuY29tJTJGcnNzJTJGaW5kZXgueG1s'
    expect(rewrittenOpml).toContain('aHR0cHMlM0ElMkYlMkZ3d3cudGhldmVyZ2UuY29tJTJGcnNzJTJGaW5kZXgueG1s');
    expect(rewrittenOpml).toContain('aHR0cHMlM0ElMkYlMkZ3d3cudGhldmVyZ2UuY29tJTJG');
  });

  it('should rewrite a nested OPML structure (folders)', async () => {
    const nestedOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech News">
      <outline text="The Verge" type="rss" xmlUrl="https://www.theverge.com/rss/index.xml"/>
      <outline text="Nested Folder">
        <outline text="MacRumors" type="rss" xmlUrl="https://www.macrumors.com/macrumors.xml"/>
      </outline>
    </outline>
  </body>
</opml>`;

    const formData = new FormData();
    formData.append('key', 'test-key');
    const file = new Blob([nestedOpml], { type: 'text/x-opml' });
    formData.append('opml', file, 'nested.opml');

    const request = new Request('http://example.com/opml/', {
      method: 'POST',
      body: formData
    });

    const response = await Router.route(request, env, ctx);
    expect(response.status).toBe(200);

    const rewrittenOpml = await response.text();
    // Verify Verge (1st level nested)
    // aHR0cHM6Ly93d3cudGhldmVyZ2UuY29tL3Jzcy9pbmRleC54bWw=
    expect(rewrittenOpml).toContain('aHR0cHMlM0ElMkYlMkZ3d3cudGhldmVyZ2UuY29tJTJGcnNzJTJGaW5kZXgueG1s');
    // Verify MacRumors (2nd level nested)
    // aHR0cHM6Ly93d3cubWFjcnVtb3JzLmNvbS9tYWNydW1vcnMueG1s
    expect(rewrittenOpml).toContain('aHR0cHMlM0ElMkYlMkZ3d3cubWFjcnVtb3JzLmNvbSUyRm1hY3J1bW9ycy54bWw');
  });

  it('should return 401 for unauthorized POST requests', async () => {
    const formData = new FormData();
    formData.append('key', 'wrong-key');
    const request = new Request('http://example.com/opml/', {
      method: 'POST',
      body: formData
    });

    const response = await Router.route(request, env, ctx);
    expect(response.status).toBe(401);
  });

  it('should save an OPML file to KVS and allow downloading', async () => {
    // 1. Upload and Save
    const opmlContent = '<opml><body><outline text="Saved Feed" xmlUrl="http://example.com/feed"/></body></opml>';
    const formData = new FormData();
    formData.append('key', 'test-key');
    formData.append('mode', 'save');
    const file = new Blob([opmlContent], { type: 'text/x-opml' });
    formData.append('opml', file, 'saved.opml');

    const saveRequest = new Request('http://example.com/opml/', {
      method: 'POST',
      body: formData
    });

    const saveResponse = await Router.route(saveRequest, env, ctx);
    expect(saveResponse.status).toBe(200);
    const saveText = await saveResponse.text();
    expect(saveText).toContain('File Saved');

    // 2. Find the ID via listing (simulating looking at the table)
    // We access the store directly. Keys are raw UUIDs, so we filter by checking the object's service.
    const entries = Array.from(env.RSS_THE_PLANET_KVS.values());
    const opmlEntry = entries.find(e => e.service === 'OPML');
    expect(opmlEntry).toBeDefined();
    
    const id = opmlEntry.key; // Key is the UUID

    // 3. Download
    const downloadRequest = new Request(`http://example.com/opml/${id}/download?key=test-key`);
    const downloadResponse = await Router.route(downloadRequest, env, ctx);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('Content-Disposition')).toContain('saved.opml');
    
    const downloadedText = await downloadResponse.text();
    expect(downloadedText).toBe(opmlContent);

    // 4. Convert (Rewritten Download)
    const convertRequest = new Request(`http://example.com/opml/${id}/convert?key=test-key`);
    const convertResponse = await Router.route(convertRequest, env, ctx);
    expect(convertResponse.status).toBe(200);
    expect(convertResponse.headers.get('Content-Disposition')).toContain('proxied_saved.opml');
    
    const convertedText = await convertResponse.text();
    expect(convertedText).toContain('proxy');
    // encoded: aHR0cCUzQSUyRiUyRmV4YW1wbGUuY29tJTJGZmVlZA%3D%3D
    expect(convertedText).toContain('aHR0cCUzQSUyRiUyRmV4YW1wbGUuY29tJTJGZmVlZA%3D%3D');
  });

  it('should enforce access control on saved files', async () => {
    // 1. Save with User A
    const opmlContent = '<opml><body><outline text="User A" xmlUrl="http://a.com/feed"/></body></opml>';
    const formData = new FormData();
    formData.append('key', 'test-key');
    formData.append('mode', 'save');
    const file = new Blob([opmlContent], { type: 'text/x-opml' });
    formData.append('opml', file, 'private.opml');

    const saveRequest = new Request('http://example.com/opml/', {
      method: 'POST',
      body: formData
    });

    await Router.route(saveRequest, env, ctx);
    
    // 2. Find the ID
    const keys = Array.from(env.RSS_THE_PLANET_KVS.values()).filter(entry => {
      return entry.service === 'OPML' && entry.name === 'private.opml';
    });
    const id = keys[0].key;

    // 3. Access with 'wrong-key' (Simulating unauthorized user)
    // Note: In our mock setup, 'wrong-key' fails the initial check (is invalid key), so returns 401.
    // If we had a valid key 'user-b' that was NOT the owner, it would pass the first check 
    // but fail the metadata check (also 401 now).
    const downloadRequest = new Request(`http://example.com/opml/${id}/download?key=wrong-key`);
    const downloadResponse = await Router.route(downloadRequest, env, ctx);
    expect(downloadResponse.status).toBe(401);
  });
});
