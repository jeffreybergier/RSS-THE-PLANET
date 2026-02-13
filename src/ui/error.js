/**
 * Renders a standard error page.
 * @param {number} status - HTTP status code
 * @param {string} message - Descriptive error message
 * @param {string} [pathname] - The path where the error occurred
 * @returns {Response}
 */
export function renderError(status, message, pathname = "") {
  const title = getStatusTitle(status);
  
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${status} ${title}</title>
      <style>
        body { font-family: sans-serif; padding: 2rem; line-height: 1.5; color: #333; }
        h1 { color: #d32f2f; }
        .pathname { color: #666; font-family: monospace; }
        hr { border: 0; border-top: 1px solid #eee; margin: 2rem 0; }
        footer { font-size: 0.8rem; color: #999; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p><strong>Status ${status}</strong></p>
      <p>${message}</p>
      ${pathname ? `<p class="pathname">Path: ${pathname}</p>` : ''}
      <hr>
      <footer>RSS THE PLANET Proxy</footer>
    </body>
  </html>
  `;

  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: status
  });
}

function getStatusTitle(status) {
  switch (status) {
    case 401: return "Unauthorized";
    case 404: return "Not Found";
    case 500: return "Internal Server Error";
    case 502: return "Target Unreachable";
    default: return "Error";
  }
}
