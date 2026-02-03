import * as Auth from './auth.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

let XP_HTMLRewriter;
if (globalThis.HTMLRewriter) {
  console.log("[proxy] Using HTMLRewriter from Cloudflare");
  XP_HTMLRewriter = globalThis.HTMLRewriter;
} else {
  console.log("[proxy] Using HTMLRewriter from Node.js");
  const packageName = "htmlrewriter"; 
  const mod = await import(packageName);
  XP_HTMLRewriter = mod.HTMLRewriter;
}

// MARK: Custom Types

export const Option = {
  auto:  "auto",
  feed:  "feed",
  html:  "html",
  asset: "asset",
  image: "image",
  getOption(parameter) {
    if (typeof parameter !== 'string') return this.auto;
    const normalized = parameter.toLowerCase();
    const validOptions = [this.auto, this.feed, this.html, this.asset, this.image];
    return validOptions.includes(normalized) ? normalized : this.auto;
  },
  async fetchAutoOption(targetURL) {
  try {
    let response = await fetch(targetURL, { method: 'HEAD' });
    if (!response.ok) return null;
    const contentType = response.headers.get("Content-Type") || "";
    console.log(`[proxy.Option] autodetected Content-Type: ${contentType}`);
    if (contentType.includes("xml"))   return Option.feed; 
    if (contentType.includes("rss"))   return Option.feed;
    if (contentType.includes("atom"))  return Option.feed;
    if (contentType.includes("html"))  return Option.html;
    if (contentType.includes("image")) return Option.image;
    return Option.asset;
  } catch (e) {
    console.error(`[proxy.getAuto] error: ${e.message}`);
    return null;
  }
}
};

Object.freeze(Option);

// MARK: Controller

export async function getProxyResponse(request) {

  // 0. URL Parameters
  const requestURL = new URL(request.url);
  const baseURL = new URL(Auth.PROXY_VALID_PATH, requestURL.origin);
  const _targetURL = decode(requestURL);
  const _submittedURL = URL.parse(requestURL.searchParams.get('url'));
  const targetURL = (_targetURL) 
                   ? _targetURL
                   : _submittedURL;
  let option = Option.getOption(requestURL.searchParams.get('option'));
  
  // 1.If we have no target URL, just return the submit form
  if (!targetURL) return getSubmitForm();
  
  // 2. Check that we are authorized
  const authorizedAPIKey = getAuthorizedAPIKey(requestURL.searchParams.get('key'));
  if (!authorizedAPIKey) return Auth.errorUnauthorized(requestURL.pathname);
  
  // 3. Automatically determine option if needed
  if (option === Option.auto) {
    console.log(`[proxy.getProxyResponse] autodetecting: ${targetURL.toString()}`);
    option = await Option.fetchAutoOption(targetURL);
    console.log(`[proxy.getProxyResponse] autodetected: Option.${option}`);
  }
  
  // 4. See if someone is submitting a form for a new URL
  if (_submittedURL) return getSubmitResult(targetURL, 
                                            baseURL, 
                                            option, 
                                            authorizedAPIKey);

  if (!option) return Auth.errorTargetUnreachable(targetURL.pathname); 
  
  // 5. Go through the options and service them
  if (option === Option.feed) return getFeed(targetURL, 
                                             baseURL,
                                             request.headers,
                                             request.method, 
                                             authorizedAPIKey);
  if (option === Option.asset) return getAsset(targetURL, 
                                               request.headers, 
                                               request.method, 
                                               authorizedAPIKey);
  if (option === Option.image) return getImage(targetURL, 
                                               request.headers, 
                                               request.method, 
                                               authorizedAPIKey);
  if (option === Option.html) return getHTML(targetURL, 
                                             baseURL,
                                             request.headers,
                                             request.method, 
                                             authorizedAPIKey);
  return null;
}

function getAuthorizedAPIKey(apiKey) {
  if (!apiKey) return null;
  return Auth.VALID_KEYS.has(apiKey) ? apiKey : null;
}

