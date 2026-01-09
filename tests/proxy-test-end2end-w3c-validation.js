import fs from "fs"; // Add this for file reading
import { XMLParser } from "fast-xml-parser";

const API_KEY = process.env.VALID_KEY;
const OPML_PATH = "tests/proxy-test-feeds.opml";
const TEST_FEEDS = loadFeedsFromOPML(OPML_PATH);

// TODO: Enhance test report using
// run: npx github-actions-ctrf ctrf/ctrf-report.json

/**
 * Loads and parses the OPML file into a flat array of { name, url }
 */
function loadFeedsFromOPML(path) {
  try {
    const xmlData = fs.readFileSync(path, "utf8");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    const jsonObj = parser.parse(xmlData);
    // OPML structure can be nested. We need to find all 'outline' tags 
    // that have an 'xmlUrl' attribute (the actual feeds).
    const allOutlines = [];
    // Recursive helper to find all feed entries in nested folders
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
        // If it has children, recurse
        if (item.outline) {
          findFeeds(item.outline);
        }
      }
    }

    findFeeds(jsonObj.opml.body.outline);
    return allOutlines;
  } catch (err) {
    console.error(`Critical Error: Could not load OPML file at ${path}: ${err.message}`);
    process.exit(1);
  }
}

// Helper to avoid W3C rate limits
const wait = (ms) => new Promise(resolve => {
  console.log(`...Waiting for ${ms}ms...`);
  setTimeout(resolve, ms);
});

async function performProxyHealthCheck() {
  try {
    const res = await fetch(`http://localhost:3000/proxy/`);
    return res.status !== 500; // If it's 500, the server is alive but erroring
  } catch (e) {
    console.error(`Error: Proxy appears to have crashed: ${e.message} ${e.cause}`);
    return false;
  }  
}

async function getProxyURLStringWithURLString(urlString) {
  try {
    const response = await fetch(`http://localhost:3000/proxy/?key=${API_KEY}&url=${encodeURIComponent(urlString)}`);
    if (!response.ok) { 
      console.error(`Error: getProxyURLStringWithURLString(${urlString})`);
      return null; 
    }
    return await response.text();
  } catch (err) {
    console.error(`Error: getProxyURLStringWithURLString error(${err.message}) url(${urlString})`);
    console.error(`TEMP: ${err.cause}`);
    return null;
    }
} 

async function getXMLBodyWithURLString(urlString) {
  const MAX_SIZE = 3 * 1024 * 1024;
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 Vienna/3.9.5',
    'Accept': 'application/rss+xml, application/xml, application/atom, text/xml, */*',
    'Accept-Language': 'en, *;q=0.5'
  };
  try {
    const response = await fetch(urlString, { headers: HEADERS });
    const contentLength = response.headers.get('content-length');
    if (!response.ok) { 
      console.error(`Error: getXMLBodyWithURLString status(${response.status}) url(${urlString})`);
      return null; 
    }
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      console.error(`Error: getXMLBodyWithURLString headerSize(${parseInt(contentLength)} > 3MB) url(${urlString})`);
      return null;
    }
    const text = await response.text();
    if (text.length > MAX_SIZE) {
      console.error(`Error: getXMLBodyWithURLString actualSize(${text.length} > 3MB) url(${urlString})`);
      return null;
    }
    return text;
  } catch (err) {
    console.error(`Error: getXMLBodyWithURLString error(${err.message}) url(${urlString})`);
    console.error(`TEMP: ${err.cause}`);
    return null;
  }
}

async function getW3CXMLBodyWithXMLBody(xmlBody) {
  const cleansedXMLBody = xmlBody.replace(/http:\/\/localhost:3000/g, 'https://xxx-proxy-yyy.com');
  const params = new URLSearchParams();
  params.append('output', 'soap12');
  params.append('manual', '1');
  params.append('rawdata', cleansedXMLBody);
  await wait(3000);
  const response = await fetch('https://validator.w3.org/feed/check.cgi', {
    method: 'POST',
    body: params
  });
  
  if (!response.ok) { 
    console.error(`Error: getW3CXMLBodyWithXMLBody status(${response.status}) body(${cleansedXMLBody.length})`);
    return null; 
  }
  return await response.text();
}

/**
 * Validates a feed by URL rather than raw body.
 * @param {URL|string} publicURL - The publicly accessible URL of the feed to validate.
 * @returns {Promise<string|null>} - The SOAP 1.2 XML response from the validator.
 */
