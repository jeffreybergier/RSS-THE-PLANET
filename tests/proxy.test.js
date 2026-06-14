import { describe, it, expect, beforeAll } from 'vitest';
import { ProxyService } from '../src/serve/proxy.js';
import { Auth } from '../src/lib/auth.js';
import { Codec } from '../src/lib/codec.js';
import { Option } from '../src/lib/option.js';

describe('Proxy Service', () => {
  const env = {
    VALID_KEYS: '["test-key"]',
    RSS_THE_PLANET_KVS: new Map(),
  };

  beforeAll(() => {
    Auth.load(env);
  });

  function createService() {
    const request = new Request(
      'http://proxy.test/proxy/?key=test-key&url=https%3A%2F%2Ffeed.test%2Ffeed.xml'
    );
    return new ProxyService(request, env, {});
  }

  it('adds original, proxy, and reader links to RSS body anchors', async () => {
    const service = createService();
    const target = new URL('https://en.wikipedia.org/wiki/Apple_II');
    const proxyURL = Codec.encode(target, Option.auto, service.baseURL, service.authKey).toString();
    const readerURL = ProxyService.readerURL(target);
    const rss = `
      <rss>
        <channel>
          <item>
            <description><![CDATA[<p>Read <a href="${target}">Apple II</a>.</p>]]></description>
          </item>
        </channel>
      </rss>
    `;

    const rewritten = await service.rewriteFeedXML(rss);

    expect(rewritten).toContain(`<a href="${target}">Apple II</a>`);
    expect(rewritten).toContain(
      `<small>(<a href="${proxyURL.replaceAll('&', '&amp;')}">Proxy</a> &middot; <a href="${readerURL}">Reader</a>)</small>`
    );
  });

  it('keeps RSS item title links original and adds an action footer', async () => {
    const service = createService();
    const target = new URL('https://en.wikipedia.org/wiki/Apple_II');
    const proxyURL = Codec.encode(target, Option.auto, service.baseURL, service.authKey).toString();
    const readerURL = ProxyService.readerURL(target);
    const rss = `
      <rss>
        <channel>
          <item>
            <title>Apple II</title>
            <link>${target}</link>
            <description><![CDATA[<p>Article body.</p>]]></description>
          </item>
        </channel>
      </rss>
    `;

    const rewritten = await service.rewriteFeedXML(rss);

    expect(rewritten).toContain(`<link>${target}</link>`);
    expect(rewritten).toContain(
      `<p><small><a href="${target}">Original</a> &middot; <a href="${proxyURL.replaceAll('&', '&amp;')}">Proxy</a> &middot; <a href="${readerURL}">Reader</a></small></p>`
    );
  });

  it('keeps the full HTML proxy rewrite path for page anchors', async () => {
    const service = createService();
    const target = new URL('https://en.wikipedia.org/wiki/Apple_II');
    const proxyURL = Codec.encode(target, Option.auto, service.baseURL, service.authKey).toString();

    const rewritten = await service.rewriteHTMLString(`<a href="${target}">Apple II</a>`);

    expect(rewritten).toContain(`href="${proxyURL}"`);
    expect(rewritten).not.toContain('read.star');
    expect(rewritten).not.toContain('>Proxy</a>');
  });
});
