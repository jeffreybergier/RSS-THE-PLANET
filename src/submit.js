import * as Codec from './codec.js';

export function isSubmit(request) {
  const kConfirm = '/proxy/submit';
  const requestURL = new URL(request.url);
  const requestPath = requestURL.pathname;
  return requestPath.startsWith(kConfirm) || false;
}

export async function getPage(request, env, ctx) {
  const requestURL = new URL(request.url);
  const targetURLString = requestURL.searchParams.get('url');
  const encodedURL = Codec.encode(request.url, targetURLString, "/proxy/feed");

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

export function getForm() {
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
    <form action="/proxy/submit" method="GET">
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