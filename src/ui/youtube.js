import { Endpoint } from '../serve/service.js';
import * as Shared from './shared.js';

export const renderLoginForm = (key, actionUrl) => 
  Shared.renderKeyLoginForm(key, actionUrl, 'RSS THE PLANET: YouTube', 'Please enter your API Key to access the YouTube Service.', 'youtube-login-form');

export const renderDashboard = (key, authUrl, tableRows) => `
  <h2>RSS THE PLANET: YouTube</h2>
  <p>Convert your private or public YouTube playlists into RSS feeds.</p>
  
  <form id="youtube-dashboard-form" action="${Endpoint.youtube}" method="GET">
    ${Shared.renderKeyInput(key, Endpoint.youtube)}
  </form>

  <div style="margin: 1.5rem 0; padding: 1rem; background: #f8f9fa; border-radius: 8px; border: 1px solid #dadce0; text-align: center;">
    <a href="${authUrl}" style="display: inline-flex; align-items: center; background: white; border: 1px solid #dadce0; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 500; color: #3c4043; text-decoration: none;">
      <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" width="20" height="20" style="margin-right: 10px;">
      Authenticate with Google
    </a>
    <p style="font-size: 0.8rem; color: #70757a; margin-top: 0.5rem;">Offline access will be requested to keep your feeds working.</p>
  </div>

  ${Shared.renderDataTable('Your YouTube Accounts', [
    { text: 'ID', class: 'w30' },
    { text: 'Account Email / Name' },
    { text: 'Actions', class: 'text-right' }
  ], tableRows)}
`;

export const renderAccountTableRow = (f, authKey) => `
  <tr>
    <td class="id-col">${f.key}</td>
    <td><strong>${f.name}</strong></td>
    <td class="actions">
      <a href="${Endpoint.youtube}${encodeURIComponent(f.key)}/playlists?key=${authKey}" 
         class="download-link action-link primary" 
         data-id="${f.key}"
         data-action="playlists">View Playlists</a>
      <a href="${Endpoint.youtube}${encodeURIComponent(f.key)}/delete?key=${authKey}" 
         class="download-link action-link delete" 
         data-id="${f.key}"
         data-action="delete"
         onclick="return confirm('Are you sure you want to disconnect this YouTube account?');">Disconnect</a>
    </td>
  </tr>
`;

export const renderPlaylistTable = (accountKey, playlists, authKey) => {
  const rows = playlists.length === 0
    ? '<tr class="empty-state"><td colspan="2">No playlists found.</td></tr>'
    : playlists.map(p => `
      <tr>
        <td>
          <strong>${p.snippet.title}</strong><br>
          <small style="color: #666;">${p.contentDetails.itemCount} videos</small>
        </td>
        <td class="actions">
          <a href="${Endpoint.youtube}${encodeURIComponent(accountKey)}/playlist/${p.id}?key=${authKey}" 
             class="download-link action-link primary" 
             target="_blank">RSS Feed</a>
        </td>
      </tr>
    `).join('');

  return Shared.renderDataTable('Select a Playlist', [
    { text: 'Playlist' },
    { text: 'Actions', class: 'text-right' }
  ], rows);
};
