import { renderLayout } from './theme.js';

/**
 * Renders a standard error page.
 * @param {number} status - HTTP status code
 * @param {string} message - Descriptive error message
 * @param {string} [pathname] - The path where the error occurred
 * @returns {Response}
 */
export function renderError(status, message, pathname = "") {
  const title = getStatusTitle(status);
  
  const content = `
    <h1>${title}</h1>
    <p><strong>Status ${status}</strong></p>
    <p>${message}</p>
    ${pathname ? `<p>Path: <span class="pathname">${pathname}</span></p>` : ''}
  `;

  return new Response(renderLayout(`${status} ${title}`, content), {
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
