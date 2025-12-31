const API_KEY = process.env.VALID_KEY;

const TEST_FEEDS = [
  // RSS Feeds
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "MacRumors", url: "https://www.macrumors.com/macrumors.xml" },

  // Podcast Feeds
//   { name: "99% Invisible", url: "https://feeds.simplecast.com/BqbsxVfO" },
  // TODO: Add ATP Private feed via github secrets
  { name: "Accidental Tech Podcast", url: "https://atp.fm/rss" },
//   { name: "Acquired", url: "https://feeds.transistor.fm/acquired" },
//   { name: "All-In", url: "https://rss.libsyn.com/shows/254861/destinations/1928300.xml" },
//   { name: "Apple News Today", url: "https://apple.news/podcast/apple_news_today" },
  { name: "ArchaeoEd Podcast", url: "https://feeds.buzzsprout.com/1314529.rss" },
  { name: "Arms Control Wonk", url: "https://armscontrolwonk.libsyn.com/rss" },
  { name: "Autoline Daily", url: "https://www.spreaker.com/show/3270299/episodes/feed" },
  { name: "Bay Curious", url: "https://feeds.megaphone.fm/KQINC4698044094" },
  { name: "Criminal", url: "https://feeds.megaphone.fm/VMP7924981569" },
//   { name: "Decoder", url: "https://feeds.megaphone.fm/recodedecode" },
  { name: "Diggnation", url: "https://feeds.transistor.fm/diggnation" },
  { name: "Disrupting Japan", url: "https://www.disruptingjapan.com/feed/podcast/" },
//   { name: "Grammar Girl", url: "https://feeds.simplecast.com/XcH2p3Ah" },
  { name: "Land of the Giants", url: "https://feeds.megaphone.fm/landofthegiants" },
  { name: "Lex Fridman Podcast", url: "https://lexfridman.com/feed/podcast/" },
  { name: "Mobile Dev Japan", url: "https://anchor.fm/s/108113308/podcast/rss" },
  { name: "More Perfect", url: "https://feeds.simplecast.com/lQwwDIs1" },
//   { name: "My Favorite Murder", url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/bdde8bb3-169d-43b1-91d3-b24c0047969c/f450d41f-16bc-4ecd-8f6c-b24c004796e2/podcast.rss" },
//   { name: "Nihongo con Teppei", url: "http://nihongoconteppei.com/feed/podcast" },
  { name: "On with Kara Swisher", url: "https://feeds.megaphone.fm/VMP1684715893" },
