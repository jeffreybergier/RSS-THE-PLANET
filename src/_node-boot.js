import 'dotenv/config';
import http from 'node:http';
import * as Router from './router.js';

const hostname = 'localhost';
const port = process.env.PORT || 3000;
const requestEnv = { 
  VALID_KEYS: process.env.VALID_KEYS || "[]"
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
  if (!requestEnv || requestEnv.VALID_KEYS.length == 0) throw "[node-boot.js] 0 auth keys"
  console.log(`[node-boot.js] Loaded auth keys: ${requestEnv.VALID_KEYS.length}`);
  console.log(`[node-boot.js] Started server: http://${hostname}:${port}/`);
});