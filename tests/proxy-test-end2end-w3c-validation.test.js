import { describe, it, expect, beforeAll, afterAll, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { spawn } from 'child_process';
import http from 'http';

// 1. Configuration & Path Resolution
const projectRoot = process.cwd();
const OPML_FULL_PATH = path.join(projectRoot, 'tests', 'proxy-test-feeds-full.opml');
const OPML_FAST_PATH = path.join(projectRoot, 'tests', 'proxy-test-feeds.opml');
const isFullSuite = fs.existsSync(path.join(projectRoot, 'tests', '.run-full-suite'));
const OPML_PATH = isFullSuite ? OPML_FULL_PATH : OPML_FAST_PATH;

const TEST_TARGET = process.env.TEST_TARGET || 'node';
const DEFAULT_PORT = TEST_TARGET === 'wrangler' ? '8787' : '3333';
const TEST_PROXY_URL = process.env.TEST_PROXY_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

const VALID_KEYS_JSON = process.env.VALID_KEYS || '["test-key"]';
let API_KEY = "test-key";
try {
  const keys = JSON.parse(VALID_KEYS_JSON);
  if (Array.isArray(keys) && keys.length > 0) API_KEY = keys[0];
} catch (e) {}

// 2. Feed Loading
function loadFeedsFromOPML(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const xmlData = fs.readFileSync(filePath, "utf8");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const jsonObj = parser.parse(xmlData);
    const allOutlines = [];
    function findFeeds(node) {
      if (!node) return;
      const outlines = Array.isArray(node) ? node : [node];
      for (const item of outlines) {
        if (item["@_xmlUrl"]) {
          allOutlines.push({
            name: item["@_text"] || item["@_title"] || "Unknown Feed",
            url: item["@_xmlUrl"]
          });
        }
        if (item.outline) findFeeds(item.outline);
      }
    }
    const rootOutline = jsonObj?.opml?.body?.outline;
    if (rootOutline) findFeeds(rootOutline);
    return allOutlines;
  } catch (err) {
    return [];
  }
}

const SELECTED_FEEDS = loadFeedsFromOPML(OPML_PATH);

// 3. Helper Functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getXMLBody(urlString) {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 Vienna/3.9.5',
    'Accept': 'application/rss+xml, application/xml, application/atom, text/xml, */*'
  };
  try {
    const response = await fetch(urlString, { headers: HEADERS });
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    return null;
  }
}

