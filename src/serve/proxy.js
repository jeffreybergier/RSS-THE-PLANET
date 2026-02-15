import { Service, Endpoint } from './service.js';
import { Auth } from '../lib/auth.js';
import { HTMLRewriter } from '../adapt/html-rewriter.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// MARK: ProxyService Class

export class ProxyService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.proxy);
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Endpoint.proxy, this.requestURL.origin);
    this.requestHeaders = ProxyService.sanitizedRequestHeaders(request.headers);
    this.requestMethod = request.method;
    this.isLegacyClient = ProxyService.isLegacyUserAgent(request.headers.get("User-Agent"));
    this.authKey = null;
  }

  static isLegacyUserAgent(userAgent) {
    if (typeof userAgent !== 'string') return true;
    console.log(`[ProxyService.isLegacyUserAgent] ${userAgent}`);
    const legacyAgents = [
      "NetNewsWire/3",
      "iTunes/10",
      "iTunes/9",
      "iTunes/8",
      "iTunes/7",
      "iTunes/6",
      "iTunes/5",
      "iTunes/4",
      "iTunes/3",
      "iTunes/2",
      "iTunes/1",
    ];
    return legacyAgents.some(s => userAgent.includes(s));
  }

  async handleRequest() {
    try {
      // 0. Auth check
      this.authKey = await Auth.validate(this.request);

      // 1. URL Parameters
      const _targetURL = Codec.decode(this.requestURL);
      const _submittedURL = URL.parse(this.requestURL.searchParams.get('url'));
      this.targetURL = (_targetURL) ? _targetURL : _submittedURL;
      this.option = Option.getOption(this.requestURL.searchParams.get('option'));

      // 2. If we have no target URL, just return the submit form
      if (!this.targetURL) return this.getSubmitForm();

      // 3. Check that we are authorized
      if (!this.authKey) {
        return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
      }

      // 4. Automatically determine option if needed
      if (this.option === Option.auto) {
        console.log(`[ProxyService.handleRequest] autodetecting: ${this.targetURL.toString()}`);
        this.option = await Option.fetchAutoOption(this.targetURL);
        console.log(`[ProxyService.handleRequest] autodetected: Option.${this.option}`);
      }

      // 5. See if someone is submitting a form for a new URL
      if (_submittedURL) return await this.getSubmitResult();

      if (!this.option) {
        return renderError(502, "The target could not be reached", this.targetURL.pathname);
      }

      // 6. Go through the options and service them
      if (this.option === Option.feed) return this.getFeed();
      if (this.option === Option.asset) return this.getAsset();
      if (this.option === Option.image) return this.getImage();
      if (this.option === Option.html) return this.getHTML();
      
      return renderError(400, "Invalid proxy option requested", this.requestURL.pathname);
    } catch (error) {
      console.error(`[ProxyService.handleRequest] Internal Error: ${error.message}`);
      return renderError(500, "An internal server error occurred", this.requestURL.pathname);
    }
  }

  getSubmitForm() {
    const content = `
      <h2>RSS THE PLANET: Proxy</h2>
      <h2>Generate Proxy URL</h2>
      <form action="${Endpoint.proxy}" method="GET">
        <p>
          <label for="key">API Key:</label>
          <input type="text" id="key" name="key">
        </p>
        <p>
          <label for="url">Target URL</label>
          <textarea id="url" name="url" cols="60" rows="10" placeholder="https://example.com/feed.xml"></textarea>      
        </p>
        <fieldset>
          <legend>Proxy Mode</legend>
          <input type="radio" id="opt-auto" name="option" value="${Option.auto}" checked>
          <label for="opt-auto" class="inline">Autodetect</label><br>
          <input type="radio" id="opt-feed" name="option" value="${Option.feed}">
          <label for="opt-feed" class="inline">News Feed (RSS, Atom)</label><br>
          <input type="radio" id="opt-html" name="option" value="${Option.html}">
          <label for="opt-html" class="inline">Web Page</label><br>
          <input type="radio" id="opt-asset" name="option" value="${Option.image}">
          <label for="opt-asset" class="inline">Image</label><br>
          <input type="radio" id="opt-asset" name="option" value="${Option.asset}">
          <label for="opt-asset" class="inline">File (audio, video, etc)</label>
        </fieldset>
        <p>
          <button type="submit">Generate</button>
          <button type="reset" class="secondary ml">Reset</button>
        </p>
      </form>
    `;
    return new Response(renderLayout("RSS THE PLANET: Proxy", content), {
      headers: { "Content-Type": "text/html" },
      status: 200
    });
  }

  async getSubmitResult() { 
    if (!(this.targetURL instanceof URL) 
     || !(this.baseURL instanceof URL) 
     || !this.authKey) 
    { throw new Error("Parameter Error: submittedURL, baseURL, authKey"); }
    const encodedURL = Codec.encode(this.targetURL, this.option, this.baseURL, this.authKey);
    const bodyContent = `${encodedURL.toString()}`;
    return new Response(bodyContent, {
      headers: { "Content-Type": "text/plain" },
      status: 200
    });
  }

  async getFeed() { 
    if (!(this.targetURL instanceof URL)
     || !(this.baseURL instanceof URL)
     || !this.requestHeaders
     || !this.requestMethod
     || typeof this.authKey !== "string") 
     { throw new Error("Parameter Error: targetURL, baseURL, requestHeaders, requestMethod, authKey"); }
    
    let requestHeaders = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    if (this.requestMethod !== "GET") {
      // Bail out immediately if we are 
      // not proxying a normal GET request
      return fetch(this.targetURL, {
        method: this.requestMethod,
        headers: requestHeaders,
        redirect: 'follow'
      });
    }
    
    console.log(`[ProxyService.feed] rewrite-start: ${this.targetURL.toString()}`);
    try {
      // 1. Download the original feed
      const response = await fetch(this.targetURL, {
        method: this.requestMethod,
        headers: requestHeaders,
        redirect: 'follow'
      });
      if (!response.ok) {
        console.error(`[ProxyService.feed] fetch() response(${response.status})`);
        return response;
      }
      
      // Download and Rewrite XML
      const originalXML = await response.text();
      const rewrittenXML = await this.rewriteFeedXML(originalXML);
      
      // Return Response
      const rewrittenXMLSize = new TextEncoder().encode(rewrittenXML).length;
      const responseHeaders = ProxyService.sanitizedResponseHeaders(response.headers);
      responseHeaders.set('Content-Type', 'text/xml; charset=utf-8');
      responseHeaders.set('Content-Length', rewrittenXMLSize);
      console.log(`[ProxyService.feed] rewrite-done: ${this.targetURL.toString()} size: ${rewrittenXMLSize.toString()}`);
      return new Response(rewrittenXML, {
        status: response.status,
        headers: responseHeaders
      });
    } catch (error) {
      console.error(`[ProxyService.feed] fetch() ${error.message}`);
      return renderError(502, "The target could not be reached", this.targetURL.pathname);
    }
  }

  async getHTML() { 
    if (!(this.targetURL instanceof URL)
     || !(this.baseURL instanceof URL)
     || !this.requestHeaders
     || !this.requestMethod
     || typeof this.authKey !== "string") 
     { throw new Error("Parameter Error: targetURL, baseURL, requestHeaders, requestMethod, authKey"); }
    
    let requestHeaders = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    if (this.requestMethod !== "GET") {
      // Bail out immediately if we are 
      // not proxying a normal GET request
      return fetch(this.targetURL, {
        method: this.requestMethod,
        headers: requestHeaders,
        redirect: 'follow'
      });
    }
    
    console.log(`[ProxyService.html] rewrite-start: ${this.targetURL.toString()}`);
    try {
      const response = await fetch(this.targetURL, {
        method: this.requestMethod,
        headers: ProxyService.sanitizedRequestHeaders(this.requestHeaders),
        redirect: 'follow'
      });

      if (!response.ok) return response;
      const rewrittenResponse = await this.rewriteHTML(response);
      const responseHeaders = ProxyService.sanitizedResponseHeaders(rewrittenResponse.headers);
      responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(rewrittenResponse.body, {
        status: response.status,
        headers: responseHeaders
      });
    } catch (error) {
      console.error(`[ProxyService.html] error: ${error.message}`);
      return renderError(502, "The target could not be reached", this.targetURL.pathname);
    }
  }

  getAsset() { 
    if (!(this.targetURL instanceof URL)
     || !this.requestHeaders
     || !this.requestMethod
     || typeof this.authKey !== "string") 
    { throw new Error("Parameter Error: targetURL, requestHeaders, requestMethod, authKey"); }
    
    const headers = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    console.log(`[ProxyService.asset] passing through: ${this.targetURL.toString()}`);
    
    // TODO: Add cache-control
    return fetch(this.targetURL, {
      method: this.requestMethod,
      headers: headers,
      redirect: 'follow'
    });
  }

  getImage() { 
    if (!(this.targetURL instanceof URL)
     || !this.requestHeaders
     || !this.requestMethod
     || typeof this.authKey !== "string") 
    { throw new Error("Parameter Error: targetURL, requestHeaders, requestMethod, authKey"); }
    
    const headers = ProxyService.sanitizedRequestHeaders(this.requestHeaders);
    
    // Image Resizing with Cloudflare
    const wsrvURL = new URL("https://wsrv.nl/");
    wsrvURL.searchParams.set("url", this.targetURL.toString());
    wsrvURL.searchParams.set("w", "1024");
    wsrvURL.searchParams.set("h", "1024");
    wsrvURL.searchParams.set("fit", "inside");
    wsrvURL.searchParams.set("we", "1");    // Don't enlarge smaller images
    wsrvURL.searchParams.set("output", "jpg");
    wsrvURL.searchParams.set("q", "75");
    console.log(`[ProxyService.image] resizing via wsrv.nl: ${this.targetURL.toString()}`);
    
    return fetch(wsrvURL, {
      headers: headers,
    });
  }

  async rewriteFeedXML(originalXML) {

    const XML_rewriteEntryHTML = async (entry) => {
      const fields = [
        "description",       // RSS 2.0 Summary/Content
        "content:encoded",   // RSS 2.0 Full Content
        "content",           // Atom Full Content
        "summary"            // Atom Summary
      ];
      for (const field of fields) {
        if (!entry[field]) continue;
        const isCDATA = (typeof entry[field] === "object" && entry[field]["__cdata"]) ;
        const originalHTML = isCDATA ? entry[field]["__cdata"] : entry[field]
        let rewrittenHTML = await this.rewriteHTMLString(originalHTML);
        if (isCDATA) entry[field]["__cdata"] = rewrittenHTML;
        else entry[field] = rewrittenHTML;
      }
    };

    const XML_encodeURL = async (parent, key, option, isLegacyClient = false, where) => {
      if (!parent) return;
      if (Array.isArray(parent)) {
        for (const item of parent) {
          await XML_encodeURL(item, key, option, isLegacyClient, where);
        }
        return;
      }
      const target = parent[key];
      if (!target) return;
      if (where && !where(parent)) return;
      const rawValue = (typeof target === "object" && target.__cdata) ? target.__cdata : target;
      if (typeof rawValue !== "string") return;
      const rawURL = URL.parse(rawValue.trim());
      if (!rawURL) return;
      const finalURL = Codec.encode(rawURL, option, this.baseURL, this.authKey);
      const finalURLString = finalURL.toString();
      parent[key] = (typeof target === "object" && "__cdata" in target) 
                  ? { "__cdata": finalURLString } 
                  : finalURLString;
    };
    
    if (!(this.baseURL instanceof URL)
     || typeof originalXML !== "string"
     || typeof this.authKey !== "string") 
    { throw new Error("Parameter Error: baseURL, originalXML, authKey"); }
    
    // 1. Create Parser and Builder
    const parser = new XMLParser({ 
      ignoreAttributes: false, 
      attributeNamePrefix: "@_",
      parseTagValue: false,
      cdataPropName: "__cdata"
    });
    const builder = new XMLBuilder({ 
      ignoreAttributes: false, 
      format: false,
      suppressBooleanAttributes: false,
      suppressEmptyNode: true,
      cdataPropName: "__cdata"
    });
    
    // 2. Start Processing
    // While we do know if its a legacy client. For performance reasons, 
    // we just cannot heavily encode every URL. 
    // So only the critical itunes ones get the heavy treatment
    const maxEntries = (this.isLegacyClient) ? 10 : 30;
    let xml = parser.parse(originalXML);
    if (xml["?xml-stylesheet"]) delete xml["?xml-stylesheet"]; // Delete any stylesheet
    
    // 3 Patch the Atom Channel
    const rssChannel = xml.rss?.channel;
    if (rssChannel) {
      // 3.1 Delete itunes:new-feed-url
      delete rssChannel["itunes:new-feed-url"];
      // 3.2 Replace itunes:image
      await XML_encodeURL(rssChannel["itunes:image"], "@_href", Option.image, this.isLegacyClient);
      // 3.3 Replace Links
      await XML_encodeURL(rssChannel, "link", Option.auto, this.isLegacyClient);
      // 3.4 Replace Self Link
      await XML_encodeURL(rssChannel["atom:link"], "@_href", Option.feed, false, item => {
        return item["@_rel"] === "self";
      });
      // 3.5 Replace the channel image
      await XML_encodeURL(rssChannel.image, "url", Option.image, false);
      await XML_encodeURL(rssChannel.image, "link", Option.auto, false);
      
      // 4 Patch each item in the channel
      // 4.1 Limit to maxEntries
      if (Array.isArray(rssChannel.item)) {
        rssChannel.item = rssChannel.item.slice(0, maxEntries);
      } else if (rssChannel.item) {
        rssChannel.item = [rssChannel.item];
      } else {
        rssChannel.item = [];
      }
      for (const item of rssChannel.item) {
        // 4.2 Replace the Link property
        await XML_encodeURL(item, "link", Option.auto, false);
        // 4.3 Replace the itunes image url
        await XML_encodeURL(item["itunes:image"], "@_href", Option.image, this.isLegacyClient);
        // 4.4 Replace enclosure url
        await XML_encodeURL(item.enclosure, "@_url", Option.asset, this.isLegacyClient);
        // 4.5 Replace media:content
        await XML_encodeURL(item["media:content"], "@_url", Option.asset, this.isLegacyClient);
        // 4.6 Rewrite the HTML in summaries and descriptions
        await XML_rewriteEntryHTML(item);
      }
    }
    const rssFeed = xml.feed;
    // 5 Patch the RSS feed
    if (rssFeed) {
      // 5.1 Proxy all of the link references
      if (!Array.isArray(rssFeed.link)) rssFeed.link = (rssFeed.link) 
                                                     ? [rssFeed.link] 
                                                     : [];
      for (const link of rssFeed.link) {
        const linkURL = URL.parse(link["@_href"]);
        if (!linkURL) continue;
        let option = Option.auto;
        if (link["@_type"]?.toLowerCase().includes("html" )) option = Option.html;
        if (link["@_type"]?.toLowerCase().includes("xml"  )) option = Option.feed;
        if (link["@_type"]?.toLowerCase().includes("rss"  )) option = Option.feed;
        if (link["@_type"]?.toLowerCase().includes("atom" )) option = Option.feed;
        if (link["@_type"]?.toLowerCase().includes("audio")) option = Option.asset;
                if (link["@_type" ]?.toLowerCase().includes("image")) option = Option.image;
                if (link["@_rel" ]?.toLowerCase().includes("self" )) option = Option.feed;
                link["@_href"] = Codec.encode(linkURL, option, this.baseURL, this.authKey).toString();
        
      }
      
      // 5.2 replace logo and icon which are in the spec
      await XML_encodeURL(rssFeed, "logo", Option.image, false);
      await XML_encodeURL(rssFeed, "icon", Option.image, false);
      
      // 6 Correct all of the entries
      
      // 6.1 Limit to max entries
      if (Array.isArray(rssFeed.entry)) {
        rssFeed.entry = rssFeed.entry.slice(0, maxEntries);
      } else if (rssFeed.entry) {
        rssFeed.entry = [rssFeed.entry];
      } else {
        rssFeed.entry = [];
      }
      
      // 6.2 Patch each link entry
      for (const entry of rssFeed.entry) {
        if (!Array.isArray(entry.link)) entry.link = (entry.link) 
                                                   ? [entry.link] 
                                                   : [];
                                                   
        for (const link of entry.link) {
          const linkURL = URL.parse(link["@_href"]);
          if (!linkURL) continue;
          let option = Option.auto;
          if (link["@_type"]?.toLowerCase().includes("html" )) option = Option.html;
          if (link["@_type"]?.toLowerCase().includes("xml"  )) option = Option.feed;
          if (link["@_type"]?.toLowerCase().includes("rss"  )) option = Option.feed;
          if (link["@_type"]?.toLowerCase().includes("atom" )) option = Option.feed;
          if (link["@_type"]?.toLowerCase().includes("audio")) option = Option.asset;
          if (link["@_type"]?.toLowerCase().includes("image")) option = Option.image;
          link["@_href"] = Codec.encode(linkURL, option, this.baseURL, this.authKey).toString();
        }
        
        // 6.3 Rewrite the HTML in summaries and descriptions
        await XML_rewriteEntryHTML(entry);
      }
    }

    return builder.build(xml);
  }

  async rewriteHTMLString(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return htmlString;
    const tempResponse = new Response(htmlString);
    const transformed = await this.rewriteHTML(tempResponse);
    return await transformed.text();
  }

  async rewriteHTML(response) { 
    const removeScripts = new HTMLRewriter()
      .on('script',   { element: el => el.remove() })
      .on('noscript',   { element: el => el.removeAndKeepContent() })
      .transform(response);
    
    return new HTMLRewriter()
      // Rewrite Links
      .on('a', {
        element: (el) => {
          const href = el.getAttribute('href');
          if (href) {
            const target = URL.parse(href, this.targetURL);
            if (target) {
              const proxied = Codec.encode(target, Option.auto, this.baseURL, this.authKey);
              el.setAttribute('href', proxied.toString());
            }
          }
        }
      })
      // Rewrite onClick and other on functions
      .on('*', {
        element: (el) => {
          // el.attributes is an iterator of [name, value]
          for (const [name] of el.attributes) {
            if (name.startsWith('on')) {
              el.removeAttribute(name);
            }
          }
        }
      })
      // Rewrite Images
      .on('img', {
        element: (el) => {
          const src = el.getAttribute('src');
          if (src) {
            const target = URL.parse(src, this.targetURL);
            if (target) {
              const proxied = Codec.encode(target, Option.image, this.baseURL, this.authKey);
              el.setAttribute('src', proxied.toString());
            }
          }
        }
      })
      // Rewrite Assets
      .on('video, audio, source', {
        element: (el) => {
          const src = el.getAttribute('src');
          if (src) {
            const target = URL.parse(src, this.targetURL);
            if (target) {
              const proxied = Codec.encode(target, Option.asset, this.baseURL, this.authKey);
              el.setAttribute('src', proxied.toString());
            }
          }
        }
      })
      // Rewrite Stylesheets
      .on('link[rel="stylesheet"]', {
        element: (el) => {
          const href = el.getAttribute('href');
          if (href) {
            const target = URL.parse(href, this.targetURL);
            if (target) {
              const proxied = Codec.encode(target, Option.asset, this.baseURL, this.authKey);
              el.setAttribute('href', proxied.toString());
            }
          }
        }
      })
      // Rewrite SRCSETS (choose the best picture under 1000px)
      .on('img, source', {
        element: (el) => {
          const srcset = el.getAttribute('srcset');
          
          if (srcset) {
            // 1. Split into individual candidates
            const candidates = srcset.split(',').map(entry => {
              const parts = entry.trim().split(/\s+/);
              const url = parts[0];
              // Parse width (e.g., "1080w" -> 1080). Default to 0 if not found.
              const width = parts[1] && parts[1].endsWith('w') 
                            ? parseInt(parts[1].slice(0, -1), 10) 
                            : 0;
              return { url, width };
            });
      
            // 2. Filter for those under 1000px, then sort descending (largest first)
            const suitable = candidates
              .filter(c => c.width > 0 && c.width <= 1000)
              .sort((a, b) => b.width - a.width);
      
            // 3. Choose the winner
            // If we found one under 1000, take the largest of those.
            // Otherwise, fallback to the first one in the original list (usually the smallest).
            const winner = suitable.length > 0 ? suitable[0] : candidates[0];
      
            if (winner && winner.url) {
              const target = URL.parse(winner.url, this.targetURL);
              if (target) {
                const proxied = Codec.encode(target, Option.image, this.baseURL, this.authKey);
                el.setAttribute('src', proxied.toString());
              }
            }
      
            // 4. ALWAYS remove the original srcset
            // This stops modern-ish retro browsers from trying to be "smart"
            el.removeAttribute('srcset');
            el.removeAttribute('sizes');
          } else {
            // ... existing src-only rewriting logic ...
          }
        }
      })
      .transform(removeScripts);
  }

  static sanitizedRequestHeaders(incomingHeaders) {
    const forbidden = [
      'host',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'content-length',
       // TODO: Debugging
      'if-none-match',
      'if-modified-since',
    ];

    const headers = new Headers();
    for (const [key, value] of incomingHeaders.entries()) {
      if (!forbidden.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    
    // Optional: Set a User-Agent so sites don't block you as a bot
    if (!headers.has('user-agent')) {
      headers.set('User-Agent', 'Overcast/3.0 (+http://overcast.fm/; iOS podcast app)');
    }

    return headers;
  }

  static sanitizedResponseHeaders(incomingHeaders) {
    const forbidden = [
      'content-length',
      'content-encoding',
      'transfer-encoding',
      'connection',
      'keep-alive',
      'content-security-policy-report-only',
      'content-security-policy',
    ];

    const headers = new Headers();
    for (const [key, value] of incomingHeaders.entries()) {
      if (!forbidden.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    return headers;
  }
}
