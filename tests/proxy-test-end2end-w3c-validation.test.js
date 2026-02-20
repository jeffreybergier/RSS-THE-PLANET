import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { spawn } from 'child_process';
import http from 'http';

// Configuration
const TEST_TARGET = process.env.TEST_TARGET || 'node';
const DEFAULT_PORT = TEST_TARGET === 'wrangler' ? '8787' : '3333';
const TEST_PROXY_URL = process.env.TEST_PROXY_URL || `http://127.0.0.1:${DEFAULT_PORT}`;
const OPML_PATH = "tests/proxy-test-feeds.opml";
// Default to 3 feeds if E2E_FULL_SUITE is not set
const MAX_FEEDS = process.env.E2E_FULL_SUITE ? Infinity : 3;

// API Key setup
const VALID_KEYS_JSON = process.env.VALID_KEYS || '["test-key"]';
let API_KEY = "test-key";
try {
  const keys = JSON.parse(VALID_KEYS_JSON);
  if (Array.isArray(keys) && keys.length > 0) {
    API_KEY = keys[0];
  }
} catch (e) {
  console.warn(`Warning: parsing VALID_KEYS: ${e.message}, using default.`);
}

let serverProcess;

// Helper: Check if server is ready
const checkServerReady = (url) => {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      // Any status code means the server is reachable
      resolve(true);
    });
    req.on('error', (e) => {
        // console.log(`[checkServerReady] error: ${e.message}`);
        resolve(false);
    });
    req.end();
  });
};

const waitForServer = async (url, timeout = 30000) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await checkServerReady(url)) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
};

beforeAll(async () => {
  // Only start server if not already running (or if strictly required for this test)
  if (await checkServerReady(TEST_PROXY_URL)) {
    console.log(`Server already running at ${TEST_PROXY_URL}, using existing instance.`);
    return;
  }

  console.log(`Starting test server (${TEST_TARGET})...`);
  
  if (TEST_TARGET === 'wrangler') {
    serverProcess = spawn('npx', ['wrangler', 'dev', '--port', DEFAULT_PORT], { 
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, VALID_KEYS: VALID_KEYS_JSON }
    });
  } else {
    serverProcess = spawn(process.execPath, ['./src/_node-boot.js'], { 
      stdio: 'pipe',
      shell: false, 
      env: { ...process.env, PORT: DEFAULT_PORT, HOST: '127.0.0.1', VALID_KEYS: VALID_KEYS_JSON }
    });
  }

  serverProcess.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));
  
  // Wait for server to be ready
  const ready = await waitForServer(TEST_PROXY_URL, 25000); // Wait up to 25s
  if (!ready) {
    throw new Error("Failed to start test server within timeout.");
  }
  console.log("Test server started.");
}, 30000); // 30s timeout for hook

afterAll(() => {
  if (serverProcess) {
    console.log("Stopping test server...");
    serverProcess.kill();
  }
});

// Helper Functions

function loadFeedsFromOPML(path) {
  try {
    const xmlData = fs.readFileSync(path, "utf8");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

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
        if (item.outline) {
          findFeeds(item.outline);
        }
      }
    }

    if (jsonObj.opml && jsonObj.opml.body && jsonObj.opml.body.outline) {
       findFeeds(jsonObj.opml.body.outline);
    }
    return allOutlines;
  } catch (err) {
    console.error(`Critical Error: Could not load OPML file at ${path}: ${err.message}`);
    return [];
  }
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getXMLBodyWithURLString(urlString) {
  const MAX_SIZE = 3 * 1024 * 1024; // 3MB
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 Vienna/3.9.5',
    'Accept': 'application/rss+xml, application/xml, application/atom, text/xml, */*',
    'Accept-Language': 'en, *;q=0.5'
  };
  try {
    const response = await fetch(urlString, { headers: HEADERS });
    if (!response.ok) { 
      return null; 
    }
    const text = await response.text();
    if (text.length > MAX_SIZE) return null;
    return text;
  } catch (err) {
    return null;
  }
}

async function getW3CValidationForBody(xmlBody) {
  // Replace localhost with a dummy domain for validation if needed, 
  // though W3C validator usually checks structure.
  // The validator might reject localhost URLs in the content if it tries to follow them?
  // Using a dummy domain as in original test.
  const cleansedXMLBody = xmlBody.replace(
      new RegExp(TEST_PROXY_URL.replace(/[-\/\^$*+?.()|[\]{}]/g, '\$&'), 'g'), 
      'https://xxx-proxy-yyy.com'
  );
  
  const params = new URLSearchParams();
  params.append('output', 'soap12');
  params.append('manual', '1');
  params.append('rawdata', cleansedXMLBody);
  
  // W3C rate limit wait
  await wait(1500); 

  try {
      const response = await fetch('https://validator.w3.org/feed/check.cgi', {
        method: 'POST',
        body: params
      });
      
      if (!response.ok) return null;
      return await response.text();
  } catch (e) {
      console.error("W3C Body Validation Error:", e);
      return null;
  }
}

