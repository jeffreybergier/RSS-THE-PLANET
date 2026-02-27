import { Endpoint } from '../serve/service.js';

export const renderLoginForm = (key, actionUrl) => `
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

export const renderDashboardForm = (key, actionUrl, tableRows) => `
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

export const renderServerTableRow = (f, authKey) => `
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
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/notifications?key=${authKey}" 
         class="download-link action-link" 
         target="_blank">Notifications</a>
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/delete?key=${authKey}" 
         class="download-link action-link delete" 
         onclick="return confirm('Are you sure you want to delete ${f.name}?');">Delete</a>
    </td>
  </tr>
`;

export const renderTriggererSignature = (account, hostname, proxiedAvatar) => `
  <div>
    <strong>${account.display_name || account.username} (${account.acct.includes('@') ? account.acct : `${account.acct}@${hostname}`})</strong><br>
    <p><img src="${proxiedAvatar}" width="96" height="96" alt="${account.display_name || account.username}" style="border-radius: 4px;"></p>
  </div>
`;

export const renderStatusFooter = (data, account, hostname, proxiedAvatar) => `
  <p>
    ↩️ ${data.replies_count || 0}・🔁 ${data.reblogs_count || 0}・⭐ ${data.favourites_count || 0}
  </p>
  <hr>
  <div>
    <strong>${account.display_name || account.username} (${account.acct.includes('@') ? account.acct : `${account.acct}@${hostname}`})</strong><br>
    <p><img src="${proxiedAvatar}" width="96" height="96" alt="${account.display_name || account.username}" style="border-radius: 4px;"></p>
  </div>
`;