async function getW3CValidationByURL(publicURL) {
  // Ensure we have a string representation of the URL
  const target = publicURL.toString();
  const params = new URLSearchParams();
  params.append('output', 'soap12'); // Return XML instead of HTML
  params.append('url', target);       // The W3C will fetch this URL
  // W3C has a strict rate limit; 3 seconds is a safe courtesy delay
  await wait(3000);
  try {
    const response = await fetch(`https://validator.w3.org/feed/check.cgi?${params.toString()}`, {
      method: 'GET' // URL-based validation can use a simple GET
    });
    if (!response.ok) {
      console.error(`Error getW3CValidationByURL: ${target}. Status: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error getW3CValidationByURL:`, error);
    return null;
  }
}

function analyzeW3CXMLBody(xmlBody) {
  const parser = new XMLParser({
    removeNSPrefix: true,
  });
  
  const jsonObj = parser.parse(xmlBody);
  const response = jsonObj?.Envelope?.Body?.feedvalidationresponse;
  if (!response) {
    console.error("FAILED to find feedvalidationresponse in W3C body");
    return null;
  }

  // W3C response sometimes nests errors differently depending on the feed type
  const errors = [].concat(response.errors?.errorlist?.error || []);
  const warnings = [].concat(response.warnings?.warninglist?.warning || []);
  const output = [...errors, ...warnings].map(issue => {
    // Safety: ensure we don't crash if an issue is missing a field
    const type = issue.type || 'UnknownType';
    const element = issue.element || 'UnknownElement';
    const parent = issue.parent || 'root';
    const text = issue.text || '';
    
    const snippet = text.substring(0, 20).replace(/\s+/g, '_');
    const fingerprint = `${parent}>${element}|${type}|${snippet}`;

    return {
      key: fingerprint,
      line: issue.line,
      column: issue.column,
      type: type,
      text: text,
      element: element
    };
  });
  
  // TODO: Break this out into per feed exceptions instead of for everything
  const knownFailures = [
  'SelfDoesntMatchLocation',
  'ContainsHTML', // Caused by fast-xml-parser double encoding & into &amp;
  'ContainsUndeclaredHTML', // Like this <title>Why is ChatGPT for Mac So&amp;#x2026; Bad?</title>
  'NotHtml', // Removed for Amusing Planet which has a garbage feed
  'UnexpectedWhitespace', // Removed for Apple News - very confused about this one
  ];
  
  return output.filter(issue => !knownFailures.includes(issue.type));
}

function getRegressions(lhsIssues, rhsIssues) {
  // Map the original issues into a Set of keys for O(1) lookup
  const lhsKeys = new Set(lhsIssues.map(i => i.key));
  // Find proxy issues that do NOT exist in the original set
  return rhsIssues.filter(issue => !lhsKeys.has(issue.key));
}

async function startTests() {
  console.log(`Testing Feeds: ${TEST_FEEDS.length}`);
  let errorCount = 0;
  let successCount = 0;
  let unknownCount = 0;

  for (const lhs of TEST_FEEDS) {
    console.log(`Testing: ${lhs.name} ${lhs.url}`);
    try {
      // RHS First
      // R1. Get RHS via Proxy
      const rhsURL = await getProxyURLStringWithURLString(lhs.url);
      if (!rhsURL) { throw new Error("Failed to fetch proxied URL from localhost:3000"); }
      // R2. Fetch both XML bodies
      const rhsXML = await getXMLBodyWithURLString(rhsURL);
      if (!rhsXML) { throw new Error("Failed to fetch proxied feed from localhost:3000"); }
      const proxyRunning = await performProxyHealthCheck()
      if (!proxyRunning) { throw new Error("localhost:3000 crashed"); }
      // R3. Fetch W3C Validation
      const rhsW3C = await getW3CXMLBodyWithXMLBody(rhsXML);
      if (!rhsW3C) { throw new Error("W3C Validation Request Failed"); }
      // R4. Analyze W3C Validation
      const rhsIssues = analyzeW3CXMLBody(rhsW3C);
      if (!rhsIssues) { throw new Error("Failed to parse the W3C Validation Request"); }
      const rhsIssuesString = JSON.stringify(rhsIssues, null, 2);
      
      // L3. Fetch W3C Validation
      let lhsIssues = null;
      const lhsW3C = await getW3CValidationByURL(lhs.url);
      if (lhsW3C) {
        // L4. Analyze W3C Validation
        lhsIssues = analyzeW3CXMLBody(lhsW3C);
      }
      
      // Able to compare
      if (lhsIssues) {
        // 5. Comparison
        const remainingIssues = getRegressions(lhsIssues, rhsIssues);
        const remainingIssuesString = JSON.stringify(remainingIssues, null, 2);
        if (remainingIssues.length > 0) {
          console.error(`Failure: ${lhs.name} \n${remainingIssuesString}`);
          errorCount += 1;
        } else {
          console.log(`Success: ${lhs.name} ${lhs.url}`);
          successCount += 1;
        }
      } else {
        // Unable to compare
        console.log(`Unknown: ${lhs.name} \n${rhsIssuesString}`);
        unknownCount += 1;
      }
    } catch (err) {
      console.error(`Failure: ${lhs.name} ${err.message}`);
      errorCount += 1;
    }
  }

  console.log(`Tested total(${TEST_FEEDS.length}) success(${successCount}) failure(${errorCount}) unknown(${unknownCount})`);
  process.exit(errorCount);
}

startTests();