// Type definitions for ugiapi (ugiAPI v1.2.0)

export type Region = 'eu' | 'na' | 'ap' | 'kr' | 'br' | 'latam';
export type Mode =
  | 'competitive' | 'unrated' | 'swiftplay' | 'spikerush' | 'deathmatch' | 'teamdeathmatch'
  | 'premier' | 'escalation' | 'replication' | 'snowball' | 'newmap' | 'custom';
export type Locale = 'en-US' | 'tr-TR';

export declare const REGIONS: readonly Region[];
export declare const MODES: readonly Mode[];

export interface RateWindow { limit: number | null; remaining: number | null; reset: number | null }
export interface RateLimitItem { q?: number | null; w?: number | null; r?: number | null; t?: number | null }

export interface Meta {
  status: number;
  requestId: string | null;
  /** "HIT" or "MISS" */
  cache: string | null;
  age: number | null;
  /** Seconds the cached data still counts as fresh for your plan */
  cacheTtl: number | null;
  etag: string | null;
  /** true when you sent `etag` and the data did not change (304) */
  notModified: boolean;
  retryAfter: number | null;
  /** Riot queries this request spent from your Riot query budget (0 = cache) */
  upstreamCost: number | null;
  rateLimit: RateWindow;
  daily: RateWindow;
  upstream: RateWindow;
  upstreamDaily: RateWindow;
  /** IETF RateLimit-Policy: "minute", "day", "riot-minute", "riot-day" */
  policy: Record<string, RateLimitItem>;
  /** IETF RateLimit: remaining (r) and seconds to reset (t) per window */
  windows: Record<string, RateLimitItem>;
  deprecation: string | null;
}

export interface Result<T> { data: T; meta: Meta }

export type ErrorCode =
  | 'bad_request' | 'missing_parameters' | 'invalid_region' | 'invalid_name' | 'invalid_tag' | 'invalid_puuid'
  | 'invalid_match_id' | 'invalid_act' | 'invalid_locale' | 'invalid_mode' | 'invalid_map' | 'invalid_agent'
  | 'invalid_parameter' | 'force_not_allowed' | 'api_key_missing' | 'api_key_invalid' | 'ip_not_allowed'
  | 'origin_not_allowed' | 'player_not_found' | 'not_found' | 'endpoint_not_found' | 'method_not_allowed'
  | 'rate_limited' | 'daily_quota_exceeded' | 'user_daily_quota_exceeded' | 'upstream_budget_exceeded'
  | 'upstream_rate_limited' | 'service_unavailable' | 'maintenance' | (string & {});

export declare class UgiApiError extends Error {
  status: number;
  code: ErrorCode;
  requestId: string | null;
  details: Record<string, unknown> | null;
  meta: Meta | null;
  readonly retryAfter: number | null;
}

export interface RequestOptions { etag?: string; signal?: AbortSignal }
type PlayerRef = { name: string; tag: string; puuid?: never } | { puuid: string; name?: never; tag?: never };

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  retries?: number;
  maxRetryWait?: number;
  timeout?: number;
  userAgent?: string;
  fetch?: typeof fetch;
}

// ------------------------------------------------------------------ data shapes
export interface TierDetails { name: string | null; icon: string | null }
export interface MapDetails { name: string | null; splash: string | null; icon: string | null }
export interface AgentDetails { name: string | null; portrait: string | null; icon: string | null }
export interface ActInfo { name: string | null; episode: string | null; start: string | null; end: string | null }

export interface Account {
  puuid: string;
  name: string | null;
  tag: string | null;
  account_level: number | null;
  card: string | null;
  title: string | null;
  card_details: { id: string; name: string | null; small: string | null; large: string | null; wide: string | null; icon: string | null } | null;
  title_details: { id: string; name: string | null; text: string | null } | null;
}

export interface Rank {
  name: string | null;
  tag: string | null;
  puuid: string;
  account_level: number | null;
  current_data: {
    currenttier: number;
    currenttierpatched: string;
    tier_details: TierDetails | null;
    ranking_in_tier: number | null;
    wins: number | null;
    games: number | null;
    source_match_id: string | null;
    as_of: string | null;
  };
  /** Highest tier across all acts (no RR). */
  peak: { tier: number; tier_patched: string; season_id: string | null; act: ActInfo | null; source: 'win' | 'final' } | null;
  by_season: Array<{
    season_id: string;
    act: ActInfo | null;
    final_tier: number;
    final_tier_patched: string;
    final_rr: number | null;
    wins: number;
    games: number;
    leaderboard_rank: number | null;
    peak_win_tier: number | null;
    wins_by_tier: Record<string, number>;
  }>;
}

export interface RankHistoryEntry {
  match_id: string;
  tier: string;
  tier_id: number;
  tier_details: TierDetails | null;
  won: boolean | null;
  map: string | null;
  map_details: MapDetails | null;
  game_mode: 'competitive';
  date: string | null;
  season_id: string | null;
  tier_before_id: number | null;
  tier_before: string | null;
  tier_change: 'promoted' | 'demoted' | 'none' | null;
  ranked_rating_before_update: number | null;
  ranked_rating_after_update: number | null;
  ranked_rating_earned: number | null;
  performance_bonus: number | null;
  refunded_rr: number | null;
  was_derank_protected: boolean | null;
  afk_penalty: number;
}
export interface RankHistory { name: string | null; tag: string | null; puuid: string; history: RankHistoryEntry[] }

/** Derived from round data; null for matches cached before v1.2.0. */
export interface Combat {
  shots: { head: number; body: number; leg: number };
  headshot_pct: number | null;
  damage: { made: number; received: number };
  adr: number | null;
  first_kills: number | null;
  first_deaths: number | null;
  economy: { spent_total: number; spent_avg: number; loadout_value_avg: number } | null;
}

