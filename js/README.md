# ugiapi · JavaScript / TypeScript client

Zero-dependency client for [ugiAPI](https://api.ugilabs.com), the unofficial Valorant API. Node.js 18+, Deno, Bun and modern browsers. TypeScript definitions included.

```bash
npm install github:bnsware/valorant-api-unofficial
```

```js
import { UgiApi, UgiApiError } from 'ugiapi';

const api = new UgiApi({ apiKey: process.env.UGIAPI_KEY });

try {
  const { data, meta } = await api.getRank({ region: 'eu', name: 'Name', tag: 'Tag' });
  console.log(data.current_data.currenttierpatched, data.peak?.tier_patched);
  console.log('cache:', meta.cache, 'riot queries spent:', meta.upstreamCost);
} catch (e) {
  if (e instanceof UgiApiError && e.code === 'player_not_found') console.log('No such player');
  else throw e;
}
```

## Options

```js
new UgiApi({
  apiKey: 'YOUR_API_KEY',   // from https://api.ugilabs.com/panel/
  retries: 2,               // automatic retries on 429/503 using Retry-After
  maxRetryWait: 60,         // never wait longer than this (seconds)
  timeout: 15000,           // ms per request
  userAgent: 'my-app/1.0',  // prepended to the User-Agent (Node only)
  fetch: customFetch,       // optional fetch implementation
});
```

> Do not ship your key to browsers. In a web app, call the API from your server.

## Methods

Every method takes one object and returns `Promise<{ data, meta }>`. Player methods accept either `{ name, tag }` or `{ puuid }`. All of them also accept `etag` and `signal` (AbortSignal).

| Method | Endpoint | Extra parameters |
| --- | --- | --- |
| `getAccount({ name, tag } \| { puuid })` | `/v1/account` | `region`, `enrich` |
| `getRank({ region, … })` | `/v1/rank` | `force` (Premium) |
| `getRankHistory({ region, … })` | `/v1/rank-history` | `size` (1–10), `force` |
| `getMatches({ region, … })` | `/v1/matches` | `size`, `mode`, `start`, `force` |
| `matchPages({ region, …, maxPages })` | `/v1/matches` | async iterator that follows `pagination.next_start` |
| `getStoredMatches({ region, … })` | `/v1/stored-matches` | `mode`, `map`, `agent`, `season`, `size`, `page` |
| `getMatch({ matchId })` | `/v1/match` | `region` |
| `getLeaderboard({ region })` | `/v1/leaderboard` | `actId`, `size`, `start`, `search` |
| `getContent()` | `/v1/content` | `locale` |
| `getStatus({ region })` | `/v1/status` | no key needed |
| `request(path, query, opts)` | any | low-level escape hatch |

## `meta`

| Field | Meaning |
| --- | --- |
| `cache`, `age`, `cacheTtl` | `HIT`/`MISS`, age of the data, seconds still fresh for your plan |
| `upstreamCost` | Riot queries this call spent (`0` = cache) |
| `rateLimit`, `daily` | `{ limit, remaining, reset }` for your request limits |
| `upstream`, `upstreamDaily` | `{ limit, remaining, reset }` for your Riot query budget |
| `policy`, `windows` | Parsed IETF `RateLimit-Policy` / `RateLimit` headers |
| `etag`, `notModified` | Pass `etag` on the next call; `notModified` is `true` on `304` |
| `requestId`, `retryAfter`, `deprecation` | Support id, `Retry-After` seconds, `Deprecation` header |

## Pagination

```js
for await (const { data } of api.matchPages({ region: 'eu', name: 'Name', tag: 'Tag', mode: 'competitive', size: 10, maxPages: 3 })) {
  for (const m of data.matches) console.log(m.match_id, m.player?.combat?.adr);
}
```

Each new page costs Riot queries. For long-term stats, prefer `getStoredMatches` (no Riot query cost).

## Webhooks

```js
import { verifyWebhook } from 'ugiapi';

const ok = await verifyWebhook({
  secret: process.env.UGIAPI_WEBHOOK_SECRET, // whsec_…
  body: rawBody,                             // raw bytes or string, NOT re-encoded JSON
  signature: req.headers['x-ugi-signature'],
  timestamp: req.headers['x-ugi-timestamp'],
});
```

Full example: [`examples/webhook-server.js`](examples/webhook-server.js).

## Tests

```bash
npm test                                  # offline
UGIAPI_KEY=your_key node js/test/test.mjs --live   # live smoke test
```
