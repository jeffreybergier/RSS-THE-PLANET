
export function isAsset(request) {
  const kConfirm = '/asset';
  const requestURL = new URL(request.url);
  const requestPath = requestURL.pathname;
  return requestPath.startsWith(kConfirm);
}

export async function getAsset(request, env, ctx) {
  if (!isAsset(request)) { throw `Not Asset: ${request}`; }
  const requestURL = new URL(request.url);
  const targetURL = requestURL.searchParams.get('url');

  let response;
  try {
    console.log(`[asset.js] fetch(${targetURL})`);
    response = await fetch(targetURL, {
      headers: request.headers 
    });
  } catch (error) {
    console.error(`[asset.js] fetch() ${error.message}`);
    return new Response(`[asset.js] fetch() ${error.message}`, { status: 500 });
  }
  
  if (!response.ok) {
    console.error(`[asset.js] fetch() response(${response.status})`);
    return response;
  }
  
  {
    // Get the size in bytes from the headers
    const contentLength = response.headers.get('Content-Length');
    const sizeInBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);
    console.log(`[asset.js] fetch() Content-Length ${sizeInKB} KB`);
  }
  
  const output = new Response(response.body, response);

  // Remove headers that enable advanced features the old client might 
  // misuse or not understand.
  
  // 1. Disable Byte Range Requests
  output.headers.delete('Accept-Ranges');
  output.headers.delete('Content-Range');

  // 2. Remove other potential optimization/caching headers that might 
  // conflict with the client/proxy
  output.headers.delete('ETag');
  output.headers.delete('Last-Modified');
  
  console.log(`[asset.js] return ${JSON.stringify(Object.fromEntries(output.headers), null, 2)}`);
  return output;
}
