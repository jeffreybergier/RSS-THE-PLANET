import * as Feed  from './feed';
import * as Asset from './asset';
import * as Submit from './submit';

export default {
  /**
   * The main router for the Cloudflare Worker.
   */
  async fetch(request, env, ctx) {
  
    const requestURL = new URL(request.url);
    
    // TODO: Check for key parameter to authenticate
    
    if        (Feed.isFeed(request))            {
      return Feed.getFeed(request, env, ctx);
    } else if (Asset.isAsset(request))          { 
      return Asset.getAsset(request, env, ctx);
    } else if (Submit.isSubmit(request))        {
      return Submit.getPage(request);
    }
    
    console.log(`[index.js] fallback`);
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Insecure XML Proxy</title>
  <style>
    body { font-family: sans-serif; line-height: 1.5; max-width: 600px; margin: 20px auto; padding: 0 10px; }
    input[type="text"], input[type="url"] { width: 100%; padding: 8px; margin: 8px 0; box-sizing: border-box; }
    .button-container { margin-top: 10px; display: flex; gap: 10px; }
    button { padding: 10px 20px; border: none; cursor: pointer; }
    .btn-submit { background: #007bff; color: white; }
    .btn-reset { background: #6c757d; color: white; }
    code { background: #eee; padding: 2px 4px; }
  </style>
</head>
<body>
  <h1>About</h2>
  <p>This proxy rewrites RSS feeds to change the asset URL's to flow through the
  proxy so that legacy computers with outdated or no TLS/SSL support can
  subscribe to website RSS feeds and podcast RSS feeds</p>
  <h2>Generate Proxied RSS URL</h2>
  <form action="/submit" method="GET">
    <label for="key">API Key:</label>
    <input type="text" id="key" name="key" placeholder="Your secret key" required>
    <label for="url">Original RSS Feed URL:</label>
    <input type="url" id="url" name="url" placeholder="https://example.com/feed.xml" required>
    <div class="button-container">
      <button type="reset" class="btn-reset">Reset</button>
      <button type="submit" class="btn-submit">Generate</button>
    </div>
  </form>
</body>
</html>
    `;
    
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
      status: 200
    });
  }
};