// Minimal webhook receiver (Node.js, no framework).
// UGIAPI_WEBHOOK_SECRET=whsec_... node webhook-server.js   then set https://your-host/ugi as the URL in the panel.
import { createServer } from 'node:http';
import { verifyWebhook } from 'ugiapi';

const secret = process.env.UGIAPI_WEBHOOK_SECRET;
const seen = new Set(); // use a database in production

createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/ugi') return res.writeHead(404).end();
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks); // verify the RAW body, never re-encoded JSON
    const ok = await verifyWebhook({
      secret,
      body: raw,
      signature: req.headers['x-ugi-signature'],
      timestamp: req.headers['x-ugi-timestamp'],
    });
    if (!ok) return res.writeHead(401).end();

    const delivery = req.headers['x-ugi-delivery'];
    res.writeHead(200).end(); // answer within 5 s, do the work afterwards
    if (seen.has(delivery)) return; // retries reuse the same delivery id
    seen.add(delivery);

    const event = JSON.parse(raw.toString('utf8'));
    if (event.event === 'match.new') {
      const m = event.data.last_match;
      console.log(`${event.label}: ${m.won ? 'won' : 'lost'} ${m.kills}/${m.deaths}/${m.assists}`, event.changes.rr ?? '');
    } else {
      console.log(event.event, event.changes);
    }
  });
}).listen(3000, () => console.log('Listening on :3000/ugi'));
