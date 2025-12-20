
export function isNotFound(request) {
  const { pathname } = new URL(request.url);
  const isProxyPath = pathname.startsWith("/proxy/asset")
                   || pathname.startsWith("/proxy/feed")
                   || pathname.startsWith("/proxy/submit")
  const isProxyRoot = pathname === "/proxy" || pathname === "/proxy/";
  return !isProxyPath && !isProxyRoot;
}

export function getNotFound(request) {
  const url = new URL(request.url); 
  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>404 Not Found</title>
    </head>
    <body>
      <h1>404 Not Found</h1>
      <p>The requested resource was not found on this server.</p>
    </body>
  </html>
  `;
  console.log(`[notfound.js] ${url.pathname}`)
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 404
  });
}