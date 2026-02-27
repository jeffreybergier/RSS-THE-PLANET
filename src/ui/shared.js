export const renderKeyLoginForm = (key, actionUrl, title, description, formId = 'api-key-form') => `
  <h2>${title}</h2>
  <p>${description}</p>
  <form id="${formId}" action="${actionUrl}" method="GET">
    <p>
      <label for="key">API Key:</label>
      <div class="input-group">
        <input type="text" id="key" name="key" value="${key}" oninput="updateAction()">
        <button type="button" class="secondary" onclick="window.location.href='${actionUrl.split('?')[0]}?key=' + encodeURIComponent(document.getElementById('key').value)">Update</button>
      </div>
    </p>
  </form>
`;

export const renderDataTable = (title, headers, rows) => `
  <h3>${title}</h3>
  <table>
    <thead>
      <tr>
        ${headers.map(h => `<th class="${h.class || ''}">${h.text}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
`;

export const renderUpdateActionScript = (baseUrl) => `
  <script>
    function updateAction() {
      const key = document.getElementById('key').value;
      const form = document.querySelector('form');
      const baseUrl = "${baseUrl}";
      if (form) form.action = baseUrl + (key ? '?key=' + encodeURIComponent(key) : '');
      
      const links = document.querySelectorAll('.download-link');
      links.forEach(link => {
        const id = link.getAttribute('data-id');
        const action = link.getAttribute('data-action');
        let newHref = baseUrl;
        if (id) newHref += encodeURIComponent(id) + '/';
        if (action) newHref += action;
        link.href = newHref + (key ? '?key=' + encodeURIComponent(key) : '');
      });
    }
  </script>
`;
