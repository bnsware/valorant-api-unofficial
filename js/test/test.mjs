// Offline tests (no network): node js/test/test.mjs
// Optional live smoke test: UGIAPI_KEY=your_key node js/test/test.mjs --live
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { UgiApi, UgiApiError, verifyWebhook, parseRateLimitHeader } from '../src/index.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

function mockFetch(responses, calls = []) {
  return async (url, init) => {
    calls.push({ url: String(url), headers: init.headers });
    const r = responses.shift();
    const status = r.status ?? 200;
    const body = status === 304 || r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(body, { status, headers: r.headers ?? {} });
  };
}

await test('builds Riot ID path, query and auth header', async () => {
  const calls = [];
  const api = new UgiApi({ apiKey: 'KEY', fetch: mockFetch([{ body: { status: 200, data: { ok: 1 } }, headers: { 'X-Cache': 'MISS', 'X-Upstream-Cost': '2', 'X-RateLimit-Remaining': '29' } }], calls) });
  const { data, meta } = await api.getMatches({ region: 'eu', name: 'Some Name', tag: '0001', size: 5, mode: 'competitive', start: 0 });
  assert.deepEqual(data, { ok: 1 });
  assert.equal(calls[0].url, 'https://api.ugilabs.com/v1/matches/eu/Some%20Name/0001?size=5&mode=competitive&start=0');
  assert.equal(calls[0].headers.Authorization, 'Bearer KEY');
  assert.equal(meta.cache, 'MISS');
  assert.equal(meta.upstreamCost, 2);
  assert.equal(meta.rateLimit.remaining, 29);
});

await test('uses by-puuid routes', async () => {
  const calls = [];
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([{ body: { status: 200, data: {} } }, { body: { status: 200, data: {} } }], calls) });
  await api.getStoredMatches({ region: 'na', puuid: 'abc', map: 'Ascent', page: 2 });
  await api.getRank({ region: 'eu', puuid: 'abc', force: true });
  assert.equal(calls[0].url, 'https://api.ugilabs.com/v1/by-puuid/stored-matches/na/abc?map=Ascent&page=2');
  assert.equal(calls[1].url, 'https://api.ugilabs.com/v1/by-puuid/rank/eu/abc?force=true');
});

await test('throws UgiApiError with code and request id', async () => {
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([{ status: 404, body: { status: 404, error: 'Player not found', code: 'player_not_found', request_id: 'r1' } }]) });
  await assert.rejects(api.getAccount({ name: 'x', tag: 'y' }), (e) => e instanceof UgiApiError && e.code === 'player_not_found' && e.status === 404 && e.requestId === 'r1');
});

await test('retries 429 with Retry-After, then succeeds', async () => {
  const calls = [];
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([
    { status: 429, body: { status: 429, error: 'slow down', code: 'rate_limited', request_id: 'a' }, headers: { 'Retry-After': '1' } },
    { body: { status: 200, data: { ok: true } } },
  ], calls) });
  const { data } = await api.getStatus({ region: 'eu' });
  assert.equal(data.ok, true);
  assert.equal(calls.length, 2);
});

await test('does not retry daily quota errors', async () => {
  const calls = [];
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([{ status: 429, body: { status: 429, error: 'quota', code: 'daily_quota_exceeded', request_id: 'b' }, headers: { 'Retry-After': '1' } }], calls) });
  await assert.rejects(api.getStatus({ region: 'eu' }), (e) => e.code === 'daily_quota_exceeded');
  assert.equal(calls.length, 1);
});

await test('304 with etag returns notModified', async () => {
  const calls = [];
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([{ status: 304 }], calls) });
  const { data, meta } = await api.getContent({ etag: '"abc"' });
  assert.equal(data, null);
  assert.equal(meta.notModified, true);
  assert.equal(calls[0].headers['If-None-Match'], '"abc"');
});

await test('matchPages follows next_start', async () => {
  const calls = [];
  const page = (next) => ({ body: { status: 200, data: { pagination: { next_start: next }, matches: [] } } });
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([page(5), page(10), page(null)], calls) });
  let n = 0;
  for await (const _ of api.matchPages({ region: 'eu', puuid: 'p', size: 5, maxPages: 10 })) n++;
  assert.equal(n, 3);
  assert.match(calls[2].url, /start=10/);
});

await test('rejects missing player reference', async () => {
  const api = new UgiApi({ apiKey: 'K', fetch: mockFetch([]) });
  assert.throws(() => api.getRank({ region: 'eu', name: 'only' }), TypeError);
});

await test('parses IETF RateLimit headers', async () => {
  const p = parseRateLimitHeader('"minute";r=29;t=41, "riot-day";r=399;t=8000');
  assert.deepEqual(p.minute, { r: 29, t: 41 });
  assert.equal(p['riot-day'].r, 399);
});

await test('verifies webhook signatures', async () => {
  const secret = 'whsec_' + 'ab'.repeat(24);
  const body = '{"event":"webhook.test"}';
  const ts = Math.floor(Date.now() / 1000);
  const sig = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  assert.equal(await verifyWebhook({ secret, body, signature: sig, timestamp: ts }), true);
  assert.equal(await verifyWebhook({ secret, body: body + ' ', signature: sig, timestamp: ts }), false);
  assert.equal(await verifyWebhook({ secret, body, signature: sig, timestamp: ts - 3600 }), false);
  assert.equal(await verifyWebhook({ secret, body: Buffer.from(body), signature: sig, timestamp: String(ts) }), true);
});

if (process.argv.includes('--live')) {
  const apiKey = process.env.UGIAPI_KEY;
  if (!apiKey) throw new Error('Set UGIAPI_KEY to run the live smoke test.');
  const api = new UgiApi({ apiKey });
  await test('live: status (no key needed)', async () => {
    const { meta } = await new UgiApi().getStatus({ region: 'eu' });
    assert.equal(meta.status, 200);
  });
  await test('live: leaderboard -> rank -> history -> matches -> stored', async () => {
    const lb = await api.getLeaderboard({ region: 'eu', size: 1 });
    const puuid = lb.data.players[0].puuid;
    assert.ok(puuid);
    const rank = await api.getRank({ region: 'eu', puuid });
    assert.equal(typeof rank.data.current_data.currenttier, 'number');
    const hist = await api.getRankHistory({ region: 'eu', puuid, size: 1 });
    assert.ok(Array.isArray(hist.data.history));
    const m = await api.getMatches({ region: 'eu', puuid, size: 1, mode: 'competitive' });
    assert.equal(m.data.mode, 'competitive');
    const s = await api.getStoredMatches({ region: 'eu', puuid, size: 1 });
    assert.equal(typeof s.data.summary.matches, 'number');
    assert.ok(Object.keys(s.meta.policy).length > 0);
  });
  await test('live: invalid mode -> UgiApiError(invalid_mode)', async () => {
    await assert.rejects(api.getMatches({ region: 'eu', name: 'a', tag: 'b', mode: 'nope' }), (e) => e.code === 'invalid_mode');
  });
}

console.log(`\n${passed} passed`);