export interface MatchSummary {
  match_id: string;
  map: string | null;
  map_details: MapDetails | null;
  game_mode: string | null;
  game_start: string | null;
  game_length_ms: number;
  player: {
    puuid: string;
    team: string | null;
    character: string | null;
    character_details: AgentDetails | null;
    competitive_tier: number;
    tier_details: TierDetails | null;
    stats: { score: number; kills: number; deaths: number; assists: number; rounds_played: number };
    combat: Combat | null;
  } | null;
  /** Keyed by team id ("Blue", "Red") */
  teams: Record<string, { won: boolean; rounds_won: number; rounds_played: number }>;
}

export interface MatchList {
  name: string | null;
  tag: string | null;
  puuid: string;
  mode: string | null;
  total_matches: number;
  pagination: { start: number; size: number; returned: number; total: number | null; next_start: number | null };
  matches: MatchSummary[];
}

export interface MatchDetail {
  match_info: {
    match_id: string;
    map: string | null;
    map_details: MapDetails | null;
    game_mode: string | null;
    is_ranked: boolean;
    season_id: string | null;
    game_start: string | null;
    region: string | null;
    game_length_ms: number;
  };
  players: Array<{
    puuid: string;
    game_name: string | null;
    tag_line: string | null;
    team: string | null;
    character: string | null;
    character_details: AgentDetails | null;
    competitive_tier: number;
    tier_details: TierDetails | null;
    stats: { score: number; kills: number; deaths: number; assists: number; rounds_played: number; playtime_ms: number };
    ability_casts: { grenadeCasts?: number; ability1Casts?: number; ability2Casts?: number; ultimateCasts?: number } | null;
    combat: Combat | null;
  }>;
  teams: Array<{ team_id: string; won: boolean; rounds_won: number; rounds_played: number; num_points: number }>;
  rounds: Array<{
    round_num: number;
    round_result: string | null;
    round_ceremony: string | null;
    winning_team: string | null;
    bomb_planter: string | null;
    bomb_defuser: string | null;
    plant_site: string | null;
    first_kill: { killer: string; victim: string | null } | null;
  }>;
}

export interface StoredMatch {
  match_id: string;
  map: { id: string; name: string | null };
  mode: string;
  season_id: string | null;
  started_at: string;
  game_length_ms: number;
  player: {
    team: string | null;
    agent: { id: string | null; name: string | null };
    competitive_tier: number;
    competitive_tier_patched: string;
    score: number;
    kills: number;
    deaths: number;
    assists: number;
    rounds_played: number;
    shots: { head: number; body: number; leg: number } | null;
    headshot_pct: number | null;
    damage: { made: number; received: number } | null;
    adr: number | null;
  };
  result: { won: boolean | null; rounds_won: number; rounds_lost: number };
}

export interface StoredMatches {
  name: string | null;
  tag: string | null;
  puuid: string;
  region: string;
  filters: { mode: string | null; map: string | null; season: string | null; agent: string | null };
  pagination: { page: number; size: number; returned: number; total: number; pages: number };
  summary: {
    matches: number; wins: number; losses: number; win_pct: number | null;
    kills: number; deaths: number; assists: number; kd: number | null;
    headshot_pct: number | null; adr: number | null; acs: number | null;
    first_match_at: string | null; last_match_at: string | null;
  };
  matches: StoredMatch[];
}

export interface Leaderboard {
  act_id: string;
  total_players: number;
  shard: string;
  players: Array<{
    puuid: string | null;
    game_name: string;
    tag_line: string;
    leaderboard_rank: number;
    ranked_rating: number;
    number_of_wins: number;
    competitive_tier: number;
    tier_details: TierDetails | null;
  }>;
}

// ------------------------------------------------------------------ client
export declare class UgiApi {
  constructor(options?: ClientOptions);
  request<T = unknown>(path: string, query?: Record<string, unknown>, options?: RequestOptions): Promise<Result<T>>;

  getAccount(p: PlayerRef & { region?: Region; enrich?: boolean } & RequestOptions): Promise<Result<Account>>;
  getRank(p: PlayerRef & { region: Region; force?: boolean } & RequestOptions): Promise<Result<Rank>>;
  getRankHistory(p: PlayerRef & { region: Region; size?: number; force?: boolean } & RequestOptions): Promise<Result<RankHistory>>;
  getMatches(p: PlayerRef & { region: Region; size?: number; mode?: Mode; start?: number; force?: boolean } & RequestOptions): Promise<Result<MatchList>>;
  matchPages(p: PlayerRef & { region: Region; size?: number; mode?: Mode; start?: number; maxPages?: number }): AsyncGenerator<Result<MatchList>, void, unknown>;
  getStoredMatches(p: PlayerRef & { region: Region; mode?: Mode; map?: string; agent?: string; season?: string; size?: number; page?: number } & RequestOptions): Promise<Result<StoredMatches>>;
  getMatch(p: { matchId: string; region?: Region } & RequestOptions): Promise<Result<MatchDetail>>;
  getLeaderboard(p: { region: Region; actId?: string; size?: number; start?: number; search?: string } & RequestOptions): Promise<Result<Leaderboard>>;
  getContent(p?: { locale?: Locale } & RequestOptions): Promise<Result<Record<string, unknown>>>;
  getStatus(p: { region: Region } & RequestOptions): Promise<Result<Record<string, unknown>>>;
}

export declare function parseRateLimitHeader(value: string | null): Record<string, RateLimitItem>;

export declare function verifyWebhook(p: {
  secret: string;
  body: string | Uint8Array | ArrayBuffer;
  signature: string;
  timestamp: string | number;
  toleranceSeconds?: number;
  now?: number;
}): Promise<boolean>;

export default UgiApi;
