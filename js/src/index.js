// ugiapi: official JavaScript client for ugiAPI (https://api.ugilabs.com).
// Zero dependencies. Works in Node.js 18+, Deno, Bun and modern browsers.

const DEFAULT_BASE_URL = 'https://api.ugilabs.com';
const VERSION = '1.2.0';
const RETRYABLE_CODES = new Set(['rate_limited', 'upstream_rate_limited', 'upstream_budget_exceeded', 'service_unavailable', 'maintenance']);

export const REGIONS = Object.freeze(['eu', 'na', 'ap', 'kr', 'br', 'latam']);
export const MODES = Object.freeze([
  'competitive', 'unrated', 'swiftplay', 'spikerush', 'deathmatch', 'teamdeathmatch',
  'premier', 'escalation', 'replication', 'snowball', 'newmap', 'custom',
]);

/** Error thrown for every non-2xx response. Branch on `code`, not on `message`. */
export class UgiApiError extends Error {
  constructor({ status, code, message, requestId = null, details = null, meta = null }) {
    super(message || code || `HTTP ${status}`);
    this.name = 'UgiApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    this.meta = meta;
  }
  /** Seconds the server asked us to wait (Retry-After), or null. */
  get retryAfter() {
    return this.meta?.retryAfter ?? null;
  }
}

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Parses an IETF RateLimit / RateLimit-Policy header into { name: { q, w, r, t } }. */
export function parseRateLimitHeader(value) {
  const out = {};
  if (!value) return out;
  for (const item of value.split(',')) {
    const m = item.trim().match(/^"([^"]+)"(.*)$/);
    if (!m) continue;
    const entry = {};
    for (const kv of m[2].split(';')) {
      const [k, v] = kv.split('=');
      if (k && v !== undefined) entry[k.trim()] = num(v.trim());
    }
    out[m[1]] = entry;
  }
  return out;
}

function readMeta(res) {
  const h = (name) => res.headers.get(name);
  const window = (prefix) => ({ limit: num(h(`${prefix}Limit`)), remaining: num(h(`${prefix}Remaining`)), reset: num(h(`${prefix}Reset`)) });
  return {
    status: res.status,
    requestId: h('x-request-id'),
    cache: h('x-cache'),
    age: num(h('age')),
    cacheTtl: num(h('x-cache-ttl')),
    etag: h('etag'),
    notModified: res.status === 304,
    retryAfter: num(h('retry-after')),
    upstreamCost: num(h('x-upstream-cost')),
    rateLimit: window('x-ratelimit-'),
    daily: window('x-ratelimit-daily-'),
    upstream: window('x-ratelimit-upstream-'),
    upstreamDaily: window('x-ratelimit-upstream-daily-'),
    policy: parseRateLimitHeader(h('ratelimit-policy')),
    windows: parseRateLimitHeader(h('ratelimit')),
    deprecation: h('deprecation'),
  };
}

function player(params, route) {
  if (params.puuid) return { by: 'puuid', path: `/v1/by-puuid/${route}` };
  if (!params.name || !params.tag) throw new TypeError(`${route}: pass either { puuid } or { name, tag }`);
  return { by: 'riotid', path: `/v1/${route}` };
}

function need(value, name) {
  if (value === undefined || value === null || value === '') throw new TypeError(`Missing parameter: ${name}`);
  return value;
}

const enc = encodeURIComponent;

