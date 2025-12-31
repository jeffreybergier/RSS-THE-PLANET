import * as Auth from './auth.js';

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
  { throw new Error("Parameter Error: targetURL, requestURL, targetOption, authorizedAPIKey"); }
  
  // get the target filename
  const pathComponents = targetURL.pathname.split('/');
  let fileName = pathComponents.filter(Boolean).pop() || "";
  
  // encode the targetURL
  const targetURI = encodeURIComponent(targetURL.toString());
  const targetBase = btoa(targetURI);
  const targetEncoded = encodeURIComponent(targetBase);
  
  // construct the encoded url
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
  
  let requestHeaders = sanitized(_requestHeaders);
  if (requestMethod !== "GET") {
    // Bail out immediately if we are 
    // not proxying a normal GET request
    return fetch(targetURL, {
      method: requestMethod,
      headers: requestHeaders,
      redirect: 'follow'
    });
  }
  
  let response;
  try {
    response = await fetch(targetURL, {
      method: requestMethod,
      headers: requestHeaders,
      redirect: 'follow'
    });
  } catch (error) {
    console.error(`[proxy.feed] fetch() ${error.message}`, error.cause || '');
    return Auth.errorTargetUnreachable(requestURL.pathname);
  }
  
  if (!response.ok) {
    console.error(`[proxy.feed] fetch() response(${response.status})`);
    return response;
  }
  
  // Download the feed
  // TODO: Add cache-control
  const originalXML = await response.text();
  
  // 1. Find URLs for specific assets and replace them with /asset URLs
  const searchPattern = /(https?:\/\/[^\s"'<>]*\.(?:jpg|jpeg|gif|png|webm|mp3|aac)[^\s"'<>]*)/gi;
  var rewrittenXML = originalXML.replace(searchPattern, (match) => {
    try {
      const matchURL = new URL(match);
      const encodedURL = encode(matchURL, 
                                requestURL,
                                Option.asset, 
                                authorizedAPIKey);
      const encodedXMLSafe = encodedURL.toString().replace(/&/g, '&amp;');
      return encodedXMLSafe;
    } catch (e) {
      console.error(`[proxy.feed] error: ${e.message})`);
      return match;
    }
  });
  
  // 2. Find the itunes:new tag and replace it with this URL
  const requestURLXML = requestURL.toString().replace(/&/g, '&amp;');
  const newFeedUrlPattern = /<itunes:new-feed-url>.*?<\/itunes:new-feed-url>/i;
  rewrittenXML = rewrittenXML.replace(newFeedUrlPattern, `<itunes:new-feed-url>${requestURLXML}</itunes:new-feed-url>`);
  
  // 3. Find RSS ATOM self URL
  const atomSelfPattern = /<link\s+rel="self"\s+type="([^"]+)"\s+href="[^"]+"\s*\/>/i;
  rewrittenXML = rewrittenXML.replace(atomSelfPattern, (match, type) => {
    return `<link rel="self" type="${type}" href="${requestURLXML}" />`;
  });
  
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Content-Type', 'application/rss+xml; charset=utf-8');
  responseHeaders.delete('Content-Length');
  responseHeaders.delete('Content-Encoding');
  
  return new Response(rewrittenXML, {
    status: response.status,
    headers: responseHeaders
  });
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
   
   const headers = sanitized(requestHeaders);
   console.log(`[proxy.asset] passing through: ${targetURL.toString()}`);
   
  // TODO: Add cache-control
  return fetch(targetURL, {
    method: requestMethod,
    headers: headers,
    redirect: 'follow'
  });
}

function sanitized(incomingHeaders) {
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
    'content-length'
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