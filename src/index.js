import * as Feed  from './feed';
import * as Asset from './asset';

export default {
  /**
   * The main router for the Cloudflare Worker.
   */
  async fetch(request, env, ctx) {
  
    const requestURL = new URL(request.url);
    
    // TODO: Check for key parameter to authenticate
    
    if (requestURL.searchParams.get('url')) {
      if (Asset.isAsset(request)) {
        return Asset.getAsset(request, env, ctx);
      } else if (Feed.isFeed(request)) {
        return Feed.getFeed(request, env, ctx);
      }
    }
    
    console.log(`[index.js] fallback`);
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <body>
          <h1>Insecure XML Proxy Router</h1>
          <h2>Usage:</h2>
          <p><strong>Feeds:</strong> <code>${requestURL.origin}/feed?url=https://example.com/feed.xml</code></p>
          <p><strong>Assets:</strong> <code>${requestURL.origin}/asset?url=https://example.com/podcast.mp3</code></p>
      </body>
      </html>
    `;
    
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
      status: 200
    });
  }
};