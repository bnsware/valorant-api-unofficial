// Player overview in the terminal: rank, recent competitive games and long-term stats.
// UGIAPI_KEY=... node player-stats.js eu Name Tag
import { UgiApi } from 'ugiapi';

const [region = 'eu', name, tag] = process.argv.slice(2);
if (!name || !tag) {
  console.error('Usage: node player-stats.js <region> <name> <tag>');
  process.exit(1);
}
const api = new UgiApi({ apiKey: process.env.UGIAPI_KEY });

const { data: rank } = await api.getRank({ region, name, tag });
console.log(`${rank.name}#${rank.tag}  ${rank.current_data.currenttierpatched} ${rank.current_data.ranking_in_tier ?? 0} RR  (peak ${rank.peak?.tier_patched ?? '-'})`);

const { data: list, meta } = await api.getMatches({ region, name, tag, size: 5, mode: 'competitive' });
for (const m of list.matches) {
  const p = m.player;
  if (!p) continue;
  const s = p.stats;
  const won = m.teams[p.team]?.won ? 'W' : 'L';
  const c = p.combat;
  console.log(`  ${won}  ${(m.map_details?.name ?? '?').padEnd(8)} ${(p.character_details?.name ?? '?').padEnd(9)} ${s.kills}/${s.deaths}/${s.assists}` +
    (c ? `  HS ${c.headshot_pct}%  ADR ${c.adr}  FK ${c.first_kills ?? '-'}` : ''));
}
console.log(`  (this call spent ${meta.upstreamCost} Riot queries; ${meta.upstream.remaining} left this minute)`);

const { data: stored } = await api.getStoredMatches({ region, name, tag, mode: 'competitive' });
const t = stored.summary;
console.log(`Stored competitive games: ${t.matches}  WR ${t.win_pct ?? '-'}%  K/D ${t.kd ?? '-'}  HS ${t.headshot_pct ?? '-'}%  ADR ${t.adr ?? '-'}`);
