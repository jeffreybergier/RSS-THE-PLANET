import * as Auth from './auth.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export const Option = {
  auto:  "auto",
  feed:  "feed",
  html:  "html",
  asset: "asset",
  getOption(parameter) {
    if (typeof parameter !== 'string') return this.auto;
    const normalized = parameter.toLowerCase();
    const validOptions = [this.auto, this.feed, this.html, this.asset];
    return validOptions.includes(normalized) ? normalized : this.auto;
  },
  async fetchAutoOption(targetURL) {
  try {
    let response = await fetch(targetURL, { method: 'HEAD' });
    if (!response.ok) return null;
    const contentType = response.headers.get("Content-Type") || "";
    console.log(`[proxy.Option] autodetected Content-Type: ${contentType}`);
    if (contentType.includes("xml"))  return Option.feed; 
    if (contentType.includes("rss"))  return Option.feed;
    if (contentType.includes("atom")) return Option.feed;
    if (contentType.includes("html")) return Option.html;
    return Option.asset;
  } catch (e) {
    console.error(`[proxy.getAuto] error: ${e.message}`);
    return null;
  }
}
};

Object.freeze(Option);

export async function getProxyResponse(request) {

  // 0. URL Parameters
  const requestURL = new URL(request.url);
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
                                            requestURL, 
                                            option, 
                                            authorizedAPIKey);

  if (!option) return Auth.errorTargetUnreachable(targetURL.pathname); 
  
  // 5. Go through the options and service them
  if (option === Option.feed) return getFeed(targetURL, 
                                             requestURL,
                                             request.headers,
                                             request.method, 
                                             authorizedAPIKey);
  if (option === Option.asset) return getAsset(targetURL, 
                                               request.headers, 
                                               request.method, 
                                               authorizedAPIKey);
  // TODO: Option.html

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
    <form action="/proxy" method="GET">
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
                         requestURL, 
                         option, 
                         authorizedAPIKey) 
{
  if (!(submittedURL instanceof URL) 
   || !(requestURL instanceof URL) 
   || !authorizedAPIKey) 
  { throw new Error("Parameter Error: submittedURL, requestURL, authorizedAPIKey"); }
  const encodedURL = encode(submittedURL, 
                            requestURL, 
                            option, 
                            authorizedAPIKey);
  const bodyContent = `${encodedURL.toString()}`;
  return new Response(bodyContent, {
    headers: { "Content-Type": "text/plain" },
    status: 200
  });
}

function encode(targetURL, 
                requestURL, 
                targetOption, 
                authorizedAPIKey) 
{  
  if (!(targetURL  instanceof URL)
   || !(requestURL instanceof URL)
   || typeof authorizedAPIKey !== "string") 
  { throw new Error(`Parameter Error: targetURL(${targetURL}), requestURL(${requestURL}), targetOption(${targetOption}), authorizedAPIKey(${authorizedAPIKey})`); }
  
  // get the target filename
  const pathComponents = targetURL.pathname.split('/');
  let fileName = pathComponents.filter(Boolean).pop() || "";
  
  // encode the targetURL
  const targetURI = encodeURIComponent(targetURL.toString());
  const targetBase = btoa(targetURI);
  const targetEncoded = encodeURIComponent(targetBase);
  
  // construct the encoded url
  // TODO: replace requestURL with baseURL and then use JS constructor to append path properly
  // https://developer.mozilla.org/en-US/docs/Web/API/URL_API/Resolving_relative_references
  let encodedURLString = `${requestURL.protocol}//${requestURL.host}/proxy/${targetEncoded}/${fileName}?key=${authorizedAPIKey}`;
  if (targetOption) encodedURLString+= `&option=${targetOption}`
  const encodedURL = new URL(encodedURLString);
  
  // TODO: Remove the excess logging
  console.log(`[proxy.encode] ${targetURL.toString()}`);
  return encodedURL;
}

