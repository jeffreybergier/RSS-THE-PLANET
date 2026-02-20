import { Service, Endpoint } from './service.js';
import { Auth } from '../lib/auth.js';
import { Codec } from '../lib/codec.js';
import { Option } from '../lib/option.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue } from '../adapt/kvs.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as Crypto from '../adapt/crypto.js';

// MARK: MastoService Class

export class MastoService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.masto);
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.request = request;
    this.requestURL = new URL(request.url);
    this.baseURL = new URL(Endpoint.proxy, this.requestURL.origin);
    this.authKey = null;
    this.kvs = null;

    const pathComponents = this.requestURL.pathname.split('/');
    const mastoIndex = pathComponents.indexOf("masto");
    if (mastoIndex !== -1 && pathComponents[mastoIndex + 1]) {
      this.uuid = pathComponents[mastoIndex + 1];
      this.type = pathComponents[mastoIndex + 2] || null;
      this.subtype = pathComponents[mastoIndex + 3] || null;
    }
  }

  async handleRequest() {
    try {
      const authKey = await Auth.validate(this.request);
      let kvs = null;
      
      if (authKey) {
        this.request.env = this.env;
        const sha256 = new Crypto.SHA256(this.request);
        kvs = new KVSAdapter(this.env, "MASTO", authKey, sha256);
      } else {
        if (this.request.method === "POST") {
           // Pass nulls to handlePost, it will handle the 401
           return await this.handlePost(null, null); 
        }
      }

      if (this.request.method === "POST") {
        return await this.handlePost(authKey, kvs);
      }

      const type = this.type;
      if (type === 'delete') {
        return await this.handleDelete(authKey, kvs);
      }
      if (type === 'status') {
        return await this.handleStatus(authKey, kvs);
      }

      return await this.getSubmitForm(authKey, kvs);
    } catch (error) {
      console.error(`[MastoService.handleRequest] error: ${error.message}`);
      return renderError(500, "An internal server error occurred", this.requestURL.pathname);
    }
  }

  async handleDelete(authKey, kvs) {
    if (!authKey || !kvs) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, "Entry ID is required", this.requestURL.pathname);
    }

    try {
      await kvs.delete(id);
    } catch (e) {
      console.error(`[MastoService.handleDelete] error: ${e.message}`);
      return renderError(400, "Could not delete entry", this.requestURL.pathname);
    }

    return new Response(null, {
      status: 302,
      headers: {
        "Location": `${Endpoint.masto}?key=${authKey}`
      }
    });
  }

  async handleStatus(authKey, kvs) {
    if (!authKey || !kvs) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    if (!this.uuid || !this.subtype) {
      return renderError(400, "Invalid Request", this.requestURL.pathname);
    }

    const entry = await kvs.get(this.uuid);
    if (!entry) {
      return renderError(404, "Mastodon credentials not found", this.requestURL.pathname);
    }

    const server = entry.name;
    const apiKey = entry.value;

    if (!apiKey) {
      console.error("[MastoService] Decryption failed or API Key missing");
      return renderError(500, "Could not decrypt credentials. Please re-save them.", this.requestURL.pathname);
    }

    let apiPath = "";
    if (this.subtype === 'home') {
      apiPath = "/api/v1/timelines/home";
    } else if (this.subtype === 'local') {
      apiPath = "/api/v1/timelines/public?local=true";
    } else if (this.subtype === 'user') {
      // Need ID. Fetch verify_credentials first.
      const verifyUrl = new URL("/api/v1/accounts/verify_credentials", server);
      const verifyRes = await fetch(verifyUrl, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!verifyRes.ok) return verifyRes;
      const me = await verifyRes.json();
      apiPath = `/api/v1/accounts/${me.id}/statuses`;
    } else {
      return renderError(400, "Invalid status type", this.requestURL.pathname);
    }

    let allStatuses = [];
    let maxId = null;
    let attempts = 0;
    const maxAttempts = 5; // Safety guard

    while (allStatuses.length < 100 && attempts < maxAttempts) {
      const apiUrl = new URL(apiPath, server);
      if (maxId) {
        apiUrl.searchParams.set('max_id', maxId);
      }

      const response = await fetch(apiUrl, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });

      if (!response.ok) {
        if (allStatuses.length > 0) break; // Return what we have if a middle page fails
        return response;
      }

      const statuses = await response.json();
      if (!Array.isArray(statuses) || statuses.length === 0) break;

      allStatuses = allStatuses.concat(statuses);
      
      // Get the last ID for the next page
      maxId = statuses[statuses.length - 1].id;
      attempts++;

      // If we got exactly the same number of items as before, or very few, 
      // we might be hitting a limit or loop, but usually Mastodon is reliable here.
    }

    // Trim to exactly 100 if we went over
    if (allStatuses.length > 100) {
      allStatuses = allStatuses.slice(0, 100);
    }

    const rss = this.convertJSONtoRSS(allStatuses, this.subtype, authKey, server);

    return new Response(rss, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8"
      }
    });
  }

  convertJSONtoRSS(json, subtype, authKey, serverUrl) {
    if (!Array.isArray(json)) return "";

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      format: true,
      suppressEmptyNode: true,
      cdataPropName: "__cdata"
    });

    const items = json.map(status => {
      const isBoost = !!status.reblog;
      const data = isBoost ? status.reblog : status;
      const author = data.account;
      
      // 1. Proxy the avatar
      let proxiedAvatar = "";
      try {
        proxiedAvatar = Codec.encode(new URL(author.avatar), Option.image, this.baseURL, authKey).toString();
      } catch (e) {
        proxiedAvatar = author.avatar;
      }

      // 2. Build plain HTML content
      let html = `
        <div>
          <div>
            <img src="${proxiedAvatar}" width="48" height="48" alt="${author.display_name}">
            <div>
              <strong>${author.display_name || author.username}</strong><br>
              <a href="${author.url}">@${author.acct}</a>
            </div>
          </div>
          <br>
      `;

      if (isBoost) {
        html = `<p>🔄 Boosted by ${status.account.display_name || status.account.username}</p>` + html;
      }

      // Add the actual post content
      html += `<div>${data.content}</div>`;

      // 3. Handle Media Attachments
      if (data.media_attachments && data.media_attachments.length > 0) {
        html += '<div class="media">';
        data.media_attachments.forEach(media => {
          try {
            const altText = media.description || '';
            if (media.type === 'image') {
              const proxiedMedia = Codec.encode(new URL(media.url), Option.image, this.baseURL, authKey).toString();
              html += `<p><img src="${proxiedMedia}" alt="${altText}"></p>`;
            } else {
              // video, gifv, audio, unknown
              const proxiedLink = Codec.encode(new URL(media.url), Option.auto, this.baseURL, authKey).toString();
              const linkTitle = altText ? `View ${media.type}: ${altText}` : `View ${media.type} attachment`;
              html += `<p><a href="${proxiedLink}">${linkTitle}</a></p>`;
            }
          } catch (e) {
            console.error(`[MastoService.convertJSONtoRSS] Media Error: ${e.message} url: ${media.url}`);
            html += `<p><a href="${media.url}">View ${media.type} attachment</a></p>`;
          }
        });
        html += '</div>';
      }

      html += `
        <hr>
        <p>
          Replies: ${data.replies_count || 0} | 
          Boosts: ${data.reblogs_count || 0} | 
          Favorites: ${data.favourites_count || 0}
        </p>
      </div>`;

      // 4. Generate a clean title
      const cleanText = data.content.replace(/<[^>]*>/g, '').trim();
      const titleSnippet = cleanText.length > 60 ? cleanText.substring(0, 60) + "..." : cleanText;
      const displayTitle = `${author.display_name || author.username}: ${titleSnippet || "Post"}`;

      return {
        title: isBoost ? `🔄 ${displayTitle}` : displayTitle,
        link: data.url,
        guid: {
          "@_isPermaLink": "true",
          "#text": data.url
        },
        pubDate: new Date(data.created_at).toUTCString(),
        description: { "__cdata": html },
        author: `${author.acct} (${author.display_name || author.username})`
      };
    });

    const instanceName = new URL(serverUrl).hostname;
    const channelTitle = `${instanceName} - ${subtype.charAt(0).toUpperCase() + subtype.slice(1)}`;
    const rssObj = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      rss: {
        "@_version": "2.0",
        "@_xmlns:content": "http://purl.org/rss/1.0/modules/content/",
        "@_xmlns:dc": "http://purl.org/dc/elements/1.1/",
        channel: {
          title: channelTitle,
          link: this.requestURL.origin,
          description: `RSS THE PLANET: Mastodon ${subtype} feed`,
          language: "en-us",
          lastBuildDate: new Date().toUTCString(),
          generator: "RSS THE PLANET MastoService",
          item: items
        }
      }
    };

    return builder.build(rssObj);
  }

  async handlePost(authKey, kvs) {
    if (!authKey || !kvs) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }

    let formData;
    try {
      formData = await this.request.formData();
    } catch (e) {
      console.error(`[MastoService.handlePost] error reading formData: ${e.message}`);
      return new Response("Invalid form data", { status: 400 });
    }

    const server = formData.get('server');
    const apiKey = formData.get('apiKey');

    if (typeof server !== 'string' || server.length === 0 || typeof apiKey !== 'string' || apiKey.length === 0) {
      return new Response("Server URL and API Key are required", { status: 400 });
    }

    try {
      const newEntry = new KVSValue(null, server, apiKey, "MASTO", authKey);
      const savedEntry = await kvs.put(newEntry);
      
      if (!savedEntry) throw new Error("Failed to save Mastodon credentials");

      return new Response(null, {
        status: 302,
        headers: {
          "Location": `${Endpoint.masto}?key=${authKey}`
        }
      });
    } catch (e) {
      console.error(`[MastoService.handlePost] error: ${e.message}`);
      return renderError(500, "Failed to save credentials", this.requestURL.pathname);
    }
  }

  async getSubmitForm(authKey, kvs) {
    const key = this.requestURL.searchParams.get('key') || '';
    const actionUrl = Endpoint.masto + (key ? `?key=${key}` : '');

    const headExtras = `
      <script>
        function updateAction() {
          const key = document.getElementById('key').value;
          const form = document.getElementById('masto-form');
          form.action = "${Endpoint.masto}" + (key ? '?key=' + encodeURIComponent(key) : '');
        }
      </script>
    `;

    let content = '';

    if (!authKey) {
      content = `
        <h2>RSS THE PLANET: Mastodon</h2>
        <p>Please enter your API Key to access the Mastodon Service.</p>
        <form id="masto-form" action="${actionUrl}" method="GET">
          <p>
            <label for="key">API Key:</label>
            <div class="input-group">
              <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
              <button type="button" class="secondary" onclick="window.location.href='${Endpoint.masto}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
            </div>
          </p>
        </form>
      `;
    } else {
      const entries = await kvs.list();
      let tableRows = '';
      if (entries.length === 0) {
        tableRows = `<tr class="empty-state"><td colspan="3">No Mastodon Servers Saved.</td></tr>`;
      } else {
        tableRows = entries.map(f => `
          <tr>
            <td class="id-col">${f.key}</td>
            <td><strong>${f.name}</strong></td>
            <td class="actions">
              <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/status/home?key=${authKey}" 
                 class="download-link action-link primary" 
                 target="_blank">Home</a>
              <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/status/local?key=${authKey}" 
                 class="download-link action-link" 
                 target="_blank">Local</a>
              <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/status/user?key=${authKey}" 
                 class="download-link action-link" 
                 target="_blank">User</a>
              <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/delete?key=${authKey}" 
                 class="download-link action-link delete" 
                 onclick="return confirm('Are you sure you want to delete ${f.name}?');">Delete</a>
            </td>
          </tr>
        `).join('');
      }

      const fileTable = `
        <h3>Stored Mastodon Servers</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 30%;">ID</th>
              <th>Server</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      `;

      content = `
        <h2>RSS THE PLANET: Mastodon</h2>
        <p>Save your Mastodon server and API key to convert your timeline to RSS.</p>
        <form id="masto-form" action="${actionUrl}" method="POST">
          <p>
            <label for="key">API Key (if not in URL):</label>
            <div class="input-group">
              <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
              <button type="button" class="secondary" onclick="window.location.href='${Endpoint.masto}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
            </div>
          </p>
          <p>
            <label for="server">Mastodon Server URL:</label>
            <input type="text" id="server" name="server" placeholder="https://mastodon.social" required>
          </p>
          <p>
            <label for="apiKey">Mastodon API Key:</label>
            <input type="text" id="apiKey" name="apiKey" placeholder="Your Mastodon Access Token" required>
          </p>
          <p>
            <button type="submit">Save Credentials</button>
          </p>
        </form>
        ${fileTable}
      `;
    }

    return new Response(renderLayout("RSS THE PLANET: Mastodon", content, headExtras), {
      headers: { "Content-Type": "text/html" },
      status: 200
    });
  }
}
