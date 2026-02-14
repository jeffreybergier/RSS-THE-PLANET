import 'dotenv/config';
import http from 'node:http';
import * as Router from './router.js';

const hostname = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;
const requestEnv = { 
  VALID_KEYS: process.env.VALID_KEYS || "[]",
  // TODO: Replace this in-memory Map with a real persistent store (e.g. Redis/fs) for production Node.js usage.
  RSS_THE_PLANET_KVS: new Map()
};

const server = http.createServer(async (req, res) => {
  // 1. Wrap the raw 'req' in a standard 'Request'
  const webReq = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: (req.method !== 'GET' && req.method !== 'HEAD') ? req : null,
    duplex: 'half' // Required by Node to handle the body stream
  });

  // 2. Pass it to your Cloudflare-style router
  const webRes = await Router.route(webReq, requestEnv, {});

  // 3. Unpack the 'Response' back to the Mac
  res.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await webRes.arrayBuffer()));
});

server.listen(port, hostname, () => {
  try {
    const keys = JSON.parse(requestEnv.VALID_KEYS);
    console.log(`[node-boot.js] Loaded auth keys: ${keys.length}`);
  } catch (e) {
    console.error(`[node-boot.js] Failed to parse VALID_KEYS: ${e.message}`);
  }
  console.log(`[node-boot.js] Started server: http://${hostname}:${port}/`);
});
