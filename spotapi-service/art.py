"""Album art finder for Muzak (2026-11-18): one small cached endpoint the iPhone, iPad and Mac ask when Apple's own
cover link is missing or broken (personal-collection albums, songs Apple's lookup doesn't know).

    GET /api/art/find?artist=&album=&title=&id=   → {"url": str|null, "source": "itunes"|"caa"|"spotify"|null, "cached": bool}

Sources, in order:
  1. iTunes Search API (free, no key): lookup by Apple id when given, else an album search by artist + album.
  2. Cover Art Archive via MusicBrainz (free, meant for this): release-group search, then its front cover.
  3. Spotify through this service's own spotapi search (never the paid Web API).
Results are cached in art_cache.db beside this file: found covers for 30 days, misses for 12 hours (so a cover that
appears later is still found). MusicBrainz asks for at most one request a second; a lock keeps us under it.
"""
import json
import re
import sqlite3
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()
DB = Path(__file__).with_name("art_cache.db")
HIT_TTL = 30 * 86400
MISS_TTL = 12 * 3600
UA = "MuzakArtFinder/1.0 (personal music player cover lookup)"
_db_lock = threading.Lock()
_mb_lock = threading.Lock()
_mb_last = [0.0]


def _conn():
    c = sqlite3.connect(DB, timeout=5)
    c.execute("create table if not exists art (k text primary key, url text, source text, at real)")
    return c


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[\(\[].*?[\)\]]", "", s)
    s = re.sub(r"\s+-\s+(single|ep|remaster(ed)?.*|deluxe.*|expanded.*)$", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^(the|a|an) ", "", s)


def _get(url: str, timeout: float = 8.0):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _same(a: str, b: str) -> bool:
    a, b = _norm(a), _norm(b)
    return bool(a) and bool(b) and (a == b or a.startswith(b + " ") or b.startswith(a + " "))


def _artist_ok(want: str, got: str) -> bool:
    if not want:
        return True
    w, g = _norm(want), _norm(got)
    return bool(w) and (w == g or w in g or g in w)


def _itunes(artist: str, album: str, title: str, apple_id: str):
    if apple_id.isdigit():
        j = _get(f"https://itunes.apple.com/lookup?country=ca&id={apple_id}")
        for r in j.get("results", []):
            if r.get("artworkUrl100"):
                return r["artworkUrl100"].replace("100x100bb", "600x600bb")
    if not album and not title:
        return None
    if album:
        q = urllib.parse.quote(f"{artist} {album}".strip())
        j = _get(f"https://itunes.apple.com/search?country=ca&media=music&entity=album&limit=15&term={q}")
        for r in j.get("results", []):
            if _same(r.get("collectionName", ""), album) and _artist_ok(artist, r.get("artistName", "")) and r.get("artworkUrl100"):
                return r["artworkUrl100"].replace("100x100bb", "600x600bb")
    if title:
        q = urllib.parse.quote(f"{artist} {title}".strip())
        j = _get(f"https://itunes.apple.com/search?country=ca&media=music&entity=song&limit=15&term={q}")
        for r in j.get("results", []):
            if _same(r.get("trackName", ""), title) and _artist_ok(artist, r.get("artistName", "")) \
                    and (not album or _same(r.get("collectionName", ""), album)) and r.get("artworkUrl100"):
                return r["artworkUrl100"].replace("100x100bb", "600x600bb")
    return None


def _mb(url: str):
    with _mb_lock:
        wait = 1.1 - (time.time() - _mb_last[0])
        if wait > 0:
            time.sleep(wait)
        _mb_last[0] = time.time()
        return _get(url)


def _caa(artist: str, album: str):
    if not album:
        return None
    q = f'releasegroup:"{album}"' + (f' AND artist:"{artist}"' if artist else "")
    j = _mb("https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=8&query=" + urllib.parse.quote(q))
    for g in j.get("release-groups", []):
        credit = " ".join(a.get("name", "") for a in g.get("artist-credit", []) if isinstance(a, dict))
        if not (_same(g.get("title", ""), album) and _artist_ok(artist, credit)):
            continue
        u = f"https://coverartarchive.org/release-group/{g['id']}/front-500"
        try:
            req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=8) as r:
                if r.status == 200:
                    return u
        except Exception:
            continue
    return None


def _spotify(artist: str, album: str, title: str):
    from main import _search_spotify  # this service's own spotapi search
    if album:
        r = _search_spotify(f"{album} {artist}".strip(), "album", title=album, artist=artist)
        if r.get("url") and r.get("confidence") == "high" and r.get("thumbnail_url"):
            return r["thumbnail_url"].replace("ab67616d00001e02", "ab67616d0000b273")  # 300 px → 640 px copy
    if title:
        r = _search_spotify(f"{title} {artist}".strip(), "track", title=title, artist=artist)
        if r.get("url") and r.get("confidence") == "high" and r.get("thumbnail_url"):
            return r["thumbnail_url"].replace("ab67616d00001e02", "ab67616d0000b273")
    return None


@router.get("/api/art/find")
def find_art(artist: str = "", album: str = "", title: str = "", id: str = ""):
    key = "|".join([_norm(artist), _norm(album) or "t:" + _norm(title), id if id.isdigit() else ""])
    with _db_lock, _conn() as c:
        row = c.execute("select url, source, at from art where k = ?", (key,)).fetchone()
    if row:
        url, source, at = row
        if time.time() - at < (HIT_TTL if url else MISS_TTL):
            return {"url": url, "source": source, "cached": True}
    found, source, errors = None, None, 0
    for name, fn in (("itunes", lambda: _itunes(artist, album, title, id)), ("caa", lambda: _caa(artist, album)),
                     ("spotify", lambda: _spotify(artist, album, title))):
        try:
            found = fn()
        except Exception:
            errors += 1
            found = None
        if found:
            source = name
            break
    if found or errors == 0:   # a source being down is not "no cover": don't cache that as a miss
        with _db_lock, _conn() as c:
            c.execute("insert or replace into art values (?, ?, ?, ?)", (key, found, source, time.time()))
    return {"url": found, "source": source, "cached": False}
