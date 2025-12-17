import * as Codec from './codec';

export function isFeed(request) {
  const kConfirm = '/feed';
  const requestURL = new URL(request.url);
  const requestPath = requestURL.pathname;
  return requestPath.startsWith(kConfirm) || false;
}

export async function getFeed(request, env, ctx) {
  const requestURL = new URL(request.url);
  const proxyOrigin = requestURL.origin;
  const targetURLString = Codec.decode(request.url);
  
  if (!targetURLString) {
    console.error(`[feed.js] Failed to decode URL from: ${request.url}`);
    return new Response("Invalid Proxy Path", { status: 400 });
  }

  let response;
  try {
    console.log(`[feed.js] fetch(${targetURLString})`);
    response = await fetch(targetURLString);
  } catch (error) {
    console.error(`[feed.js] fetch() ${error.message}`);
    return new Response(`[feed.js] fetch() ${error.message}`, { status: 500 });
  }
  
  if (!response.ok) {
    console.error(`[feed.js] fetch() response(${response.status})`);
    return response;
  }
  
  const searchPattern = /(https?:\/\/[^\s"']*\.(?:jpg|jpeg|gif|png|webm|mp3|aac)[^\s"']*)/gi;
  console.log(`[feed.js] response.text()`);
  const originalXML = await response.text();
  
  console.log(`[feed.js] originalXML.replace()`);
  const rewrittenXML = originalXML.replace(searchPattern, (match) => {
    return Codec.encode(request.url, match, "/asset");
  });
  
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  
  console.log(`[feed.js] return ${JSON.stringify(Object.fromEntries(headers), null, 2)}`);
  return new Response(rewrittenXML, {
    status: response.status,
    headers: headers
  });
}
