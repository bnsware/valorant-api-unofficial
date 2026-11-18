<h1 align="center">Valorant API (unofficial) · ugiAPI</h1>

<p align="center">
  Free REST API for Valorant player data: <b>rank &amp; RR history, match history with headshot % / ADR / first kills, stored match stats, leaderboards and webhooks</b>.<br>
  Official JavaScript and Python clients included.
</p>

<p align="center">
  <a href="https://api.ugilabs.com/docs/"><img alt="Docs" src="https://img.shields.io/badge/docs-api.ugilabs.com-10b981?style=for-the-badge"></a>
  <img alt="API version" src="https://img.shields.io/badge/API-v1.2.0-3f3f46?style=for-the-badge">
  <a href="https://api.ugilabs.com/status"><img alt="Status" src="https://img.shields.io/badge/status-live-10b981?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-3f3f46?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://api.ugilabs.com/docs/">Documentation</a> ·
  <a href="https://api.ugilabs.com/examples">Examples</a> ·
  <a href="https://api.ugilabs.com/openapi.json">OpenAPI</a> ·
  <a href="https://api.ugilabs.com/changelog">Changelog</a> ·
  <a href="https://api.ugilabs.com/status">Status</a> ·
  <a href="README.tr.md">Türkçe</a>
</p>

---

## Contents

