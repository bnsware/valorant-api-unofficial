"""Player overview: rank, recent competitive games and long-term stats.

UGIAPI_KEY=... python player_stats.py eu Name Tag
"""
import os
import sys

from ugiapi import UgiApi, UgiApiError

if len(sys.argv) < 4:
    sys.exit("Usage: python player_stats.py <region> <name> <tag>")
region, name, tag = sys.argv[1:4]
api = UgiApi(os.environ.get("UGIAPI_KEY"))

try:
    rank = api.get_rank(region, name, tag).data
except UgiApiError as e:
    sys.exit("Player not found." if e.code == "player_not_found" else str(e))

cur = rank["current_data"]
peak = (rank.get("peak") or {}).get("tier_patched", "-")
print(f"{rank['name']}#{rank['tag']}  {cur['currenttierpatched']} {cur['ranking_in_tier'] or 0} RR  (peak {peak})")

res = api.get_matches(region, name, tag, size=5, mode="competitive")
for m in res.data["matches"]:
    p = m["player"]
    if not p:
        continue
    s, c = p["stats"], p["combat"]
    won = "W" if m["teams"].get(p["team"], {}).get("won") else "L"
    line = f"  {won}  {(m['map_details'] or {}).get('name', '?'):<8} {(p['character_details'] or {}).get('name', '?'):<9} {s['kills']}/{s['deaths']}/{s['assists']}"
    if c:
        fk = "-" if c["first_kills"] is None else c["first_kills"]
        line += f"  HS {c['headshot_pct']}%  ADR {c['adr']}  FK {fk}"
    print(line)
print(f"  (this call spent {res.meta.upstream_cost} Riot queries; {res.meta.upstream.remaining} left this minute)")

t = api.get_stored_matches(region, name, tag, mode="competitive").data["summary"]
print(f"Stored competitive games: {t['matches']}  WR {t['win_pct']}%  K/D {t['kd']}  HS {t['headshot_pct']}%  ADR {t['adr']}")
