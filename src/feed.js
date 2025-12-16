
export function isFeed(request) {
  const kConfirm = '/feed';
  const requestURL = new URL(request.url);
  const requestPath = requestURL.pathname;
  return requestPath.startsWith(kConfirm);
  return requestPath.startsWith(kProxyPath);
}

export async function getFeed(request, env, ctx) {
  if (!isFeed(request)) { throw `Not Feed: ${request}`; }
  const requestURL = new URL(request.url);
  const targetURL = requestURL.searchParams.get('url');
  let response;
  try {
    console.log(`[feed.js] fetch(${targetURL})`);
    response = await fetch(targetURL, {
      headers: request.headers 
    });
  } catch (error) {
    console.error(`[feed.js] fetch() ${error.message}`);
    return new Response(`[feed.js] fetch() ${error.message}`, { status: 500 });
  }
  
  if (!response.ok) {
    console.error(`[feed.js] fetch() response(${response.status})`);
    return response;
  }
  
  const proxyOrigin = requestURL.origin;
  const replacementPattern = `${proxyOrigin}/asset?url=$1`;
  const searchPattern = /(https?:\/\/[^\s"']*\.(?:jpg|jpeg|gif|png|webm|mp3|aac)[^\s"']*)/gi;
  
  console.log(`[feed.js] response.text()`);
  const originalXML = await response.text();
  
  console.log(`[feed.js] originalXML.replace()`);
  const rewrittenXML = originalXML.replace(searchPattern, replacementPattern);
  
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  
  console.log(`[feed.js] return ${JSON.stringify(Object.fromEntries(headers), null, 2)}`);
  return new Response(rewrittenXML, {
    status: response.status,
    headers: headers
  });
}
