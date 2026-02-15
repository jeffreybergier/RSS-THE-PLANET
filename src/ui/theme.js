export const SHARED_CSS = `
  body { 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
    padding: 1rem; 
    line-height: 1.4; 
    color: #333; 
    max-width: 800px; 
    margin: 0 auto;
  }
  h1, h2, h3 { color: #1a1a1a; margin: 1rem 0 0.2rem 0; }
  h1 { color: #d32f2f; margin-top: 0.5rem; }
  p { margin: 0.4rem 0; }
  
  .pathname { color: #666; font-family: monospace; background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 4px; }
  hr { border: 0; border-top: 1px solid #eee; margin: 1rem 0 0.5rem 0; }
  footer { font-size: 0.8rem; color: #999; }
  
  form { background: #fafafa; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #eee; margin-bottom: 0.75rem; }
  label { font-weight: bold; display: block; margin-bottom: 0.15rem; font-size: 0.9rem; }
  label.inline { display: inline; font-weight: normal; margin-left: 0.25rem; margin-right: 1rem; }

  input[type="text"], input[type="password"], input[type="file"], textarea { 
    width: 100%; 
    padding: 0.35rem 0.5rem; 
    border: 1px solid #ccc; 
    border-radius: 4px; 
    box-sizing: border-box; 
    margin-bottom: 0.5rem;
    font-family: inherit;
    font-size: 1rem;
  }
  
  button { 
    background: #1a73e8; 
    color: white; 
    border: none; 
    padding: 0.4rem 1rem; 
    border-radius: 4px; 
    cursor: pointer; 
    font-size: 1rem;
    line-height: 1.2;
  }
  button:hover { background: #1557b0; }
  button.secondary { background: #666; }
  button.secondary:hover { background: #555; }
  button.ml { margin-left: 0.5rem; }
  
  fieldset { border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; }
  legend { font-weight: bold; padding: 0 0.5rem; font-size: 0.9rem; }
  
  /* Input Group */
  .input-group { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
  .input-group input { flex-grow: 1; margin-bottom: 0; }
  .input-group button { margin-bottom: 0; }
  
  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; background: white; border: 1px solid #ddd; border-radius: 4px; }
  th { background: #f5f5f5; text-align: left; padding: 0.3rem 0.5rem; font-size: 0.85rem; }
  td { padding: 0.3rem 0.5rem; border-bottom: 1px solid #eee; }
  td.id-col { font-family: monospace; font-size: 0.8em; color: #666; }
  td.actions { text-align: right; white-space: nowrap; }
  tr.empty-state td { padding: 0.75rem; text-align: center; color: #666; }
  
  /* Links */
  a { text-decoration: none; color: #1a73e8; }
  a:hover { text-decoration: underline; }
  
  /* Action Buttons (Table) */
  a.action-link { 
    display: inline-block;
    text-decoration: none;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.75rem;
    margin-left: 0.2rem;
    border: 1px solid #ddd;
    color: #555;
    background: #fff;
    transition: background 0.1s, border-color 0.1s;
  }
  a.action-link:hover {
    background: #f5f5f5;
    text-decoration: none;
    border-color: #ccc;
  }
  
  /* Primary (Convert) */
  a.action-link.primary {
    background: #1a73e8;
    color: white;
    border-color: #1a73e8;
    font-weight: 500;
  }
  a.action-link.primary:hover {
    background: #1557b0;
    border-color: #1557b0;
  }
  
  /* Danger (Delete) */
  a.action-link.delete {
    color: #d32f2f;
    border-color: #ef9a9a; 
    background: white;
  }
  a.action-link.delete:hover {
    background: #ffebee; 
    border-color: #d32f2f;
  }
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
