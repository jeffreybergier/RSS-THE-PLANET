import { Service, Endpoint } from './service.js';
import { Auth } from '../lib/auth.js';
import { renderError } from '../ui/error.js';
import { renderLayout } from '../ui/theme.js';
import { KVSAdapter, KVSValue } from '../adapt/kvs.js';

// MARK: MastoService Class

export class MastoService extends Service {
  static canHandle(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith(Endpoint.masto);
  }

  constructor(request, env, ctx) {
    super(request, env, ctx);
    this.requestURL = new URL(request.url);
    this.authKey = null;
    this.kvs = null;

    const pathComponents = this.requestURL.pathname.split('/');
    const mastoIndex = pathComponents.indexOf("masto");
    if (mastoIndex !== -1 && pathComponents[mastoIndex + 1]) {
      this.uuid = pathComponents[mastoIndex + 1];
      this.action = pathComponents[mastoIndex + 2] || null;
    }
  }

  async handleRequest() {
    try {
      this.authKey = await Auth.validate(this.request);
      if (this.authKey) {
        this.kvs = new KVSAdapter(this.env, "MASTO", this.authKey);
      }

      if (this.request.method === "POST") {
        return await this.handlePost();
      }

      const action = this.action;
      if (action === 'delete') {
        return await this.handleDelete();
      }

      return await this.getSubmitForm();
    } catch (error) {
      console.error(`[MastoService.handleRequest] error: ${error.message}`);
      return renderError(500, "An internal server error occurred", this.requestURL.pathname);
    }
  }

  async handleDelete() {
    if (!this.authKey || !this.kvs) {
      return renderError(401, "The key parameter was missing or incorrect", this.requestURL.pathname);
    }
    const id = this.uuid;
    if (!id) {
      return renderError(400, "Entry ID is required", this.requestURL.pathname);
    }

    try {
      await this.kvs.delete(id);
    } catch (e) {
      console.error(`[MastoService.handleDelete] error: ${e.message}`);
      return renderError(400, "Could not delete entry", this.requestURL.pathname);
    }

    return new Response(null, {
      status: 302,
      headers: {
        "Location": `${Endpoint.masto}?key=${this.authKey}`
      }
    });
  }

  async handlePost() {
    if (!this.authKey) {
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
      // name: Mastodon server URL, value: Mastodon API Key
      const newEntry = new KVSValue(null, server, apiKey, "MASTO", this.authKey);
      const savedEntry = await this.kvs.put(newEntry);
      
      if (!savedEntry) throw new Error("Failed to save Mastodon credentials");

      return new Response(null, {
        status: 302,
        headers: {
          "Location": `${Endpoint.masto}?key=${this.authKey}`
        }
      });
    } catch (e) {
      console.error(`[MastoService.handlePost] error: ${e.message}`);
      return renderError(500, "Failed to save credentials", this.requestURL.pathname);
    }
  }

  async getSubmitForm() {
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

    if (!this.authKey) {
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
      const entries = await this.kvs.list();
      let tableRows = '';
      if (entries.length === 0) {
        tableRows = `<tr class="empty-state"><td colspan="3">No Mastodon Servers Saved.</td></tr>`;
      } else {
        tableRows = entries.map(f => `
          <tr>
            <td class="id-col">${f.key}</td>
            <td><strong>${f.name}</strong></td>
            <td class="actions">
              <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/delete?key=${this.authKey}" 
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