function decode(requestURL) {
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

export async function getFeed(targetURL, 
                              requestURL,
                             _requestHeaders,
                              requestMethod, 
                              authorizedAPIKey) 
{
  if (!(targetURL instanceof URL)
   || !(requestURL instanceof URL)
   || !_requestHeaders
   || !requestMethod
   || typeof authorizedAPIKey !== "string") 
   { throw new Error("Parameter Error: targetURL, requestURL, requestHeaders, requestMethod, authorizedAPIKey"); }
  
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
  
  /**
   * CDATA-aware URL patcher with Predicate
   * @param {Object} parent - Parent object
   * @param {string} key - Property name
   * @param {number} option - The Option enum
   * @param {Function} where - (Optional) (parent) => boolean
   */
  function XML_encodeURL(parent, key, option, where) {
    if (!parent || !parent[key]) return;
    const target = parent[key];
    // 1. Handle Array Case (Recursive)
    if (Array.isArray(target)) {
      target.forEach((_, index) => {
        // We pass the array as the parent and the index as the key
        X_setURL(target, index, option, where);
      });
      return;
    }
    // 2. Apply Predicate (where clause)
    // We pass 'parent' so the caller can check siblings or attributes
    if (where && !where(parent)) return;
    const original = target;
    // 3. Extract raw string (handle CDATA vs String)
    const rawValue = (typeof original === "object" && original.__cdata) 
                     ? original.__cdata 
                     : original;
    if (typeof rawValue !== "string") return;
    // 4. Parse and Trim (Fixes Arms Control Wonk whitespace)
    const rawValueURL = URL.parse(rawValue.trim());
    if (!rawValueURL) return;
    // 5. Encode
    const resultURL = encode(rawValueURL, requestURL, option, authorizedAPIKey);
    if (!(resultURL instanceof URL)) return;
    const finalString = resultURL.toString();
    // 6. Re-wrap in original format
    parent[key] = (typeof original === "object" && "__cdata" in original)
      ? { "__cdata": finalString }
      : finalString;
  }

  // TODO: Delete these
  // 1. Extracts the string regardless of whether it's CDATA or a plain string
  function X_getCD(val) {
    if (!val) return null;
    if (typeof val === "string") return val;
    if (val.__cdata) return val.__cdata;
    return null;
  }
  
  // 2. Wraps the new value back into the original format (CDATA or String)
  function X_setCD(originalVal, newVal) {
    return (typeof originalVal === "object" && "__cdata" in originalVal)
          ? { "__cdata": newVal }
          : newVal;
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
    
    const timelimit = new Date();
    timelimit.setMonth(timelimit.getMonth() - 6);
    const originalXML = await response.text();
    
    // 2. Create the XML Parser
    const parser = new XMLParser({ 
      ignoreAttributes: false, 
      attributeNamePrefix: "@_",
      parseTagValue: false,
      cdataPropName: "__cdata"
    });
    const builder = new XMLBuilder({ 
      ignoreAttributes: false, 
      format: true,
      suppressBooleanAttributes: false,
      suppressEmptyNode: true,
      cdataPropName: "__cdata"
    });
    
    let xml = parser.parse(originalXML);
    const rssChannel = xml.rss?.channel;
    
    // 3 Patch the Channel
    // Delete any stylesheet
    // TODO: Learn how to resolve relative URL's in order to fix
    // <?xml-stylesheet type="text/xsl" media="screen" href="/~files/atom-premium.xsl"?>
    // https://feeds.allenpike.com/feed/
    if (xml["?xml-stylesheet"]) delete xml["?xml-stylesheet"];
    if (rssChannel) {
      // 3.1 Replace itunes:new-feed-url
      XML_encodeURL(rssChannel, "itunes:new-feed-url", Option.feed);
      // 3.2 Replace itunes:image
      XML_encodeURL(rssChannel["itunes:image"], "@_href", Option.asset);
      // 3.3 Replace Links
      XML_encodeURL(rssChannel, "link", Option.auto);
      // 3.4 Replace Self Link
      XML_encodeURL(rssChannel["atom:link"], "@_href", Option.feed, parent => {
        return parent["@_rel"] === "self";
      });
      // 3.5 Replace the channel image
      if (!Array.isArray(rssChannel.image)) rssChannel.image = (rssChannel.image) 
                                                             ? [rssChannel.image] 
                                                             : [];
      rssChannel.image.forEach(image => {
        XML_encodeURL(image, "url", Option.asset);
        XML_encodeURL(image, "link", Option.auto);
      });
      // 3.6 Remove items over 1 year old
      rssChannel.item = rssChannel.item.filter(item => {
        const pubDate = new Date(item.pubDate);
        return pubDate > timelimit;
      });
      
      // 4 Patch each item in the channel
      if (!Array.isArray(rssChannel.item)) rssChannel.item = (rssChannel.item) 
                                                     ? [rssChannel.item] 
                                                     : [];
      rssChannel.item.forEach(item => {
        // 4.1 Replace the Link property
        XML_encodeURL(item, "link", Option.auto);
        // 4.2 Replace the itunes image url
        XML_encodeURL(item["itunes:image"], "@_href", Option.asset);
        // 4.3 Replace enclosure url
        XML_encodeURL(item.enclosure, "@_url", Option.asset);
        // 4.4 TODO: Edit the Content tag as if it were HTML
      });
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
        if (link["@_type"]?.toLowerCase().includes("image")) option = Option.asset;
        if (link["@_rel" ]?.toLowerCase().includes("self" )) option = Option.feed;
        link["@_href"] = encode(linkURL, 
                                requestURL, 
                                option,
                                authorizedAPIKey)
                               .toString();
      });
      
      // 5.2 replace logo and icon which are in the spec
      XML_encodeURL(rssFeed, "logo", Option.asset);
      XML_encodeURL(rssFeed, "icon", Option.asset);
      
      // 6 Correct all of the entries
      if (!Array.isArray(rssFeed.entry)) rssFeed.entry = (rssFeed.entry) 
                                                 ? [rssFeed.entry] 
                                                 : [];
      rssFeed.entry = rssFeed.entry.filter(item => {
        const updated = new Date(item.updated);
        return updated > timelimit;
      });
      
      // 6.1 Patch each link entry
      rssFeed.entry.forEach(entry => {
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
          if (link["@_type"]?.toLowerCase().includes("image")) option = Option.asset;
          link["@_href"] = encode(linkURL, 
                                  requestURL, 
                                  option,
                                  authorizedAPIKey)
                                 .toString();
        });
        
        // 6.2 TODO: Edit the Content tag as if it were HTML
      });
    }

    // 4. Return the modified XML Response
    const rewrittenXML = builder.build(xml);
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
    return Auth.errorTargetUnreachable(requestURL.pathname);
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

function sanitizedRequestHeaders(incomingHeaders) {
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

function sanitizedResponseHeaders(incomingHeaders) {
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
  
  // Optional: Set a User-Agent so sites don't block you as a bot
  if (!headers.has('user-agent')) {
    headers.set('User-Agent', 'Overcast/3.0 (+http://overcast.fm/; iOS podcast app)');
  }

  return headers;
}