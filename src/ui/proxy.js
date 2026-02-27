import { Endpoint } from '../serve/service.js';
import { Option } from '../lib/option.js';
import * as Shared from './shared.js';

export const renderLoginForm = (key, actionUrl) =>
  Shared.renderKeyLoginForm(key, actionUrl, 'RSS THE PLANET: Proxy', 'Please enter your API Key to access the Proxy Service.', 'proxy-login-form');

export const renderProxySubmitForm = (key) => `
  <h2>RSS THE PLANET: Proxy</h2>
  <h2>Generate Proxy URL</h2>
  <form action="${Endpoint.proxy}" method="GET">
    <p>
      <label for="key">API Key:</label>
      <input type="text" id="key" name="key" value="${key || ''}" oninput="updateAction()">
    </p>
    <p>
      <label for="url">Target URL</label>
      <textarea id="url" name="url" cols="60" rows="10" placeholder="https://example.com/feed.xml"></textarea>      
    </p>
    <fieldset>
      <legend>Proxy Mode</legend>
      <input type="radio" id="opt-auto" name="option" value="${Option.auto}" checked>
      <label for="opt-auto" class="inline">Autodetect</label><br>
      <input type="radio" id="opt-feed" name="option" value="${Option.feed}">
      <label for="opt-feed" class="inline">News Feed (RSS, Atom)</label><br>
      <input type="radio" id="opt-html" name="option" value="${Option.html}">
      <label for="opt-html" class="inline">Web Page</label><br>
      <input type="radio" id="opt-image" name="option" value="${Option.image}">
      <label for="opt-image" class="inline">Image</label><br>
      <input type="radio" id="opt-asset" name="option" value="${Option.asset}">
      <label for="opt-asset" class="inline">File (audio, video, etc)</label>
    </fieldset>
    <p>
      <button type="submit">Generate</button>
      <button type="reset" class="secondary ml">Reset</button>
    </p>
  </form>
`;
