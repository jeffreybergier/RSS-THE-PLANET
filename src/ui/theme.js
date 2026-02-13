export const SHARED_CSS = `
  body { 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
    padding: 2rem; 
    line-height: 1.6; 
    color: #333; 
    max-width: 800px; 
    margin: 0 auto;
  }
  h1, h2 { color: #1a1a1a; margin-top: 2rem; }
  h1 { color: #d32f2f; }
  .pathname { color: #666; font-family: monospace; background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 4px; }
  hr { border: 0; border-top: 1px solid #eee; margin: 3rem 0 1rem 0; }
  footer { font-size: 0.8rem; color: #999; }
  form { background: #fafafa; padding: 1.5rem; border-radius: 8px; border: 1px solid #eee; }
  label { font-weight: bold; display: block; margin-bottom: 0.5rem; }
  input[type="text"], input[type="file"], textarea { 
    width: 100%; 
    padding: 0.5rem; 
    border: 1px solid #ccc; 
    border-radius: 4px; 
    box-sizing: border-box; 
    margin-bottom: 1rem;
  }
  button { 
    background: #1a73e8; 
    color: white; 
    border: none; 
    padding: 0.6rem 1.2rem; 
    border-radius: 4px; 
    cursor: pointer; 
    font-size: 1rem;
  }
  button:hover { background: #1557b0; }
  fieldset { border: 1px solid #ddd; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; }
  legend { font-weight: bold; padding: 0 0.5rem; }
`;

/**
 * Wraps content in a standard HTML layout.
 */
export function renderLayout(title, content, headExtras = "") {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>${SHARED_CSS}</style>
      ${headExtras}
    </head>
    <body>
      ${content}
      <hr>
      <footer>RSS THE PLANET Proxy</footer>
    </body>
  </html>
  `;
}
