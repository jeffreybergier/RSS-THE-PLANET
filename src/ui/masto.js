import { Endpoint } from '../serve/service.js';
import * as Shared from './shared.js';

export const renderLoginForm = (key, actionUrl) => 
  Shared.renderKeyLoginForm(key, actionUrl, 'RSS THE PLANET: Mastodon', 'Please enter your API Key to access the Mastodon Service.', 'masto-form');

export const renderDashboardForm = (key, actionUrl, tableRows) => `
  <h2>RSS THE PLANET: Mastodon</h2>
  <p>Save your Mastodon server and API key to convert your timeline to RSS.</p>
  <form id="masto-form" action="${actionUrl}" method="POST">
    ${Shared.renderKeyInput(key, Endpoint.masto)}
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
  ${Shared.renderDataTable('Stored Mastodon Servers', [
    { text: 'ID', class: 'w30' },
    { text: 'Server' },
    { text: 'Actions', class: 'text-right' }
  ], tableRows)}
`;

export const renderServerTableRow = (f, authKey) => `
  <tr>
    <td class="id-col">${f.key}</td>
    <td><strong>${f.name}</strong></td>
    <td class="actions">
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/status/home?key=${authKey}" 
         class="download-link action-link primary" 
         data-id="${f.key}"
         data-action="status/home"
         target="_blank">Home</a>
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/status/local?key=${authKey}" 
         class="download-link action-link" 
         data-id="${f.key}"
         data-action="status/local"
         target="_blank">Local</a>
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/status/user?key=${authKey}" 
         class="download-link action-link" 
         data-id="${f.key}"
         data-action="status/user"
         target="_blank">User</a>
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/notifications?key=${authKey}" 
         class="download-link action-link" 
         data-id="${f.key}"
         data-action="notifications"
         target="_blank">Notifications</a>
      <a href="${Endpoint.masto}${encodeURIComponent(f.key)}/delete?key=${authKey}" 
         class="download-link action-link delete" 
         data-id="${f.key}"
         data-action="delete"
         onclick="return confirm('Are you sure you want to delete ${f.name}?');">Delete</a>
    </td>
  </tr>
`;

export const renderTriggererSignature = (account, hostname, proxiedAvatar) => `
  <div>
    <strong>${account.display_name || account.username} (${account.acct.includes('@') ? account.acct : `${account.acct}@${hostname}`})</strong><br>
    <p><img src="${proxiedAvatar}" width="96" height="96" alt="${account.display_name || account.username}" class="avatar"></p>
  </div>
`;

export const renderStatusFooter = (data, account, hostname, proxiedAvatar) => `
  <p>
    ↩️ ${data.replies_count || 0}・🔁 ${data.reblogs_count || 0}・⭐ ${data.favourites_count || 0}
  </p>
  <hr>
  <div>
    <strong>${account.display_name || account.username} (${account.acct.includes('@') ? account.acct : `${account.acct}@${hostname}`})</strong><br>
    <p><img src="${proxiedAvatar}" width="96" height="96" alt="${account.display_name || account.username}" class="avatar"></p>
  </div>
`;
