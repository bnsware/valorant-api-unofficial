"""ugiapi: official Python client for ugiAPI (https://api.ugilabs.com).

Single file, one dependency (requests). Python 3.8+.

    from ugiapi import UgiApi
    api = UgiApi("YOUR_API_KEY")
    rank = api.get_rank("eu", name="Name", tag="Tag")
    print(rank.data["current_data"]["currenttierpatched"], rank.meta.upstream_cost)
"""
from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, Optional, Union
from urllib.parse import quote

import requests

__version__ = "1.2.0"
__all__ = ["UgiApi", "UgiApiError", "Result", "Meta", "verify_webhook", "parse_ratelimit_header", "REGIONS", "MODES"]

DEFAULT_BASE_URL = "https://api.ugilabs.com"
REGIONS = ("eu", "na", "ap", "kr", "br", "latam")
MODES = ("competitive", "unrated", "swiftplay", "spikerush", "deathmatch", "teamdeathmatch",
         "premier", "escalation", "replication", "snowball", "newmap", "custom")
_RETRYABLE = {"rate_limited", "upstream_rate_limited", "upstream_budget_exceeded", "service_unavailable", "maintenance"}


def _num(v: Optional[str]) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def parse_ratelimit_header(value: Optional[str]) -> Dict[str, Dict[str, Optional[float]]]:
    """Parses an IETF RateLimit / RateLimit-Policy header into {name: {q, w, r, t}}."""
    out: Dict[str, Dict[str, Optional[float]]] = {}
    if not value:
        return out
    for item in value.split(","):
        item = item.strip()
        if not item.startswith('"') or '"' not in item[1:]:
            continue
        name, _, rest = item[1:].partition('"')
        entry = {}
        for kv in rest.split(";"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                entry[k.strip()] = _num(v.strip())
        out[name] = entry
    return out


@dataclass
class Window:
    limit: Optional[float] = None
    remaining: Optional[float] = None
    reset: Optional[float] = None


@dataclass
class Meta:
    status: int
    request_id: Optional[str] = None
    cache: Optional[str] = None
    age: Optional[float] = None
    cache_ttl: Optional[float] = None
    etag: Optional[str] = None
    not_modified: bool = False
    retry_after: Optional[float] = None
    upstream_cost: Optional[float] = None
    rate_limit: Window = field(default_factory=Window)
    daily: Window = field(default_factory=Window)
    upstream: Window = field(default_factory=Window)
    upstream_daily: Window = field(default_factory=Window)
    policy: Dict[str, Dict[str, Optional[float]]] = field(default_factory=dict)
    windows: Dict[str, Dict[str, Optional[float]]] = field(default_factory=dict)
    deprecation: Optional[str] = None

    @classmethod
    def from_response(cls, r: requests.Response) -> "Meta":
        h = r.headers

        def win(prefix: str) -> Window:
            return Window(_num(h.get(prefix + "Limit")), _num(h.get(prefix + "Remaining")), _num(h.get(prefix + "Reset")))

        return cls(
            status=r.status_code,
            request_id=h.get("X-Request-Id"),
            cache=h.get("X-Cache"),
            age=_num(h.get("Age")),
            cache_ttl=_num(h.get("X-Cache-TTL")),
            etag=h.get("ETag"),
            not_modified=r.status_code == 304,
            retry_after=_num(h.get("Retry-After")),
            upstream_cost=_num(h.get("X-Upstream-Cost")),
            rate_limit=win("X-RateLimit-"),
            daily=win("X-RateLimit-Daily-"),
            upstream=win("X-RateLimit-Upstream-"),
            upstream_daily=win("X-RateLimit-Upstream-Daily-"),
            policy=parse_ratelimit_header(h.get("RateLimit-Policy")),
            windows=parse_ratelimit_header(h.get("RateLimit")),
            deprecation=h.get("Deprecation"),
        )


@dataclass
class Result:
    data: Any
    meta: Meta


class UgiApiError(Exception):
    """Raised for every non-2xx response. Branch on `code`, not on the message."""

    def __init__(self, status: int, code: str, message: str, request_id: Optional[str] = None,
                 details: Optional[dict] = None, meta: Optional[Meta] = None):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details
        self.meta = meta

    @property
    def retry_after(self) -> Optional[float]:
        return self.meta.retry_after if self.meta else None


def _q(v: str) -> str:
    return quote(str(v), safe="")


class UgiApi:
    def __init__(self, api_key: Optional[str] = None, base_url: str = DEFAULT_BASE_URL, retries: int = 2,
                 max_retry_wait: float = 60, timeout: float = 15, user_agent: Optional[str] = None,
                 session: Optional[requests.Session] = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.retries = retries
        self.max_retry_wait = max_retry_wait
        self.timeout = timeout
        self.session = session or requests.Session()
        ua = f"ugiapi-python/{__version__}"
        self.user_agent = f"{user_agent} {ua}" if user_agent else ua

    # ------------------------------------------------------------ core
    def request(self, path: str, params: Optional[Dict[str, Any]] = None, etag: Optional[str] = None) -> Result:
        query = {k: v for k, v in (params or {}).items() if v is not None and v != "" and v is not False}
        headers = {"Accept": "application/json", "User-Agent": self.user_agent}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if etag:
            headers["If-None-Match"] = etag
        attempt = 0
        while True:
            r = self.session.get(self.base_url + path, params=query, headers=headers, timeout=self.timeout)
            meta = Meta.from_response(r)
            if r.status_code == 304:
                return Result(None, meta)
            try:
                body = r.json()
            except ValueError:
                body = None
            if r.ok and isinstance(body, dict) and "data" in body:
                return Result(body["data"], meta)
            body = body if isinstance(body, dict) else {}
            err = UgiApiError(r.status_code, body.get("code") or ("invalid_response" if r.ok else "http_error"),
                              body.get("error") or r.text[:200], body.get("request_id") or meta.request_id,
                              body.get("details"), meta)
            wait = meta.retry_after if meta.retry_after is not None else (5 if r.status_code == 503 else None)
            if attempt < self.retries and err.code in _RETRYABLE and wait is not None and wait <= self.max_retry_wait:
                attempt += 1
                time.sleep(max(1, wait))
                continue
            raise err

    @staticmethod
    def _player(route: str, region: str, name: Optional[str], tag: Optional[str], puuid: Optional[str]) -> str:
        if puuid:
            return f"/v1/by-puuid/{route}/{_q(region)}/{_q(puuid)}"
        if not name or not tag:
            raise TypeError(f"{route}: pass either puuid=... or name=... and tag=...")
        return f"/v1/{route}/{_q(region)}/{_q(name)}/{_q(tag)}"

    # ------------------------------------------------------------ account
    def get_account(self, name: Optional[str] = None, tag: Optional[str] = None, *, puuid: Optional[str] = None,
                    region: Optional[str] = None, enrich: bool = True, etag: Optional[str] = None) -> Result:
        """Account by Riot ID (name, tag) or puuid."""
        if puuid:
            path = f"/v1/by-puuid/account/{_q(puuid)}"
        elif name and tag:
            path = f"/v1/account/{_q(name)}/{_q(tag)}"
        else:
            raise TypeError("get_account: pass name and tag, or puuid")
        return self.request(path, {"region": region, "enrich": None if enrich else "false"}, etag)

    # ------------------------------------------------------------ rank
    def get_rank(self, region: str, name: Optional[str] = None, tag: Optional[str] = None, *,
                 puuid: Optional[str] = None, force: bool = False, etag: Optional[str] = None) -> Result:
        """Current rank, all-time peak and per-act summary."""
        return self.request(self._player("rank", region, name, tag, puuid), {"force": "true" if force else None}, etag)

    def get_rank_history(self, region: str, name: Optional[str] = None, tag: Optional[str] = None, *,
                         puuid: Optional[str] = None, size: Optional[int] = None, force: bool = False,
                         etag: Optional[str] = None) -> Result:
        """Recent competitive RR changes (size 1-10)."""
        return self.request(self._player("rank-history", region, name, tag, puuid),
                            {"size": size, "force": "true" if force else None}, etag)

    # ------------------------------------------------------------ matches
    def get_matches(self, region: str, name: Optional[str] = None, tag: Optional[str] = None, *,
                    puuid: Optional[str] = None, size: Optional[int] = None, mode: Optional[str] = None,
                    start: Optional[int] = None, force: bool = False, etag: Optional[str] = None) -> Result:
        """Recent matches. `mode` is applied before `size`; page back with start=pagination['next_start']."""
        return self.request(self._player("matches", region, name, tag, puuid),
                            {"size": size, "mode": mode, "start": start, "force": "true" if force else None}, etag)

    def iter_match_pages(self, region: str, name: Optional[str] = None, tag: Optional[str] = None, *,
                         puuid: Optional[str] = None, size: Optional[int] = None, mode: Optional[str] = None,
                         start: int = 0, max_pages: int = 5) -> Iterator[Result]:
        """Yields match pages following pagination.next_start. Each page costs Riot queries."""
        for _ in range(max_pages):
            page = self.get_matches(region, name, tag, puuid=puuid, size=size, mode=mode, start=start)
            yield page
            nxt = (page.data or {}).get("pagination", {}).get("next_start")
            if nxt is None:
                return
            start = nxt

    def get_stored_matches(self, region: str, name: Optional[str] = None, tag: Optional[str] = None, *,
                           puuid: Optional[str] = None, mode: Optional[str] = None, map: Optional[str] = None,
                           agent: Optional[str] = None, season: Optional[str] = None, size: Optional[int] = None,
                           page: Optional[int] = None, etag: Optional[str] = None) -> Result:
        """Matches kept in the ugiAPI match store, with a summary. No Riot query cost."""
        return self.request(self._player("stored-matches", region, name, tag, puuid),
                            {"mode": mode, "map": map, "agent": agent, "season": season, "size": size, "page": page}, etag)

    def get_match(self, match_id: str, region: Optional[str] = None, etag: Optional[str] = None) -> Result:
        """Full match details. `region` is an optional hint."""
        return self.request(f"/v1/match/{_q(match_id)}", {"region": region}, etag)

    # ------------------------------------------------------------ other
    def get_leaderboard(self, region: str, *, act_id: Optional[str] = None, size: Optional[int] = None,
                        start: Optional[int] = None, search: Optional[str] = None, etag: Optional[str] = None) -> Result:
        return self.request(f"/v1/leaderboard/{_q(region)}", {"actId": act_id, "size": size, "start": start, "search": search}, etag)

    def get_content(self, locale: Optional[str] = None, etag: Optional[str] = None) -> Result:
        return self.request("/v1/content", {"locale": locale}, etag)

    def get_status(self, region: str, etag: Optional[str] = None) -> Result:
        """Service status. No API key needed."""
        return self.request(f"/v1/status/{_q(region)}", None, etag)


def verify_webhook(secret: str, body: Union[bytes, str], signature: Optional[str], timestamp: Union[str, int, None],
                   tolerance_seconds: int = 300, now: Optional[float] = None) -> bool:
    """Verifies an ugiAPI webhook: signature == "sha256=" + HMAC_SHA256(secret, f"{timestamp}.{raw_body}").

    Pass the RAW request body (bytes), not re-encoded JSON.
    """
    if not secret or not signature or timestamp is None:
        return False
    try:
        ts = int(str(timestamp))
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - ts) > tolerance_seconds:
        return False
    raw = body.encode() if isinstance(body, str) else body
    expected = "sha256=" + hmac.new(secret.encode(), str(timestamp).encode() + b"." + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())