export class UgiApi {
  /**
   * @param {object} options
   * @param {string} options.apiKey      Your key from https://api.ugilabs.com/panel/
   * @param {string} [options.baseUrl]   Defaults to https://api.ugilabs.com
   * @param {number} [options.retries]   Automatic retries on 429/503 with Retry-After (default 2)
   * @param {number} [options.maxRetryWait] Longest Retry-After (seconds) we are willing to wait (default 60)
   * @param {number} [options.timeout]   Request timeout in ms (default 15000)
   * @param {string} [options.userAgent] Extra User-Agent (Node only; browsers ignore it)
   * @param {typeof fetch} [options.fetch] Custom fetch implementation
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, retries = 2, maxRetryWait = 60, timeout = 15000, userAgent, fetch: fetchImpl } = {}) {
    this.apiKey = apiKey || null;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.retries = retries;
    this.maxRetryWait = maxRetryWait;
    this.timeout = timeout;
    this.userAgent = userAgent ? `${userAgent} ugiapi-js/${VERSION}` : `ugiapi-js/${VERSION}`;
    this._fetch = fetchImpl || globalThis.fetch?.bind(globalThis);
    if (!this._fetch) throw new Error('No fetch implementation found. Use Node.js 18+ or pass { fetch }.');
  }

  /**
   * Low-level GET. Returns { data, meta }. Throws UgiApiError on errors.
   * @param {string} path  e.g. "/v1/rank/eu/Name/Tag"
   * @param {object} [query]
   * @param {{ etag?: string, signal?: AbortSignal }} [opts]
   */
  async request(path, query = {}, { etag, signal } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '' && v !== false) url.searchParams.set(k, String(v));
    }
    const headers = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (etag) headers['If-None-Match'] = etag;
    if (typeof window === 'undefined') headers['User-Agent'] = this.userAgent;

    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error(`Request timed out after ${this.timeout} ms`)), this.timeout);
      const onAbort = () => ctrl.abort(signal.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      let res;
      try {
        res = await this._fetch(url, { headers, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
      const meta = readMeta(res);
      if (res.status === 304) return { data: null, meta };

      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }

      if (res.ok && body && 'data' in body) return { data: body.data, meta };

      const err = new UgiApiError({
        status: res.status,
        code: body?.code || (res.ok ? 'invalid_response' : 'http_error'),
        message: body?.error || text.slice(0, 200) || `HTTP ${res.status}`,
        requestId: body?.request_id || meta.requestId,
        details: body?.details || null,
        meta,
      });
      const wait = meta.retryAfter ?? (res.status === 503 ? 5 : null);
      if (attempt < this.retries && RETRYABLE_CODES.has(err.code) && wait !== null && wait <= this.maxRetryWait) {
        await sleep(Math.max(1, wait) * 1000);
        continue;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------- Account
  /** Account by Riot ID ({ name, tag }) or PUUID ({ puuid }). */
  getAccount({ name, tag, puuid, region, enrich, etag, signal } = {}) {
    const p = puuid ? `/v1/by-puuid/account/${enc(puuid)}` : `/v1/account/${enc(need(name, 'name'))}/${enc(need(tag, 'tag'))}`;
    return this.request(p, { region, enrich: enrich === false ? 'false' : undefined }, { etag, signal });
  }

  // ---------------------------------------------------------------- Rank
  /** Current rank, all-time peak and per-act summary. */
  getRank({ region, name, tag, puuid, force, etag, signal } = {}) {
    const { by, path } = player({ name, tag, puuid }, 'rank');
    const tail = by === 'puuid' ? enc(puuid) : `${enc(name)}/${enc(tag)}`;
    return this.request(`${path}/${enc(need(region, 'region'))}/${tail}`, { force: force ? 'true' : undefined }, { etag, signal });
  }

  /** Recent competitive RR changes (size 1-10). */
  getRankHistory({ region, name, tag, puuid, size, force, etag, signal } = {}) {
    const { by, path } = player({ name, tag, puuid }, 'rank-history');
    const tail = by === 'puuid' ? enc(puuid) : `${enc(name)}/${enc(tag)}`;
    return this.request(`${path}/${enc(need(region, 'region'))}/${tail}`, { size, force: force ? 'true' : undefined }, { etag, signal });
  }

  // ---------------------------------------------------------------- Matches
  /** Recent matches. `mode` is applied before `size`; page back with `start` = pagination.next_start. */
  getMatches({ region, name, tag, puuid, size, mode, start, force, etag, signal } = {}) {
    const { by, path } = player({ name, tag, puuid }, 'matches');
    const tail = by === 'puuid' ? enc(puuid) : `${enc(name)}/${enc(tag)}`;
    return this.request(`${path}/${enc(need(region, 'region'))}/${tail}`, { size, mode, start, force: force ? 'true' : undefined }, { etag, signal });
  }

  /**
   * Async iterator over match pages: `for await (const page of api.matchPages({...})) { ... }`.
   * Each page costs Riot queries; stop with `maxPages`.
   */
  async *matchPages({ maxPages = 5, ...params } = {}) {
    let start = params.start ?? 0;
    for (let i = 0; i < maxPages; i++) {
      const res = await this.getMatches({ ...params, start });
      yield res;
      const next = res.data?.pagination?.next_start;
      if (next === null || next === undefined) return;
      start = next;
    }
  }

  /** Matches kept in the ugiAPI match store, with a summary. No Riot query cost. */
  getStoredMatches({ region, name, tag, puuid, mode, map, agent, season, size, page, etag, signal } = {}) {
    const { by, path } = player({ name, tag, puuid }, 'stored-matches');
    const tail = by === 'puuid' ? enc(puuid) : `${enc(name)}/${enc(tag)}`;
    return this.request(`${path}/${enc(need(region, 'region'))}/${tail}`, { mode, map, agent, season, size, page }, { etag, signal });
  }

  /** Full match details. `region` is an optional hint (faster when given). */
  getMatch({ matchId, region, etag, signal } = {}) {
    return this.request(`/v1/match/${enc(need(matchId, 'matchId'))}`, { region }, { etag, signal });
  }

  // ---------------------------------------------------------------- Other
  getLeaderboard({ region, actId, size, start, search, etag, signal } = {}) {
    return this.request(`/v1/leaderboard/${enc(need(region, 'region'))}`, { actId, size, start, search }, { etag, signal });
  }

  getContent({ locale, etag, signal } = {}) {
    return this.request('/v1/content', { locale }, { etag, signal });
  }

  /** Service status. No API key needed. */
  getStatus({ region, etag, signal } = {}) {
    return this.request(`/v1/status/${enc(need(region, 'region'))}`, {}, { etag, signal });
  }
}

// ---------------------------------------------------------------- Webhooks
function toBytes(body) {
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new TypeError('body must be the raw request body (string, Buffer, Uint8Array or ArrayBuffer)');
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies an ugiAPI webhook delivery.
 * signature = "sha256=" + HMAC_SHA256(secret, timestamp + "." + raw_body)
 * @param {{ secret: string, body: string|Uint8Array|ArrayBuffer, signature: string, timestamp: string|number, toleranceSeconds?: number, now?: number }} p
 * @returns {Promise<boolean>}
 */
export async function verifyWebhook({ secret, body, signature, timestamp, toleranceSeconds = 300, now = Date.now() / 1000 }) {
  if (!secret || !signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSeconds) return false;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is not available (use Node.js 18+).');
  const key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const raw = toBytes(body);
  const msg = new Uint8Array(String(timestamp).length + 1 + raw.length);
  msg.set(new TextEncoder().encode(`${timestamp}.`), 0);
  msg.set(raw, String(timestamp).length + 1);
  const mac = new Uint8Array(await subtle.sign('HMAC', key, msg));
  const expected = 'sha256=' + Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(expected, String(signature).trim().toLowerCase());
}

export default UgiApi;
