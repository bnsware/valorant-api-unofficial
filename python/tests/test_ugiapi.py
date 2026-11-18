"""Offline tests: python -m pytest python/tests   (or: python python/tests/test_ugiapi.py)
Live smoke test: UGIAPI_KEY=your_key python python/tests/test_ugiapi.py --live
"""
import hashlib
import hmac
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import requests  # noqa: E402

from ugiapi import UgiApi, UgiApiError, parse_ratelimit_header, verify_webhook  # noqa: E402


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append((url, params, headers))
        status, body, hdrs = self.responses.pop(0)
        r = requests.Response()
        r.status_code = status
        r._content = b"" if body is None else json.dumps(body).encode()
        r.headers.update(hdrs or {})
        return r


def test_paths_and_meta():
    s = FakeSession([(200, {"status": 200, "data": {"ok": 1}}, {"X-Upstream-Cost": "2", "X-Cache": "MISS", "X-RateLimit-Remaining": "29"})])
    api = UgiApi("KEY", session=s)
    res = api.get_matches("eu", "Some Name", "0001", size=5, mode="competitive")
    assert res.data == {"ok": 1}
    url, params, headers = s.calls[0]
    assert url == "https://api.ugilabs.com/v1/matches/eu/Some%20Name/0001"
    assert params == {"size": 5, "mode": "competitive"}
    assert headers["Authorization"] == "Bearer KEY"
    assert res.meta.upstream_cost == 2 and res.meta.cache == "MISS" and res.meta.rate_limit.remaining == 29


def test_by_puuid():
    s = FakeSession([(200, {"status": 200, "data": {}}, {})])
    UgiApi("K", session=s).get_stored_matches("na", puuid="abc", map="Ascent", page=2)
    assert s.calls[0][0] == "https://api.ugilabs.com/v1/by-puuid/stored-matches/na/abc"
    assert s.calls[0][1] == {"map": "Ascent", "page": 2}


def test_error():
    s = FakeSession([(404, {"status": 404, "error": "Player not found", "code": "player_not_found", "request_id": "r1"}, {})])
    try:
        UgiApi("K", session=s).get_account("x", "y")
        raise AssertionError("expected error")
    except UgiApiError as e:
        assert e.code == "player_not_found" and e.status == 404 and e.request_id == "r1"


def test_retry_then_success():
    s = FakeSession([
        (429, {"status": 429, "error": "slow", "code": "rate_limited", "request_id": "a"}, {"Retry-After": "1"}),
        (200, {"status": 200, "data": {"ok": True}}, {}),
    ])
    assert UgiApi("K", session=s).get_status("eu").data == {"ok": True}
    assert len(s.calls) == 2


def test_no_retry_daily_quota():
    s = FakeSession([(429, {"status": 429, "error": "q", "code": "daily_quota_exceeded", "request_id": "b"}, {"Retry-After": "1"})])
    try:
        UgiApi("K", session=s).get_status("eu")
        raise AssertionError("expected error")
    except UgiApiError as e:
        assert e.code == "daily_quota_exceeded"
    assert len(s.calls) == 1


def test_not_modified():
    s = FakeSession([(304, None, {})])
    res = UgiApi("K", session=s).get_content(etag='"abc"')
    assert res.data is None and res.meta.not_modified
    assert s.calls[0][2]["If-None-Match"] == '"abc"'


def test_pages():
    page = lambda n: (200, {"status": 200, "data": {"pagination": {"next_start": n}, "matches": []}}, {})
    s = FakeSession([page(5), page(10), page(None)])
    assert len(list(UgiApi("K", session=s).iter_match_pages("eu", puuid="p", size=5, max_pages=10))) == 3
    assert s.calls[2][1]["start"] == 10


def test_ratelimit_header():
    p = parse_ratelimit_header('"minute";r=29;t=41, "riot-day";r=399;t=8000')
    assert p["minute"] == {"r": 29, "t": 41} and p["riot-day"]["r"] == 399


def test_webhook():
    secret = "whsec_" + "ab" * 24
    body = b'{"event":"webhook.test"}'
    ts = int(time.time())
    sig = "sha256=" + hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    assert verify_webhook(secret, body, sig, ts)
    assert verify_webhook(secret, body.decode(), sig, str(ts))
    assert not verify_webhook(secret, body + b" ", sig, ts)
    assert not verify_webhook(secret, body, sig, ts - 3600)


def live():
    key = os.environ.get("UGIAPI_KEY")
    if not key:
        raise SystemExit("Set UGIAPI_KEY to run the live smoke test.")
    api = UgiApi(key)
    assert UgiApi().get_status("eu").meta.status == 200
    puuid = api.get_leaderboard("eu", size=1).data["players"][0]["puuid"]
    assert isinstance(api.get_rank("eu", puuid=puuid).data["current_data"]["currenttier"], int)
    assert isinstance(api.get_rank_history("eu", puuid=puuid, size=1).data["history"], list)
    assert api.get_matches("eu", puuid=puuid, size=1, mode="competitive").data["mode"] == "competitive"
    stored = api.get_stored_matches("eu", puuid=puuid, size=1)
    assert isinstance(stored.data["summary"]["matches"], int) and stored.meta.policy
    try:
        api.get_matches("eu", "a", "b", mode="nope")
        raise AssertionError("expected invalid_mode")
    except UgiApiError as e:
        assert e.code == "invalid_mode"
    print("ok - live smoke test")


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
            print(f"ok - {name}")
    if "--live" in sys.argv:
        live()
    print(f"\n{n} offline tests passed")
