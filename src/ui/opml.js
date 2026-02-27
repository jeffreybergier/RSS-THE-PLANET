import { Endpoint } from '../serve/service.js';

export const renderLoginForm = (key, actionUrl) => `
  <h2>RSS THE PLANET: OPML Rewriter</h2>
  <p>Please enter your API Key to access the OPML Rewriter.</p>
  <form id="opml-form" action="${actionUrl}" method="GET">
    <p>
      <label for="key">API Key:</label>
      <div class="input-group">
        <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
        <button type="button" class="secondary" onclick="window.location.href='${Endpoint.opml}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
      </div>
    </p>
  </form>
`;

export const renderDashboardForm = (key, actionUrl, fileTable) => `
  <h2>RSS THE PLANET: OPML Rewriter</h2>
  <p>Upload an OPML file to rewrite all feed URLs through this proxy.</p>
  <form id="opml-form" action="${actionUrl}" method="POST" enctype="multipart/form-data">
    <p>
      <label for="key">API Key (if not in URL):</label>
      <div class="input-group">
        <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
        <button type="button" class="secondary" onclick="window.location.href='${Endpoint.opml}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
      </div>
    </p>
    <fieldset>
      <legend>Mode</legend>
      <input type="radio" id="mode-rewrite" name="mode" value="rewrite" checked>
      <label for="mode-rewrite" style="display:inline;">Rewrite URLs (Process Now)</label><br>
      <input type="radio" id="mode-save" name="mode" value="save">
      <label for="mode-save" style="display:inline;">Save to Store</label>
    </fieldset>
    <p>
      <label for="opml">OPML File:</label>
      <input type="file" id="opml" name="opml" accept=".opml,.xml">
    </p>
    <p>
      <button type="submit">Submit</button>
    </p>
  </form>
  ${fileTable}
`;

const renderFileTableRow = (f, authKey) => `
  <tr>
    <td class="id-col">${f.key}</td>
    <td><strong>${f.name}</strong></td>
    <td class="actions">
      <a href="${Endpoint.opml}${encodeURIComponent(f.key)}/download?key=${authKey}" 
         class="download-link action-link" 
         data-id="${f.key}"
         data-action="download">Original</a>
      <a href="${Endpoint.opml}${encodeURIComponent(f.key)}/convert?key=${authKey}" 
         class="download-link action-link primary" 
         data-id="${f.key}"
         data-action="convert">Convert</a>
      <a href="${Endpoint.opml}${encodeURIComponent(f.key)}/delete?key=${authKey}" 
         class="download-link action-link delete" 
         data-id="${f.key}"
         data-action="delete"
         onclick="return confirm('Are you sure you want to delete ${f.name}?');">Delete</a>
    </td>
  </tr>
`;

export const renderFileTable = (entries, authKey) => {
  const tableRows = entries.length === 0
    ? '<tr class="empty-state"><td colspan="3">No OPML Files Saved.</td></tr>'
    : entries.map(f => renderFileTableRow(f, authKey)).join('');

  return `
    <h3>Stored OPML Files</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 30%;">ID</th>
          <th>Filename</th>
          <th style="text-align: right;">Actions</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
};

export const renderSaveConfirmation = (filename, savedKey, authKey) => `
  <h2>File Saved</h2>
  <p>The file <strong>${filename}</strong> has been saved to the store.</p>
  <p>ID: ${savedKey}</p>
  <p><a href="${Endpoint.opml}${encodeURIComponent(savedKey)}/download?key=${authKey}">Download Original</a></p>
  <p><a href="${Endpoint.opml}${encodeURIComponent(savedKey)}/convert?key=${authKey}">Download Proxied</a></p>
  <p><a href="${Endpoint.opml}?key=${authKey}">Back to OPML Rewriter</a></p>
`;