async function getW3CValidation(xmlBody, url) {
  const params = new URLSearchParams();
  params.append('output', 'soap12');
  let fetchOptions = { method: 'GET' };
  let fetchUrl = 'https://validator.w3.org/feed/check.cgi';
  if (xmlBody) {
    const cleansedXML = xmlBody.replace(new RegExp(TEST_PROXY_URL.replace(/[-\/\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), 'https://xxx-proxy-yyy.com');
    params.append('manual', '1');
    params.append('rawdata', cleansedXML);
    fetchOptions = {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };
  } else {
    params.append('url', url);
    fetchUrl = `${fetchUrl}?${params.toString()}`;
  }
  
  // RETRY LOGIC: W3C is very strict
  for (let attempt = 0; attempt < 3; attempt++) {
    await wait(2000 + (attempt * 2000)); // Increased wait
    try {
      const response = await fetch(fetchUrl, fetchOptions);
      if (response.status === 200) return await response.text();
      if (response.status === 503 || response.status === 429) {
        console.warn(`[E2E.W3C] Rate limited (Status ${response.status}), retrying...`);
        continue;
      }
      return null;
    } catch (e) {
      if (attempt === 2) console.error("[E2E.W3C] Final failure:", e);
    }
  }
  return null;
}

function analyzeIssues(xmlResponse) {
  if (!xmlResponse) return [];
  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
  try {
    const jsonObj = parser.parse(xmlResponse);
    const response = jsonObj?.Envelope?.Body?.feedvalidationresponse;
    if (!response) return [];
    const errors = [].concat(response.errors?.errorlist?.error || []);
    const warnings = [].concat(response.warnings?.warninglist?.warning || []);
    const knownFailures = ['SelfDoesntMatchLocation', 'ContainsHTML', 'ContainsUndeclaredHTML', 'NotHtml', 'UnexpectedWhitespace'];
    return [...errors, ...warnings]
      .map(issue => {
        const type = issue.type || 'Unknown';
        const text = issue.text || '';
        const fingerprint = `${issue.parent || 'root'}>${issue.element || 'node'}|${type}|${text.substring(0, 20).replace(/\s+/g, '_')}`;
        return { key: fingerprint, type };
      })
      .filter(issue => !knownFailures.includes(issue.type));
  } catch (e) {
    return [];
  }
}

describe('E2E Feed Proxy Validation', () => {
  let serverProcess;

  beforeAll(async () => {
    console.error(`[E2E] Running suite with ${SELECTED_FEEDS.length} feeds from ${path.basename(OPML_PATH)}`);
    const isReady = await new Promise(resolve => {
      const req = http.get(TEST_PROXY_URL, () => resolve(true)).on('error', () => resolve(false));
      req.end();
    });
    if (isReady) return;

    const spawnCmd = TEST_TARGET === 'wrangler' ? 'npx' : process.execPath;
    const spawnArgs = TEST_TARGET === 'wrangler' ? ['wrangler', 'dev', '--port', DEFAULT_PORT] : ['./src/_node-boot.js'];
    const env = { ...process.env, PORT: DEFAULT_PORT, HOST: '127.0.0.1', VALID_KEYS: VALID_KEYS_JSON };
    serverProcess = spawn(spawnCmd, spawnArgs, { stdio: 'pipe', shell: TEST_TARGET === 'wrangler', env });
    
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await wait(1000);
      ready = await new Promise(r => http.get(TEST_PROXY_URL, () => r(true)).on('error', () => r(false)).end());
      if (ready) break;
    }
    if (!ready) throw new Error("Failed to start test server");
  }, 45000);

  afterAll(() => {
    if (serverProcess) serverProcess.kill();
  });

  test('Metadata: OPML feeds are loaded', () => {
    expect(SELECTED_FEEDS.length).toBeGreaterThan(0);
  });

  describe.each(SELECTED_FEEDS)('Feed: $name', (feed) => {
    it(`should match original validation: ${feed.url}`, { timeout: 120000 }, async () => {
      console.error(`[E2E] STARTING: ${feed.name} (${feed.url})`);
      const genUrl = `${TEST_PROXY_URL}/proxy/?key=${API_KEY}&url=${encodeURIComponent(feed.url)}`;
      const genRes = await fetch(genUrl);
      expect(genRes.ok).toBe(true);
      const proxiedUrl = await genRes.text();
      const proxyXml = await getXMLBody(proxiedUrl);
      expect(proxyXml).not.toBeNull();
      
      const proxyW3C = await getW3CValidation(proxyXml, null);
      expect(proxyW3C, "W3C Validation failed for proxied content").not.toBeNull();
      
      const originalW3C = await getW3CValidation(null, feed.url);
      expect(originalW3C, "W3C Validation failed for original feed").not.toBeNull();
      
      const proxyIssues = analyzeIssues(proxyW3C);
      const originalIssues = analyzeIssues(originalW3C);
      const originalKeys = new Set(originalIssues.map(i => i.key));
      const regressions = proxyIssues.filter(i => !originalKeys.has(i.key));
      if (regressions.length > 0) {
        console.error(`[E2E] FAILED: ${feed.name} FAILED:`, JSON.stringify(regressions, null, 2));
      } else {
        console.error(`[E2E] PASSED: ${feed.name}`);
      }
      expect(regressions).toEqual([]);
    });
  });
});
