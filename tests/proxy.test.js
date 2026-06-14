import { afterEach, describe, expect, it } from 'vitest';
import * as Router from '../src/router.js';
import { Codec } from '../src/lib/codec.js';
import { Option } from '../src/lib/option.js';

describe('Proxy Service Integration', () => {
  const env = {
    VALID_KEYS: '["test-key"]',
    RSS_THE_PLANET_KVS: new Map()
  };
  const ctx = {};
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function proxyRequestURL(target, option) {
    return Codec.encode(new URL(target), option, new URL('/proxy/', 'http://example.com'), 'test-key').toString();
  }

  function readerURL(target) {
    const readerBaseURL = ['http:', '//search.nextcommunity.net/'].join('');
    const url = new URL('read.star', readerBaseURL);
    url.searchParams.set('a', target);
    return url.toString();
  }

  it('preserves visible HTML links and appends proxy and reader actions', async () => {
    globalThis.fetch = async () => new Response(`
      <main>
        <a href="/wiki/Apple_II">Apple II</a>
        <a href="#toc">Contents</a>
        <a href="mailto:reader@example.com">Email</a>
        <a href="javascript:alert(1)">Bad Link</a>
        <img src="/images/logo.png">
      </main>
    `, { headers: { 'Content-Type': 'text/html' } });

    const request = new Request(proxyRequestURL('https://en.wikipedia.org/wiki/Main_Page', Option.html));
    const response = await Router.route(request, env, ctx);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<a href="https://en.wikipedia.org/wiki/Apple_II">Apple II</a>');
    expect(html).toContain('(Proxy)</a>');
    expect(html).toContain(readerURL('https://en.wikipedia.org/wiki/Apple_II'));
    expect(html).toContain('/proxy/');
    expect(html).toContain('option=image');
    expect(html).toContain('<a href="#toc">Contents</a>');
    expect(html).toContain('<a href="mailto:reader@example.com">Email</a>');
    expect(html).not.toContain('javascript:alert');
  });

  it('preserves visible links inside feed item HTML content', async () => {
    globalThis.fetch = async () => new Response(`
      <rss version="2.0">
        <channel>
          <title>Example Feed</title>
          <item>
            <title>Example Item</title>
            <link>https://source.example/item</link>
            <description><![CDATA[<p>Read <a href="/article">the article</a>.</p>]]></description>
          </item>
        </channel>
      </rss>
    `, { headers: { 'Content-Type': 'application/rss+xml' } });

    const request = new Request(proxyRequestURL('https://source.example/feed.xml', Option.feed));
    const response = await Router.route(request, env, ctx);
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('href="https://source.example/article"');
    expect(xml).toContain('(Proxy)</a>');
    expect(xml).toContain(readerURL('https://source.example/article'));
  });
});
