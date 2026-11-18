# ugiapi · Python client

Single-file client for [ugiAPI](https://api.ugilabs.com), the unofficial Valorant API. Python 3.8+, depends only on `requests`.

```bash
pip install "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"
```

Or just copy [`ugiapi.py`](ugiapi.py) into your project.

```python
from ugiapi import UgiApi, UgiApiError

api = UgiApi("YOUR_API_KEY")

try:
    res = api.get_rank("eu", "Name", "Tag")
    print(res.data["current_data"]["currenttierpatched"], (res.data["peak"] or {}).get("tier_patched"))
    print("cache:", res.meta.cache, "riot queries spent:", res.meta.upstream_cost)
except UgiApiError as e:
    if e.code == "player_not_found":
        print("No such player")
    else:
        raise
```

## Options

```python
UgiApi(
    "YOUR_API_KEY",           # from https://api.ugilabs.com/panel/
    retries=2,                # automatic retries on 429/503 using Retry-After
    max_retry_wait=60,        # never wait longer than this (seconds)
    timeout=15,               # seconds per request
    user_agent="my-app/1.0",  # prepended to the User-Agent
    session=None,             # optional requests.Session
)
```

## Methods

Every method returns a `Result` with `.data` and `.meta`. Player methods take `name, tag` or `puuid=...`. All of them accept `etag=...`.

| Method | Endpoint | Extra parameters |
| --- | --- | --- |
| `get_account(name, tag)` / `get_account(puuid=…)` | `/v1/account` | `region`, `enrich` |
| `get_rank(region, name, tag)` | `/v1/rank` | `force` (Premium) |
| `get_rank_history(region, name, tag)` | `/v1/rank-history` | `size` (1–10), `force` |
| `get_matches(region, name, tag)` | `/v1/matches` | `size`, `mode`, `start`, `force` |
| `iter_match_pages(region, name, tag)` | `/v1/matches` | generator that follows `pagination.next_start`; `max_pages` |
| `get_stored_matches(region, name, tag)` | `/v1/stored-matches` | `mode`, `map`, `agent`, `season`, `size`, `page` |
| `get_match(match_id)` | `/v1/match` | `region` |
| `get_leaderboard(region)` | `/v1/leaderboard` | `act_id`, `size`, `start`, `search` |
| `get_content()` | `/v1/content` | `locale` |
| `get_status(region)` | `/v1/status` | no key needed |
| `request(path, params)` | any | low-level escape hatch |

`meta` fields: `cache`, `age`, `cache_ttl`, `upstream_cost`, `rate_limit`, `daily`, `upstream`, `upstream_daily` (each `Window(limit, remaining, reset)`), `policy`, `windows` (parsed IETF headers), `etag`, `not_modified`, `request_id`, `retry_after`, `deprecation`.

## Long-term stats

```python
s = api.get_stored_matches("eu", "Name", "Tag", mode="competitive", agent="Jett").data
print(s["summary"])          # matches, wins, losses, win_pct, kd, headshot_pct, adr, acs, ...
for m in s["matches"]:
    print(m["started_at"], m["map"]["name"], m["player"]["kills"], m["result"]["won"])
```

## Webhooks

```python
from ugiapi import verify_webhook

ok = verify_webhook(secret, raw_body, request.headers["X-UGI-Signature"], request.headers["X-UGI-Timestamp"])
```

Full example: [`examples/webhook_flask.py`](examples/webhook_flask.py). Using asyncio (discord.py)? Wrap calls in `asyncio.to_thread(...)`, see [`examples/discord_bot.py`](examples/discord_bot.py).

## Tests

```bash
python python/tests/test_ugiapi.py                          # offline
UGIAPI_KEY=your_key python python/tests/test_ugiapi.py --live   # live smoke test
```