function getSubmitForm() {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Retro Mac Proxy</title>
  </head>
  <body>
    <h2>About Retro Mac Proxy</h2>
    <p>
      This proxy server is meant for retro Macs (or other computers) that are
      internet native and use common services such as RSS Readers or Podcast
      players BUT suffer from TLS/SSL problems due to expired Certificate
      Authorities or lack of modern TLS protocols.
    </p>
    <h2>Generate Proxy URL</h2>
    <form action="${Auth.PROXY_VALID_PATH}" method="GET">
      <p>
        <label for="key">API Key:</label><br>
        <input type="text" id="key" name="key">
      </p>
      <p>
        <label for="url">Target URL</label><br>
        <textarea id="url" name="url" cols="60" rows="10"></textarea>      
      </p>
      <fieldset>
        <legend>Proxy Mode</legend>
        <input type="radio" id="opt-auto" name="option" value="${Option.auto}" checked>
        <label for="opt-auto">Autodetect content-type for Target URL (slower)</label><br>
        <input type="radio" id="opt-feed" name="option" value="${Option.feed}">
        <label for="opt-feed">Target URL is RSS or Atom Feed</label><br>
        <input type="radio" id="opt-html" name="option" value="${Option.html}">
        <label for="opt-feed">Target URL is Web Page (Unimplemented)</label><br>
        <input type="radio" id="opt-asset" name="option" value="${Option.asset}">
        <label for="opt-asset">Target URL is binary asset such as image or audio file</label>
      </fieldset>
      <p>
        <button type="submit">Generate</button>
        <button type="reset">Reset</button>
      </p>
    </form>
  </body>
  </html>
  `;
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 200
  });
}

function getSubmitResult(submittedURL, 
                         baseURL, 
                         option, 
                         authorizedAPIKey) 
{
  if (!(submittedURL instanceof URL) 
   || !(baseURL instanceof URL) 
   || !authorizedAPIKey) 
  { throw new Error("Parameter Error: submittedURL, baseURL, authorizedAPIKey"); }
  const encodedURL = encode(submittedURL, 
                            baseURL, 
                            option, 
                            authorizedAPIKey);
  const bodyContent = `${encodedURL.toString()}`;
  return new Response(bodyContent, {
    headers: { "Content-Type": "text/plain" },
    status: 200
  });
}

async function getFeed(targetURL, 
                       baseURL,
                      _requestHeaders,
                       requestMethod, 
                       authorizedAPIKey) 
{
  if (!(targetURL instanceof URL)
   || !(baseURL instanceof URL)
   || !_requestHeaders
   || !requestMethod
   || typeof authorizedAPIKey !== "string") 
   { throw new Error("Parameter Error: targetURL, baseURL, requestHeaders, requestMethod, authorizedAPIKey"); }
  
  let requestHeaders = sanitizedRequestHeaders(_requestHeaders);
  if (requestMethod !== "GET") {
    // Bail out immediately if we are 
    // not proxying a normal GET request
    return fetch(targetURL, {
      method: requestMethod,
      headers: requestHeaders,
      redirect: 'follow'
    });
  }
  
  console.log(`[proxy.feed] rewrite-start: ${targetURL.toString()}`);
  try {
    // 1. Download the original feed
    const response = await fetch(targetURL, {
      method: requestMethod,
      headers: requestHeaders,
      redirect: 'follow'
    });
    if (!response.ok) {
      console.error(`[proxy.feed] fetch() response(${response.status})`);
      return response;
    }
    
    // Download and Rewrite XML
    const originalXML = await response.text();
    const rewrittenXML = await rewriteFeedXML(originalXML, 
                                              targetURL, 
                                              baseURL, 
                                              authorizedAPIKey);
    
    // Return Response
    const rewrittenXMLSize = new TextEncoder().encode(rewrittenXML).length;
    const responseHeaders = sanitizedResponseHeaders(response.headers);
    responseHeaders.set('Content-Type', 'text/xml; charset=utf-8');
    responseHeaders.set('Content-Length', rewrittenXMLSize);
    console.log(`[proxy.feed] rewrite-done: ${targetURL.toString()} size: ${rewrittenXMLSize.toString()}`);
    return new Response(rewrittenXML, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[proxy.feed] fetch() ${error.message}`);
    return Auth.errorTargetUnreachable(targetURL.pathname);
  }
}

