import fs from 'fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as Proxy from '../src/serve/proxy.js';

const OPML_INPUT_PATH = './tests/proxy-test-feeds.opml';
const OPML_OUTPUT_PATH = './tests/proxy-test-feeds-generated.opml';

/**
 * Loads the original OPML and returns the body structure
 */
function getOriginalStructure(path) {
  try {
    const xmlData = fs.readFileSync(path, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const jsonObj = parser.parse(xmlData);
    return jsonObj.opml.body.outline;
  } catch (err) {
    console.error(`Critical Error reading input: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Recursively updates feed URLs with the proxy server
 */
function transformStructure(nodes, serverUrl, key) {
  const nodeList = Array.isArray(nodes) ? nodes : [nodes];
  return nodeList.map(node => {
    const newNode = { ...node };
    // 1. If this is a feed item, encode the URL
    if (newNode['@_xmlUrl']) {
      newNode['@_xmlUrl'] = encode(newNode['@_xmlUrl'], serverUrl, key);
    }
    // 2. If this is a folder, recurse
    if (newNode.outline) {
      newNode.outline = transformStructure(newNode.outline, serverUrl, key);
    }
    return newNode;
  });
}

/**
 * Wraps the target URL using the Proxy utility
 */
function encode(targetURLString, requestURLString, key) {
  const targetURL = new URL(targetURLString);
  const requestURL = new URL(requestURLString);
  const outputURL = Proxy.encode(
    targetURL, 
    requestURL, 
    Proxy.Option.feed, 
    key
  );
  return outputURL.toString();
}

function generateOPML() {
  const serverUrl = process.argv[2];
  const apiKey = process.argv[3];
  if (!serverUrl || !apiKey) {
    console.error('Usage: node tests/proxy-test-opml-generator.js <SERVER_URL> <API_KEY>');
    process.exit(1);
  }
  console.log(`proxy-test-opml-generator.js: Generating for ${serverUrl}`);
  
  const originalStructure = getOriginalStructure(OPML_INPUT_PATH);
  const host = new URL(serverUrl).hostname;
  const opmlObject = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8'
    },
    opml: {
      '@_version': '2.0',
      head: {
        title: `Proxy Test Feeds: ${host}`,
        dateCreated: new Date().toUTCString()
      },
      body: {
        outline: transformStructure(originalStructure, serverUrl, apiKey)
      }
    }
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true
  });

  const outputXML = builder.build(opmlObject);
  fs.writeFileSync(OPML_OUTPUT_PATH, outputXML, 'utf8');
  
  console.log(`proxy-test-opml-generator.js: Done -> ${OPML_OUTPUT_PATH}`);
}

generateOPML();