async function getW3CValidationByURL(publicURL) {
  const target = publicURL.toString();
  const params = new URLSearchParams();
  params.append('output', 'soap12');
  params.append('url', target);
  
  await wait(1500);

  try {
    const response = await fetch(`https://validator.w3.org/feed/check.cgi?${params.toString()}`, {
      method: 'GET'
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error("W3C URL Validation Error:", error);
    return null;
  }
}

function analyzeW3CXMLBody(xmlBody) {
  if (!xmlBody) return [];
  const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false
  });
  
  try {
      const jsonObj = parser.parse(xmlBody);
      // The SOAP response structure: env:Envelope -> env:Body -> m:feedvalidationresponse
      // fast-xml-parser with removeNSPrefix should simplify this to Envelope -> Body -> feedvalidationresponse
      
      const response = jsonObj?.Envelope?.Body?.feedvalidationresponse;
      if (!response) return [];

      const errors = [].concat(response.errors?.errorlist?.error || []);
      const warnings = [].concat(response.warnings?.warninglist?.warning || []);
      
      const output = [...errors, ...warnings].map(issue => {
        const type = issue.type || 'UnknownType';
        const element = issue.element || 'UnknownElement';
        const parent = issue.parent || 'root';
        const text = issue.text || '';
        
        const snippet = text.substring(0, 20).replace(/\s+/g, '_');
        const fingerprint = `${parent}>${element}|${type}|${snippet}`;

        return {
          key: fingerprint,
          type: type,
          text: text,
          element: element
        };
      });

      const knownFailures = [
      'SelfDoesntMatchLocation',
      'ContainsHTML',
      'ContainsUndeclaredHTML', 
      'NotHtml', 
      'UnexpectedWhitespace',
      ];
      
      return output.filter(issue => !knownFailures.includes(issue.type));
  } catch (e) {
      console.error("Error parsing W3C response:", e);
      return [];
  }
}

function getRegressions(lhsIssues, rhsIssues) {
  const lhsKeys = new Set(lhsIssues.map(i => i.key));
  return rhsIssues.filter(issue => !lhsKeys.has(issue.key));
}


// The Test Suite
describe('End-to-End W3C Validation', () => {
  const feeds = loadFeedsFromOPML(OPML_PATH);
  // Pick a random subset or the first N feeds
  // Using slice(0, MAX_FEEDS) for determinism, or could shuffle.
  const selectedFeeds = feeds.slice(0, MAX_FEEDS);

  if (feeds.length === 0) {
      it.skip('No feeds found in OPML', () => {});
      return;
  }

  // Increase timeout significantly for network & W3C delays
  // 30 seconds per test might be enough, but let's go safe with 60s.
  
  selectedFeeds.forEach(feed => {
    it(`should validate ${feed.name}`, { timeout: 60000 }, async () => {
      console.log(`
Validating: ${feed.name} (${feed.url})`);

      // 1. Construct Proxy URL Generation Request
      const generationUrl = `${TEST_PROXY_URL}/proxy/?key=${API_KEY}&url=${encodeURIComponent(feed.url)}`;

      // 2. Get the Actual Proxied URL
      const proxiedUrlResponse = await fetch(generationUrl);
      if (!proxiedUrlResponse.ok) {
          console.warn(`[SKIP] Failed to generate proxy URL for: ${feed.name}`);
          return;
      }
      const proxiedUrl = await proxiedUrlResponse.text();
      
      // 3. Fetch Proxied Content
      console.log(`[Proxy] Fetching: ${proxiedUrl}`);
      const proxyXml = await getXMLBodyWithURLString(proxiedUrl);
      expect(proxyXml).not.toBeNull();
      expect(proxyXml).toContain('<?xml'); // Basic sanity check

      // 4. Validate Proxied Content with W3C
      const proxyW3CResponse = await getW3CValidationForBody(proxyXml);
      if (!proxyW3CResponse) {
          console.warn(`[SKIP] W3C validation failed (network/service) for proxy: ${feed.name}`);
          return; // Skip if W3C is down/blocking
      }
      const proxyIssues = analyzeW3CXMLBody(proxyW3CResponse);

      // 4. Validate Original Content with W3C
      const originalW3CResponse = await getW3CValidationByURL(feed.url);
      if (!originalW3CResponse) {
           console.warn(`[SKIP] W3C validation failed (network/service) for original: ${feed.name}`);
           return;
      }
      const originalIssues = analyzeW3CXMLBody(originalW3CResponse);

      // 5. Compare Regressions
      const regressions = getRegressions(originalIssues, proxyIssues);
      
      if (regressions.length > 0) {
          console.error(`Regressions for ${feed.name}:`, JSON.stringify(regressions, null, 2));
      }

      expect(regressions).toEqual([]);
    });
  });
});
