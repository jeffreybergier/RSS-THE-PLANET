import * as Routes from './allroutes.js';

export async function getProxyResponse(request) {

  const requestURL = new URL(request.url);
  const route = Routes.Proxy.getRoute(requestURL.pathname);
    
  // Handle the submit form
  if (route === null               ) return null;
  if (route === Routes.Proxy.index ) return getSubmitForm();
  
  // Check the API Key before doing any proxying
  const apiKey = requestURL.searchParams.get('key');
  if (apiKey === null) return Routes.errorUnauthorized(requestURL.pathname);
  const authorizedAPIKey = apiKey;
  
  // Handle all of the other valid endpoints
  if (route === Routes.Proxy.submit) return getSubmitResult(request, authorizedAPIKey);
  if (route === Routes.Proxy.feed  ) return getFeed(request, authorizedAPIKey);
  if (route === Routes.Proxy.asset ) return getAsset(request, authorizedAPIKey);
  
  return null;
}

function getSubmitForm() {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Insecure XML Proxy</title>
  </head>
  <body>
    <h1>About</h1>
    <p>
      This proxy rewrites RSS feeds so that legacy computers with outdated 
      or no TLS/SSL support can subscribe to modern website and podcast feeds.
    </p>
    <h2>Generate Proxied RSS URL</h2>
    <form action="${Routes.Proxy.submit}" method="GET">
      <p>
        <label for="key">API Key:</label><br>
        <input type="text" id="key" name="key" size="30" required>
      </p>
      <p>
        <label for="url">Original RSS Feed URL:</label><br>
        <input type="url" id="url" name="url" size="40" placeholder="https://..." required>
      </p>
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

function getSubmitResult(request, authorizedAPIKey) {
  if (!authorizedAPIKey) throw "[Missing] authorizedAPIKey";
  const requestURL = new URL(request.url);
  
  const targetURLString = requestURL.searchParams.get('url');
  if (!targetURLString) return Routes.errorInternalServer(requestURL.pathname);
  
  const encodedURL = encode(request.url, targetURLString, Routes.Proxy.feed, authorizedAPIKey);
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Proxy URL Generated</title>
  </head>
  <body>
    <h1>Success!</h1>
    <p>Copy the proxy URL below for use in iTunes or your RSS reader:</p>
    <textarea rows="8" cols="40" readonly>${encodedURL || 'Error: No URL provided'}</textarea>
    ${encodedURL ? `<br><a href="${encodedURL}">View Proxy Feed</a>` : ''}
  </body>
  </html>
  `;
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 200
  });
}


function encode(requestURLString, targetURLString, endpoint, authorizedAPIKey) {
  const requestURL = new URL(requestURLString);
  const targetURL = new URL(targetURLString);
  
  if (!targetURL || !requestURL) {
    console.error(`[proxy.encode] invalid request or target`);
    return null;
  }
  
  // get the target filename
  const pathComponents = targetURL.pathname.split('/');
  // Filter out empty strings in case of trailing slashes
  let fileName = pathComponents.filter(Boolean).pop() || "";
  
  // encode the targetURL
  const encodedTarget = encodeURIComponent(btoa(targetURLString));
  
  // construct the encoded url
  const protocol = "http://";
  const serverOrigin = requestURL.host;
  const encoded = `${protocol}${serverOrigin}${endpoint}/${encodedTarget}/${fileName}?key=${authorizedAPIKey}`;
  console.log(`[proxy.encode] ${targetURLString}`);
  return encoded;
}

function decode(requestURLString) {
  const requestURL = new URL(requestURLString);
  if (!requestURL) {
    console.error(`[proxy.encode] invalid URL ${requestURLString}`);
    return null;
  }
  
  // url.pathname ignores the query string (?key=...) 
  // so splitting this is safe from parameters.
  const pathComponents = requestURL.pathname.split('/'); 
  
  // Path: /proxy/asset/ENCODED_STRING/file.mp3
  // Components: ["", "asset", "ENCODED_STRING", "file.mp3"]
  // TODO: Change this to first trim Routes.Proxy.asset before splitting
  const encodedTarget = pathComponents[3];
  if (!encodedTarget) {
    console.error(`[proxy.decode] invalid pathComponents`);
    return null;
  }

  try {
    const base64Encoded = decodeURIComponent(encodedTarget);
    const targetURLString = atob(base64Encoded);
    console.log(`[proxy.decode] ${targetURLString}`);
    return targetURLString;
  } catch (error) {
    console.error(`[proxy.decode] error ${error.message}`);
    return null;
  }
}

export async function getFeed(request, authorizedAPIKey) {
  if (!authorizedAPIKey) throw "[Missing] authorizedAPIKey";
  
  const requestURL = new URL(request.url);
  const proxyOrigin = requestURL.origin;
  const targetURLString = decode(request.url);
  
  if (!targetURLString) {
    console.error(`[proxy.feed] Failed to decode URL from: ${request.url}`);
    return Routes.errorInternalServer(requestURL.pathname);
  }

  let response;
  try {
    response = await fetch(targetURLString);
  } catch (error) {
    console.error(`[proxy.feed] fetch() ${error.message}`);
    return Routes.errorTargetUnreachable(requestURL.pathname);
  }
  
  if (!response.ok) {
    console.error(`[proxy.feed] fetch() response(${response.status})`);
    return response;
  }
  
  const searchPattern = /(https?:\/\/[^\s"']*\.(?:jpg|jpeg|gif|png|webm|mp3|aac)[^\s"']*)/gi;
  console.log(`[proxy.feed] response.text()`);
  const originalXML = await response.text();
  
  const rewrittenXML = originalXML.replace(searchPattern, (match) => {
    return encode(request.url, match, Routes.Proxy.asset, authorizedAPIKey);
  });
  
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  
  return new Response(rewrittenXML, {
    status: response.status,
    headers: headers
  });
}

export async function getAsset(request, authorizedAPIKey) {
  if (!authorizedAPIKey) throw "[Missing] authorizedAPIKey";

  const targetURLString = decode(request.url);  
  if (!targetURLString) {
    console.error(`[proxy.asset] Failed to decode URL from: ${request.url}`);
    return Routes.errorInternalServer((new URL(request.url)).pathname);
  }

  // Create a new Headers object from the original
  const newHeaders = new Headers(request.headers);

  // Remove headers that cause Undici/fetch to crash or behave incorrectly
  newHeaders.delete('connection');
  newHeaders.delete('keep-alive');
  newHeaders.delete('host');
  newHeaders.delete('proxy-connection');
  newHeaders.delete('transfer-encoding');

  const output = new Request(targetURLString, {
    method: request.method,
    headers: newHeaders,
    redirect: 'follow'
  });
  console.log(`[proxy.asset] success ${targetURLString}`);
  return fetch(output);
}