//   { name: "Open to Debate", url: "https://feeds.megaphone.fm/PNP1207584390" },
//   { name: "Radiolab", url: "https://feeds.simplecast.com/EmVW7VGp" },
  { name: "Science Vs", url: "https://feeds.megaphone.fm/sciencevs" },
  { name: "Shell Game", url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/d3d3abca-191a-4010-8160-b3530112d393/c639b22c-ee8c-43dd-86c1-b3530112d3a3/podcast.rss" },
  { name: "The Rest Is History", url: "https://feeds.megaphone.fm/GLT4787413333" },
  { name: "The Rest Is Politics: US", url: "https://feeds.megaphone.fm/GLT5336643697" },
  { name: "The Talk Show", url: "https://daringfireball.net/thetalkshow/rss" },
//   { name: "The Vergecast", url: "https://feeds.megaphone.fm/vergecast" },
  { name: "This Podcast Will Kill You", url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/e0709a39-232b-4483-8e4f-b24c0111ae2c/64b4c224-562e-4b2f-9f31-b24c0111ae53/podcast.rss" },
//   { name: "Today, Explained", url: "https://feeds.megaphone.fm/VMP5705694065" },
  { name: "Unexplainable", url: "https://feeds.megaphone.fm/VMP9331026707" },
  { name: "Upgrade", url: "https://www.relay.fm/upgrade/feed" },
  { name: "What Trump Can Teach Us About Con Law", url: "https://feeds.simplecast.com/jZLi00b4" },
//   { name: "YUYUの日本語Podcast", url: "https://anchor.fm/s/cda85d4/podcast/rss" },
  { name: "日本語 with あこ", url: "https://anchor.fm/s/2e08a010/podcast/rss" },
];

// Helper to avoid W3C rate limits
const wait = (ms) => new Promise(resolve => {
  console.log(`...Waiting for ${ms}ms...`);
  setTimeout(resolve, ms);
});


async function performProxyHealthCheck() {
  try {
    await fetch(`http://localhost:3000/proxy`);
    return true; 
  } catch (e) {
    console.error("Error: Proxy appears to have crashed");
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
    return null;
  }
}

async function getW3CXMLBodyWithXMLBody(xmlBody) {
  const cleansedXMLBody = xmlBody.replace(/http:\/\/localhost:3000/g, 'https://xxx-proxy-yyy.com');
  const params = new URLSearchParams();
  params.append('output', 'soap12');
  params.append('manual', '1');
  params.append('rawdata', cleansedXMLBody);

  await wait(3001);
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

function analyzeW3CXMLBody(xmlBody) {
  const errorMatch = xmlBody.match(/<m:errorcount>(\d+)<\/m:errorcount>/);
  const errors = errorMatch ? parseInt(errorMatch[1], 10) : -1;
  const warningMatch = xmlBody.match(/<m:warningcount>(\d+)<\/m:warningcount>/);
  const warnings = warningMatch ? parseInt(warningMatch[1], 10) : -1;

  if (errors < 0 || warnings < 0) return -1;
  return errors + warnings;
}

async function startTests() {
  console.log(`Testing Feeds: ${TEST_FEEDS.length}`);
  let errorCount = 0;
  let successCount = 0;
  let skipCount = 0;

  for (const lhs of TEST_FEEDS) {
    console.log(`Testing: ${lhs.name} ${lhs.url}`);
    try {
      // 1. Get RHS via Proxy
      const rhsURL = await getProxyURLStringWithURLString(lhs.url);
      if (!rhsURL) { errorCount += 1; continue; }
      
      // 2. Fetch both XML bodies
      const lhsXML = await getXMLBodyWithURLString(lhs.url);
      const rhsXML = await getXMLBodyWithURLString(rhsURL);
      const proxyRunning = await performProxyHealthCheck()
      if (!proxyRunning) { errorCount += 1; break; }
      if (!lhsXML || !rhsXML) { skipCount += 1; continue; }
      
      // 3. Fetch W3C Validation
      const lhsW3C = await getW3CXMLBodyWithXMLBody(lhsXML);
      const rhsW3C = await getW3CXMLBodyWithXMLBody(rhsXML);
      if (!lhsW3C || !rhsW3C) { skipCount += 1; continue; }

      // 4. Analyze W3C Validation
      const lhsCount = analyzeW3CXMLBody(lhsW3C);
      const rhsCount = analyzeW3CXMLBody(rhsW3C);

      // 5. Comparison
      if (lhsCount !== rhsCount) {
        console.error(`Error: ${lhs.name} ${lhs.url} lhs(${lhsCount}) rhs(${rhsCount})`);
        console.error("-------- LHS W3C Validation Response --------");
        console.error(`${lhsW3C}`);
        console.error("-------- RHS W3C Validation Response --------");
        console.error(`${rhsW3C}`);
        errorCount +=1
      } else {
        console.log(`Success: ${lhs.name} ${lhs.url} errorCount: ${lhsCount}`);
        successCount += 1;
      }
    } catch (err) {
      console.error(`Error: ${lhs.name} ${lhs.url} ${err.message}`);
      errorCount += 1;
    }
  }

  console.log(`Tested total(${TEST_FEEDS.length}) success(${successCount}) error(${errorCount}) skipped(${skipCount})`);
  process.exit(errorCount);
}

startTests();