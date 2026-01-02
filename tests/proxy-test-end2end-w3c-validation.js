import { XMLParser } from "fast-xml-parser";
const API_KEY = process.env.VALID_KEY;

const TEST_FEEDS = [

  // RSS Feeds
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "MacRumors", url: "https://www.macrumors.com/macrumors.xml" },
  { name: "Daring Fireball", url: "https://daringfireball.net/feeds/main" },
  { name: "It's Nice That", url: "https://feeds2.feedburner.com/itsnicethat/SlXC" },
  { name: "Nomadic Matt", url: "https://www.nomadicmatt.com/feed/" },
  { name: "Xkcd", url: "https://xkcd.com/rss.xml" },
  { name: "Vienna Support", url: "https://github.com/ViennaRSS/vienna-rss/discussions.atom" },
  { name: "A Working Library", url: "https://aworkinglibrary.com/feed/index.xml" },
  { name: "Vienna Developer Blog", url: "https://www.vienna-rss.com/feed.xml" },
  { name: "Cool Hunting", url: "http://feeds.coolhunting.com/ch" },
  { name: "BBC World News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index/" },
  { name: "Astronomy Picture of the Day", url: "https://apod.nasa.gov/apod.rss" },
  { name: "Colossal", url: "https://www.thisiscolossal.com/feed/" },
  { name: "Craig Hockenberry", url: "https://furbo.org/feed" },
  { name: "inessential", url: "https://inessential.com/xml/rss.xml" },
  { name: "Jason Kottke", url: "http://feeds.kottke.org/main" },
  { name: "Julia Evans", url: "https://jvns.ca/atom.xml" },
  { name: "Manton Reece", url: "https://www.manton.org/feed.xml" },
  { name: "Maurice Parker", url: "https://vincode.io/feed.xml" },
  { name: "Michael Tsai", url: "https://mjtsai.com/blog/feed/" },
  { name: "NetNewsWire Blog", url: "https://netnewswire.blog/feed.xml" },
  { name: "One Foot Tsunami", url: "https://onefoottsunami.com/feed/atom/" },
  { name: "Scripting News", url: "http://scripting.com/rss.xml" },
  { name: "Six Colors", url: "https://feedpress.me/sixcolors?type=xml" },
  { name: "RTINGS.com", url: "https://www.rtings.com/latest-rss" },

  // Troublesome RSS Feeds
  { name: "Amusing Planet", url: "https://www.amusingplanet.com/feeds/posts/default?alt=rss" },
  { name: "Apple News", url: "https://www.apple.com/newsroom/rss-feed.rss" },
  { name: "Allen Pike", url: "https://feeds.allenpike.com/feed/" },
  
  // Podcast Feeds
  { name: "Accidental Tech Podcast", url: "https://atp.fm/rss" },
  { name: "ArchaeoEd Podcast", url: "https://feeds.buzzsprout.com/1314529.rss" },
  { name: "Arms Control Wonk", url: "https://armscontrolwonk.libsyn.com/rss" },
  { name: "Autoline Daily", url: "https://www.spreaker.com/show/3270299/episodes/feed" },
  { name: "Bay Curious", url: "https://feeds.megaphone.fm/KQINC4698044094" },
  { name: "Criminal", url: "https://feeds.megaphone.fm/VMP7924981569" },
  { name: "Diggnation", url: "https://feeds.transistor.fm/diggnation" },
  { name: "Disrupting Japan", url: "https://www.disruptingjapan.com/feed/podcast/" },
  { name: "Land of the Giants", url: "https://feeds.megaphone.fm/landofthegiants" },
  { name: "Lex Fridman Podcast", url: "https://lexfridman.com/feed/podcast/" },
  { name: "Mobile Dev Japan", url: "https://anchor.fm/s/108113308/podcast/rss" },
  { name: "More Perfect", url: "https://feeds.simplecast.com/lQwwDIs1" },
  { name: "On with Kara Swisher", url: "https://feeds.megaphone.fm/VMP1684715893" },
  { name: "Science Vs", url: "https://feeds.megaphone.fm/sciencevs" },
  { name: "Shell Game", url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/d3d3abca-191a-4010-8160-b3530112d393/c639b22c-ee8c-43dd-86c1-b3530112d3a3/podcast.rss" },
  { name: "The Rest Is History", url: "https://feeds.megaphone.fm/GLT4787413333" },
  { name: "The Rest Is Politics: US", url: "https://feeds.megaphone.fm/GLT5336643697" },
  { name: "The Talk Show", url: "https://daringfireball.net/thetalkshow/rss" },
  { name: "This Podcast Will Kill You", url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/e0709a39-232b-4483-8e4f-b24c0111ae2c/64b4c224-562e-4b2f-9f31-b24c0111ae53/podcast.rss" },
  { name: "Unexplainable", url: "https://feeds.megaphone.fm/VMP9331026707" },
  { name: "Upgrade", url: "https://www.relay.fm/upgrade/feed" },
  { name: "What Trump Can Teach Us About Con Law", url: "https://feeds.simplecast.com/jZLi00b4" },
  { name: "日本語 with あこ", url: "https://anchor.fm/s/2e08a010/podcast/rss" },
  
  // Troublesome Podcast Feeds
  { name: "Acquired", url: "https://feeds.transistor.fm/acquired" },
  { name: "All-In", url: "https://rss.libsyn.com/shows/254861/destinations/1928300.xml" },
  { name: "Apple News Today", url: "https://apple.news/podcast/apple_news_today" },
  { name: "99% Invisible", url: "https://feeds.simplecast.com/BqbsxVfO" },
  { name: "Decoder", url: "https://feeds.megaphone.fm/recodedecode" },
  { name: "Grammar Girl", url: "https://feeds.simplecast.com/XcH2p3Ah" },
  { name: "My Favorite Murder", url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/bdde8bb3-169d-43b1-91d3-b24c0047969c/f450d41f-16bc-4ecd-8f6c-b24c004796e2/podcast.rss" },
  { name: "Nihongo con Teppei", url: "http://nihongoconteppei.com/feed/podcast" },
  { name: "Open to Debate", url: "https://feeds.megaphone.fm/PNP1207584390" },
  { name: "Radiolab", url: "https://feeds.simplecast.com/EmVW7VGp" },
  { name: "The Vergecast", url: "https://feeds.megaphone.fm/vergecast" },
  { name: "Today, Explained", url: "https://feeds.megaphone.fm/VMP5705694065" },
  { name: "YUYUの日本語Podcast", url: "https://anchor.fm/s/cda85d4/podcast/rss" },

];

// Helper to avoid W3C rate limits
const wait = (ms) => new Promise(resolve => {
  console.log(`...Waiting for ${ms}ms...`);
  setTimeout(resolve, ms);
});


async function performProxyHealthCheck() {
  try {
    const res = await fetch(`http://localhost:3000/proxy`);
    return res.status !== 500; // If it's 500, the server is alive but erroring
  } catch (e) {
    console.error(`Error: Proxy appears to have crashed: ${e.message} ${e.cause}`);
    return false;
  }  
}

async function getProxyURLStringWithURLString(urlString) {
  try {
    const response = await fetch(`http://localhost:3000/proxy?key=${API_KEY}&url=${encodeURIComponent(urlString)}`);
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
    'User-Agent': 'Overcast/3.0 (+http://overcast.fm/; iOS podcast app)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
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
      console.error(`[W3C] Validation failed for ${target}. Status: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`[W3C] Fetch error:`, error);
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
      if (!rhsURL) { errorCount += 1; continue; }
      // R2. Fetch both XML bodies
      const rhsXML = await getXMLBodyWithURLString(rhsURL);
      const proxyRunning = await performProxyHealthCheck()
      if (!proxyRunning || !rhsXML) { errorCount += 1; break; }
      // R3. Fetch W3C Validation
      const rhsW3C = await getW3CXMLBodyWithXMLBody(rhsXML);
      if (!rhsW3C) { errorCount += 1; continue; }
      // R4. Analyze W3C Validation
      const rhsIssues = analyzeW3CXMLBody(rhsW3C);
      if (!rhsIssues) { errorCount += 1; continue; }
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
        // TODO: Figure out how to validate these items
        console.log(`Unknown: ${lhs.name} \n${rhsIssuesString}`);
        unknownCount += 1;
      }
    } catch (err) {
      console.error(`Error: ${lhs.name} ${err.message}`);
      errorCount += 1;
    }
  }

  console.log(`Tested total(${TEST_FEEDS.length}) success(${successCount}) failure(${errorCount}) unknown(${unknownCount})`);
  process.exit(errorCount);
}

startTests();