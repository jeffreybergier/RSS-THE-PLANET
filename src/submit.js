import * as Codec from './codec';

export function isSubmit(request) {
  const kConfirm = '/submit';
  const requestURL = new URL(request.url);
  const requestPath = requestURL.pathname;
  return requestPath.startsWith(kConfirm) || false;
}

export async function getPage(request, env, ctx) {
  const requestURL = new URL(request.url);
  const targetURLString = requestURL.searchParams.get('url');
  const encodedURL = Codec.encode(request.url, targetURLString, "/feed");

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxy URL Generated</title>
  <style>
    body { font-family: sans-serif; line-height: 1.5; max-width: 600px; margin: 20px auto; padding: 0 10px; color: #333; }
    
    /* The Code Box */
    textarea { 
      width: 100%; 
      height: 120px; 
      padding: 12px; 
      box-sizing: border-box; 
      background: #282c34; 
      color: #abb2bf; 
      border: 1px solid #181a1f;
      border-radius: 4px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      resize: none;
    }

    .button-group { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
    
    /* Styled Link as a Button */
    .button { 
      padding: 10px 20px; 
      text-decoration: none; 
      border-radius: 4px; 
      font-weight: bold;
      display: inline-block;
    }
    
    .btn-view { background: #28a745; color: white; }
    .btn-back { background: #6c757d; color: white; }
    
    h1 { color: #007bff; }
  </style>
</head>
<body>
  <h1>Success!</h1>
  <p>Copy the code below for iTunes, or use the button to preview the feed in your browser:</p>
  
  <textarea readonly>${encodedURL || 'Error: No URL provided'}</textarea>

  <div class="button-group">
    ${encodedURL ? `<a href="${encodedURL}" class="button btn-view">View Proxy Feed</a>` : ''}
    <a href="/" class="button btn-back">Generate Another</a>
  </div>

  <p><small style="color: #666;">Note: In Leopard, you may need to right-click the text area to "Select All" before copying.</small></p>
</body>
</html>
  `;
    
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 200
  });
}