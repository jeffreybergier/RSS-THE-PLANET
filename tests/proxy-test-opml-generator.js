import fs from "fs";
import { XMLParser } from "fast-xml-parser";

const API_KEY = process.env.OPML_KEY;
const SERVERS_RAW = process.env.SERVERS;
const SERVERS = JSON.parse(SERVERS_RAW);
const OPML_INPUT_PATH = "./tests/proxy-test-feeds.opml";
const OPML_OUTPUT_PATH = "./tests/proxy-test-feeds-generated.opml";
const INPUT_FEEDS = loadFeedsFromOPML(OPML_INPUT_PATH);

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

function generateOPML() {
  if (!Array.isArray(SERVERS)
   || typeof API_KEY !== "string"
   || !INPUT_FEEDS)
  { console.error("Environment not configured"); process.exit(1); }
  
  console.log("proxy-test-opml-generator.js: OPML-Start");
  const outputOPML = JSON.stringify(INPUT_FEEDS, null, 2);
  // TODO: This just outputs JSON for now, but its a test to make sure the POC works
  fs.writeFileSync(OPML_OUTPUT_PATH, outputOPML, 'utf8');
  console.log("proxy-test-opml-generator.js: OPML-Done");
}

generateOPML();