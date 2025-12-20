import * as Codec from './codec.js';

export function isAsset(request) {
  const kConfirm = '/proxy/asset';
  const requestURL = new URL(request.url);
  const requestPath = requestURL.pathname;
  return requestPath.startsWith(kConfirm) || false;
}

export async function getAsset(request, env, ctx) {
  const targetURLString = Codec.decode(request.url);
  
  if (!targetURLString) {
    console.error(`[asset.js] Failed to decode URL from: ${request.url}`);
    return new Response("Invalid Proxy Path", { status: 400 });
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
  console.log(`[asset.js] success ${targetURLString}`);
  return fetch(output);
}