async function getHTML(targetURL, 
                       baseURL,
                      _requestHeaders,
                       requestMethod, 
                       authorizedAPIKey) 
{
  if (!(targetURL instanceof URL)
   || !(baseURL instanceof URL)
   || !_requestHeaders
   || !requestMethod
   || typeof authorizedAPIKey !== "string") 
   { throw new Error("Parameter Error: targetURL, baseURL, requestHeaders, requestMethod, authorizedAPIKey"); }
  
  let requestHeaders = sanitizedRequestHeaders(_requestHeaders);
  if (requestMethod !== "GET") {
    // Bail out immediately if we are 
    // not proxying a normal GET request
    return fetch(targetURL, {
      method: requestMethod,
      headers: requestHeaders,
      redirect: 'follow'
    });
  }
  
  console.log(`[proxy.html] rewrite-start: ${targetURL.toString()}`);
  try {
    const response = await fetch(targetURL, {
      method: requestMethod,
      headers: sanitizedRequestHeaders(_requestHeaders),
      redirect: 'follow'
    });

    if (!response.ok) return response;
    const rewrittenResponse = rewriteHTML(response, 
                                          targetURL, 
                                          baseURL, 
                                          authorizedAPIKey);
    const responseHeaders = sanitizedResponseHeaders(rewrittenResponse.headers);
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(rewrittenResponse.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[proxy.html] error: ${error.message}`);
    return Auth.errorTargetUnreachable(targetURL.pathname);
  }
}

function getAsset(targetURL, 
                  requestHeaders, 
                  requestMethod, 
                  authorizedAPIKey) 
{
  if (!(targetURL instanceof URL)
   || !requestHeaders
   || !requestMethod
   || typeof authorizedAPIKey !== "string") 
  { throw new Error("Parameter Error: targetURL, requestHeaders, requestMethod, authorizedAPIKey"); }
  
  const headers = sanitizedRequestHeaders(requestHeaders);
  console.log(`[proxy.asset] passing through: ${targetURL.toString()}`);
  
  // TODO: Add cache-control
  return fetch(targetURL, {
    method: requestMethod,
    headers: headers,
    redirect: 'follow'
  });
}

function getImage(targetURL, 
                  requestHeaders, 
                  requestMethod, 
                  authorizedAPIKey) 
{
  if (!(targetURL instanceof URL)
   || !requestHeaders
   || !requestMethod
   || typeof authorizedAPIKey !== "string") 
  { throw new Error("Parameter Error: targetURL, requestHeaders, requestMethod, authorizedAPIKey"); }
  
  const headers = sanitizedRequestHeaders(requestHeaders);
  
  // Image Resizing with Cloudflare
  const wsrvURL = new URL("https://wsrv.nl/");
  wsrvURL.searchParams.set("url", targetURL.toString());
  wsrvURL.searchParams.set("w", "1024");
  wsrvURL.searchParams.set("h", "1024");
  wsrvURL.searchParams.set("fit", "inside");
  wsrvURL.searchParams.set("we", "1");    // Don't enlarge smaller images
  wsrvURL.searchParams.set("output", "jpg");
  wsrvURL.searchParams.set("q", "75");
  console.log(`[proxy.image] resizing via wsrv.nl: ${targetURL.toString()}`);
  
  return fetch(wsrvURL, {
    headers: headers,
  });
}

// MARK: Model (Testable)

export async function rewriteFeedXML(originalXML, 
                                     targetURL, 
                                     baseURL, 
                                     authorizedAPIKey) 
{

  async function XML_rewriteEntryHTML(entry) {
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
      let rewrittenHTML = await rewriteHTMLString(originalHTML,
                                                  targetURL, 
                                                  baseURL, 
                                                  authorizedAPIKey);
      if (isCDATA) entry[field]["__cdata"] = rewrittenHTML;
      else entry[field] = rewrittenHTML;
    }
  }

  function XML_encodeURL(parent, key, option, where) {
    if (!parent) return;
    if (Array.isArray(parent)) {
      parent.forEach(item => XML_encodeURL(item, key, option, where));
      return;
    }
    const target = parent[key];
    if (!target) return;
    if (where && !where(parent)) return;
    const rawValue = (typeof target === "object" && target.__cdata) ? target.__cdata : target;
    if (typeof rawValue !== "string") return;
    const rawURL = URL.parse(rawValue.trim());
    if (!rawURL) return;
    const finalURL = encode(rawURL, baseURL, option, authorizedAPIKey).toString();
    parent[key] = (typeof target === "object" && "__cdata" in target) ? { "__cdata": finalURL } : finalURL;
  }
  
  if (!(baseURL instanceof URL)
   || typeof originalXML !== "string"
   || typeof authorizedAPIKey !== "string") 
  { throw new Error("Parameter Error: baseURL, originalXML, authorizedAPIKey"); }


  // 1. Set time limit for articles
  const timelimit = new Date();
  timelimit.setMonth(timelimit.getMonth() - 12);
  
  // 2. Create Parser and Builder
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
  
  // Start Processing
  let xml = parser.parse(originalXML);
  if (xml["?xml-stylesheet"]) delete xml["?xml-stylesheet"]; // Delete any stylesheet
  
  // 3 Patch the Atom Channel
  const rssChannel = xml.rss?.channel;
  if (rssChannel) {
    // 3.1 Delete itunes:new-feed-url
    delete rssChannel["itunes:new-feed-url"];
    // 3.2 Replace itunes:image
    XML_encodeURL(rssChannel["itunes:image"], "@_href", Option.image);
    // 3.3 Replace Links
    XML_encodeURL(rssChannel, "link", Option.auto);
    // 3.4 Replace Self Link
    XML_encodeURL(rssChannel["atom:link"], "@_href", Option.feed, item => {
      return item["@_rel"] === "self";
    });
    // 3.5 Replace the channel image
    XML_encodeURL(rssChannel.image, "url", Option.image);
    XML_encodeURL(rssChannel.image, "link", Option.auto);
    // 4 Patch each item in the channel
    if (!Array.isArray(rssChannel.item)) rssChannel.item = (rssChannel.item) 
                                                   ? [rssChannel.item] 
                                                   : [];
    // 4.1 Remove items older than the time limit
    rssChannel.item = rssChannel.item.filter(item => {
      const pubDate = new Date(item.pubDate);
      return pubDate > timelimit;
    });
    for (const item of rssChannel.item) {
      // 4.2 Replace the Link property
      XML_encodeURL(item, "link", Option.auto);
      // 4.3 Replace the itunes image url
      XML_encodeURL(item["itunes:image"], "@_href", Option.image);
      // 4.4 Replace enclosure url
      XML_encodeURL(item.enclosure, "@_url", Option.asset);
      // 4.5 Rewrite the HTML in summaries and descriptions
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
    rssFeed.link.forEach(link => {
      const linkURL = URL.parse(link["@_href"]);
      if (!linkURL) return;
      let option = Option.auto;
      if (link["@_type"]?.toLowerCase().includes("html" )) option = Option.html;
      if (link["@_type"]?.toLowerCase().includes("xml"  )) option = Option.feed;
      if (link["@_type"]?.toLowerCase().includes("rss"  )) option = Option.feed;
      if (link["@_type"]?.toLowerCase().includes("atom" )) option = Option.feed;
      if (link["@_type"]?.toLowerCase().includes("audio")) option = Option.asset;
      if (link["@_type"]?.toLowerCase().includes("image")) option = Option.image;
      if (link["@_rel" ]?.toLowerCase().includes("self" )) option = Option.feed;
      link["@_href"] = encode(linkURL, 
                              baseURL, 
                              option,
                              authorizedAPIKey)
                             .toString();
    });
    
    // 5.2 replace logo and icon which are in the spec
    XML_encodeURL(rssFeed, "logo", Option.image);
    XML_encodeURL(rssFeed, "icon", Option.image);
    
    // 6 Correct all of the entries
    if (!Array.isArray(rssFeed.entry)) rssFeed.entry = (rssFeed.entry) 
                                               ? [rssFeed.entry] 
                                               : [];
    // 6.1 Remove items older than the time limit
    rssFeed.entry = rssFeed.entry.filter(item => {
      const updated = new Date(item.updated);
      return updated > timelimit;
    });
    
    // 6.2 Patch each link entry
    for (const entry of rssFeed.entry) {
      if (!Array.isArray(entry.link)) entry.link = (entry.link) 
                                                 ? [entry.link] 
                                                 : [];
                                                 
      entry.link.forEach(link => {
        const linkURL = URL.parse(link["@_href"]);
        if (!linkURL) return;
        let option = Option.auto;
        if (link["@_type"]?.toLowerCase().includes("html" )) option = Option.html;
        if (link["@_type"]?.toLowerCase().includes("xml"  )) option = Option.feed;
        if (link["@_type"]?.toLowerCase().includes("rss"  )) option = Option.feed;
        if (link["@_type"]?.toLowerCase().includes("atom" )) option = Option.feed;
        if (link["@_type"]?.toLowerCase().includes("audio")) option = Option.asset;
        if (link["@_type"]?.toLowerCase().includes("image")) option = Option.image;
        link["@_href"] = encode(linkURL, 
                                baseURL, 
                                option,
                                authorizedAPIKey)
                               .toString();
      });
      
      // 6.3 Rewrite the HTML in summaries and descriptions
      await XML_rewriteEntryHTML(entry);
    }
  }

  return builder.build(xml);
}

async function rewriteHTMLString(htmlString, targetURL, baseURL, authorizedAPIKey) {
  if (!htmlString || typeof htmlString !== 'string') return htmlString;
  const tempResponse = new Response(htmlString);
  const transformed = rewriteHTML(tempResponse, targetURL, baseURL, authorizedAPIKey);
  return await transformed.text();
}

export function rewriteHTML(response, 
                           _targetURL,
                            baseURL, 
                            authorizedAPIKey) 
{
  const removeScripts = new XP_HTMLRewriter()
    .on('script',   { element: el => el.remove() })
    .on('noscript',   { element: el => el.removeAndKeepContent() })
    .transform(response);
  
  return new XP_HTMLRewriter()
    // Rewrite Links
    .on('a', {
      element(el) {
        const href = el.getAttribute('href');
        if (href) {
          const target = URL.parse(href, _targetURL);
          if (target) {
            const proxied = encode(target, baseURL, Option.auto, authorizedAPIKey);
            el.setAttribute('href', proxied.toString());
          }
        }
      }
    })
    // Rewrite onClick and other on functions
    .on('*', {
      element(el) {
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
      element(el) {
        const src = el.getAttribute('src');
        if (src) {
          const target = URL.parse(src, _targetURL);
          if (target) {
            const proxied = encode(target, baseURL, Option.image, authorizedAPIKey);
            el.setAttribute('src', proxied.toString());
          }
        }
      }
    })
    // Rewrite Assets
    .on('video, audio, source', {
      element(el) {
        const src = el.getAttribute('src');
        if (src) {
          const target = URL.parse(src, _targetURL);
          if (target) {
            const proxied = encode(target, baseURL, Option.asset, authorizedAPIKey);
            el.setAttribute('src', proxied.toString());
          }
        }
      }
    })
    // Rewrite Stylesheets
    .on('link[rel="stylesheet"]', {
      element(el) {
        const href = el.getAttribute('href');
        if (href) {
          const target = URL.parse(href, _targetURL);
          if (target) {
            const proxied = encode(target, baseURL, Option.asset, authorizedAPIKey);
            el.setAttribute('href', proxied.toString());
          }
        }
      }
    })
    // Rewrite SRCSETS (choose the best picture under 1000px)
    .on('img, source', {
      element(el) {
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
            const target = URL.parse(winner.url, _targetURL);
            if (target) {
              const proxied = encode(target, baseURL, Option.image, authorizedAPIKey);
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

export function encode(targetURL, 
                       baseURL, 
                       targetOption, 
                       authorizedAPIKey) 
{  
  if (!(targetURL  instanceof URL)
   || !(baseURL instanceof URL)
   || typeof authorizedAPIKey !== "string") 
  { throw new Error(`Parameter Error: targetURL(${targetURL}), baseURL(${baseURL}), targetOption(${targetOption}), authorizedAPIKey(${authorizedAPIKey})`); }
  
  if (!baseURL.toString().endsWith(Auth.PROXY_VALID_PATH)) {
    console.log(`[WARNING] BaseURL does not end with ${Auth.PROXY_VALID_PATH}: ${baseURL.toString()}`);
  }
  
   // HACK for Podtrac - it often makes URLs that are too long
  if (targetURL.hostname.includes("podtrac.com") && 
      targetURL.pathname.startsWith("/redirect.mp3")) 
  {
    const hostingMarkers = [
      "stitcher.simplecastaudio.com",
      "traffic.libsyn.com",
      "traffic.megaphone.fm",
      "api.spreaker.com",
      "traffic.omny.fm",
    ];
    const urlString = targetURL.toString();
    for (const marker of hostingMarkers) {
      if (urlString.includes(marker)) {
        console.log(`[proxy.encode] removed podtrac ${targetURL.toString()}`);
        const [pathOnly] = urlString.split('?');
        const startIndex = pathOnly.indexOf(marker);
        const cleanPath = pathOnly.substring(startIndex);
        targetURL = new URL("https://" + cleanPath);
        break;
      }
    }
  }
  
  // HACK for blubrry
  if (targetURL.hostname.includes("media.blubrry.com")) {
    const [pathOnly] = targetURL.toString().split('?');
    const segments = pathOnly.split('/');
    // Pattern: https://media.blubrry.com/SLUG/REAL_DOMAIN/PATH
    // Segments: ["https:", "", "media.blubrry.com", "SLUG", "REAL_DOMAIN", ...]
    if (segments.length > 4) {
      console.log(`[proxy.encode] removed blubrry ${targetURL.toString()}`);
      targetURL = new URL("https://" + segments.slice(4).join('/'));
    }
  }
  
  // HACK pscrb.fm
  if (targetURL.hostname.includes("pscrb.fm")) {
    const urlString = targetURL.toString();
    const marker = "waaa.wnyc.org";
    if (urlString.includes(marker)) {
      console.log(`[proxy.encode] removed pscrb.fm ${targetURL.toString()}`);
      const [pathOnly] = urlString.split('?');
      const startIndex = pathOnly.indexOf(marker);
      const cleanPath = pathOnly.substring(startIndex);
      targetURL = new URL("https://" + cleanPath);
    }
  }
  
  // get the target filename
  const pathComponents = targetURL.pathname.split('/');
  let fileName = pathComponents.filter(Boolean).pop() || "";
  
  // encode the targetURL
  const targetURI = encodeURIComponent(targetURL.toString());
  const targetBase = btoa(targetURI);
  const targetEncoded = encodeURIComponent(targetBase);
  
  // construct the encoded url
  const encodedPath = `${targetEncoded}/${fileName}`;
  const encodedURL = new URL(encodedPath, baseURL);
  encodedURL.searchParams.set("key", authorizedAPIKey);
  if (targetOption) encodedURL.searchParams.set("option", targetOption);
  
  const encodedURLLength = encodedURL.toString().length;
  if (encodedURLLength >= 255) {
    console.error(`[proxy.encode.WARN] ENCODED-LENGTH(${encodedURLLength}) ${targetURL.toString()}`);
  }
  return encodedURL;
}

export function decode(requestURL) {
  if (!(requestURL instanceof URL)) throw new Error("Parameter Error: Invalid URL");
  
  // url.pathname ignores the query string (?key=...) 
  // so splitting this is safe from parameters.
  const pathComponents = requestURL.pathname.split('/'); 
  
  // Path: /proxy/ENCODED_STRING/file.mp3
  // Path: /proxy/ENCODED_STRING/
  // Path: /proxy/ENCODED_STRING
  // Components: ["", "proxy", "ENCODED_STRING", "file.mp3"]
  const proxyIndex = pathComponents.indexOf("proxy");
  if (proxyIndex === -1 || !pathComponents[proxyIndex + 1]) {
    return null; 
  }
  const targetEncoded = pathComponents[proxyIndex + 1];

  try {
    const targetBase = decodeURIComponent(targetEncoded);
    const targetURI = atob(targetBase);
    const targetURLString = decodeURIComponent(targetURI);
    const targetURL = new URL(targetURLString);
    console.log(`[proxy.decode] ${targetURLString}`);
    return targetURL;
  } catch (error) {
    console.error(`[proxy.decode] error ${error.message}`);
    return null;
  }
}

export function sanitizedRequestHeaders(incomingHeaders) {
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

export function sanitizedResponseHeaders(incomingHeaders) {
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