- [Quick start](#quick-start)
- [Get an API key](#get-an-api-key)
- [Endpoints](#endpoints)
- [Clients (JavaScript, Python)](#clients)
- [Plans and limits](#plans-and-limits)
- [Response headers](#response-headers)
- [Errors](#errors)
- [Webhooks](#webhooks)
- [Rules](#rules)
- [Legal](#legal)

## Quick start

```bash
curl "https://api.ugilabs.com/v1/rank/eu/Name/Tag" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "status": 200,
  "data": {
    "name": "Name",
    "tag": "Tag",
    "puuid": "6f1d2c3b-…",
    "current_data": { "currenttier": 21, "currenttierpatched": "Ascendant 1", "ranking_in_tier": 47, "wins": 31, "games": 58 },
    "peak": { "tier": 22, "tier_patched": "Ascendant 2", "source": "win" },
    "by_season": [ … ]
  }
}
```

**JavaScript** (Node.js 18+, no dependencies)

```bash
npm install github:bnsware/valorant-api-unofficial
```

```js
import { UgiApi } from 'ugiapi';

const api = new UgiApi({ apiKey: process.env.UGIAPI_KEY });
const { data } = await api.getMatches({ region: 'eu', name: 'Name', tag: 'Tag', mode: 'competitive', size: 5 });
for (const m of data.matches) console.log(m.map_details?.name, m.player.stats.kills, m.player.combat?.headshot_pct);
```

**Python** (3.8+)

```bash
pip install "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"
```

```python
from ugiapi import UgiApi

api = UgiApi("YOUR_API_KEY")
summary = api.get_stored_matches("eu", "Name", "Tag", mode="competitive").data["summary"]
print(summary["win_pct"], summary["kd"], summary["headshot_pct"], summary["adr"])
```

## Get an API key

1. Open the developer panel: **https://api.ugilabs.com/panel/**
2. Sign in with Discord.
3. Create a key. You can restrict it to your server's IP addresses or your website's origins.

Send the key as `Authorization: Bearer YOUR_API_KEY` (recommended) or `X-API-Key: YOUR_API_KEY`. `?api_key=` also works (useful for Twitch bots), but it ends up in logs.

> Never put your key in public code, a browser bundle or a screenshot. If it leaks, regenerate it in the panel.

## Endpoints

Base URL: `https://api.ugilabs.com` · every endpoint is `GET` · regions: `eu`, `na`, `ap`, `kr`, `br`, `latam`

Every route that takes a Riot ID also has a PUUID version under `/v1/by-puuid/…`.

| Endpoint | What you get |
| --- | --- |
| `/v1/account/{name}/{tag}` | PUUID, Riot ID, account level, player card and title |
| `/v1/rank/{region}/{name}/{tag}` | Current tier and RR, wins and games this act, **all-time peak** and a per-act summary |
| `/v1/rank-history/{region}/{name}/{tag}` | Last 1–10 competitive games: RR earned, tier and RR before/after, performance bonus, **RR refunds**, **derank protection** |
| `/v1/matches/{region}/{name}/{tag}` | Recent matches with K/D/A, **headshot %, ADR, first kills/deaths, economy**. Filter with `?mode=`, page with `?start=` |
| `/v1/stored-matches/{region}/{name}/{tag}` | Long-term match list from our match store with filters (mode, map, agent, act), pagination and a **summary** (win %, K/D, HS %, ADR, ACS). **No Riot query cost** |
| `/v1/match/{matchId}` | Full match: every player with stats and combat numbers, teams, rounds with first kills |
| `/v1/leaderboard/{region}` | Ranked leaderboard (act, page, search by name) |
| `/v1/content` | Agents, maps, acts, game modes, player cards and titles (`en-US`, `tr-TR`) |
| `/v1/status/{region}` | Riot service status (**no key needed**) |

`mode` values: `competitive`, `unrated`, `swiftplay`, `spikerush`, `deathmatch`, `teamdeathmatch`, `premier`, `escalation`, `replication`, `snowball`, `newmap`, `custom`.

Full parameter and field reference: **https://api.ugilabs.com/docs/** · machine-readable: [`openapi.json`](openapi.json) (OpenAPI 3.1, import it into Postman or generate your own client).

## Clients

| Language | Folder | Install |
| --- | --- | --- |
| JavaScript / TypeScript | [`js/`](js/) | `npm install github:bnsware/valorant-api-unofficial` |
| Python | [`python/`](python/) | `pip install "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"` |

Both clients:

- cover every endpoint, with types (TypeScript definitions included)
- return `{ data, meta }`: `meta` carries cache status, remaining requests, Riot query budget and what the call cost
- retry `429`/`503` automatically using `Retry-After` (never for daily quota errors)
- support ETags (`304 Not Modified`)
- raise a typed error with a stable `code` and the `request_id`
- include a webhook signature verifier

Examples: [Discord bot](js/examples/discord-bot.js) · [player stats](js/examples/player-stats.js) · [webhook server](js/examples/webhook-server.js) · [Python Discord bot](python/examples/discord_bot.py) · [Python player stats](python/examples/player_stats.py) · [Flask webhook](python/examples/webhook_flask.py)

Using another language? Generate a client from [`openapi.json`](openapi.json) with [OpenAPI Generator](https://openapi-generator.tech/).

## Plans and limits

| | Basic | Advanced | Premium |
| --- | :-: | :-: | :-: |
| Matches per request (`/v1/matches`) | 5 | 10 | 20 |
| Stored matches per page | 20 | 50 | 100 |
| Webhooks | – | ✓ | ✓ |
| `?force=true` (skip cache) | – | – | ✓ |

Every key has a **per-minute** and a **daily** request limit, plus a **Riot query budget**: only lookups that are not already cached count against the budget. Data is served from a shared cache; how fresh live data is (rank, rank history, match list) depends on your plan. Current numbers: **https://api.ugilabs.com/docs/#rate-limiting**.

## Response headers

| Header | Meaning |
| --- | --- |
| `X-Cache`, `Age`, `X-Cache-TTL` | Cache hit or miss, age of the data, seconds it still counts as fresh for your plan |
| `ETag` / `If-None-Match` | Send the ETag back to get `304 Not Modified` |
| `X-RateLimit-Limit / -Remaining / -Reset` | Per-minute request limit (`-Daily-*` for the daily one) |
| `X-RateLimit-Upstream-*` | Riot query budget (minute and day) |
| `X-Upstream-Cost` | Riot queries this request spent (`0` = served from cache) |
| `RateLimit-Policy`, `RateLimit` | The same limits in the IETF format: windows `"minute"`, `"day"`, `"riot-minute"`, `"riot-day"` |
| `Retry-After` | On `429` and `503`: seconds to wait |
| `X-Request-Id` | Include it when you ask for support |

## Errors

```json
{ "status": 404, "error": "Player not found", "code": "player_not_found", "request_id": "ab85df05829198f2" }
```

Branch on `code`, never on the message.

| HTTP | Codes |
| :-: | --- |
| 400 | `bad_request`, `missing_parameters`, `invalid_region`, `invalid_name`, `invalid_tag`, `invalid_puuid`, `invalid_match_id`, `invalid_act`, `invalid_locale`, `invalid_mode`, `invalid_map`, `invalid_agent`, `invalid_parameter`, `force_not_allowed` |
| 401 | `api_key_missing`, `api_key_invalid` |
| 403 | `ip_not_allowed`, `origin_not_allowed` |
| 404 | `player_not_found`, `not_found`, `endpoint_not_found` |
| 429 | `rate_limited`, `daily_quota_exceeded`, `user_daily_quota_exceeded`, `upstream_budget_exceeded` — wait for `Retry-After` |
| 503 | `service_unavailable`, `maintenance` — wait for `Retry-After` |

## Webhooks

Instead of polling, let us call you. Add tracked players in the panel (**https://api.ugilabs.com/panel/webhooks**) and you get a signed `POST` on:

- `match.new` — the player finished a match (with K/D/A, agent, map and result)
- `rank.changed` — tier or RR changed
- `account.level_changed`
- `webhook.test`

Verify every delivery: `X-UGI-Signature: sha256=HMAC_SHA256(secret, X-UGI-Timestamp + "." + raw_body)`. Reject timestamps older than 5 minutes, answer `2xx` within 5 seconds and skip `X-UGI-Delivery` ids you have already processed. Both clients ship a verifier:

```js
import { verifyWebhook } from 'ugiapi';
const ok = await verifyWebhook({ secret, body: rawBody, signature: req.headers['x-ugi-signature'], timestamp: req.headers['x-ugi-timestamp'] });
```

## Rules

By using ugiAPI you agree to the [Terms of Service](https://api.ugilabs.com/legal/terms). In short:

- Do not share your API key with third parties.
- Do not try to get around the rate and quota limits of your key.
- Do not use the service for anything unlawful.
- Do not try to reverse-engineer or abuse the system.
- Do not use the data to harass, stalk or harm other players.

## Legal

ugiAPI isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, Valorant and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

The client code in this repository is released under the [MIT License](LICENSE). The API itself is provided "as is", without guarantees of uptime or data accuracy.

Images of agents, maps and ranks come from [valorant-api.com](https://valorant-api.com).
