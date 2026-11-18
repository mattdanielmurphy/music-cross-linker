"""Album art finder for Muzak (2026-11-18): one small cached endpoint the iPhone, iPad and Mac ask when Apple's own
cover link is missing or broken (personal-collection albums, songs Apple's lookup doesn't know).

    GET /api/art/find?artist=&album=&title=&id=&year=&tracks=
        → {"url": str|null, "source": "itunes"|"caa"|"spotify"|null, "cached": bool}

A cover is only accepted when the artist agrees too (2026-11-18: a For you card with no artist got another band's
"Pink Moon" instead of Nick Drake's). The artist match is fuzzy (case, accents, "The", "&"/"and", one credit inside a
longer one, small typos) but it has to agree; with no artist there is no search at all, only Apple's lookup by id.
Year and track count, when given, break ties between matching editions. Not confident → null, and the apps draw
the placeholder: a wrong cover is worse than none.

Sources, in order:
  1. iTunes Search API (free, no key): lookup by Apple id when given, else an album search by artist + album.
  2. Cover Art Archive via MusicBrainz (free, meant for this): release-group search, then its front cover.
  3. Spotify through this service's own spotapi search (never the paid Web API).
Results are cached in art_cache.db beside this file: found covers for 30 days, misses for 12 hours (so a cover that
appears later is still found). MusicBrainz asks for at most one request a second; a lock keeps us under it.
"""
import difflib
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
    cols = {r[1] for r in c.execute("pragma table_info(art)")}
    for col in ("got_artist", "got_album"):   # what the cover belongs to, so a later rule change can re-check it
        if col not in cols:
            c.execute(f"alter table art add column {col} text")
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


_FILLER = {"and", "feat", "featuring", "ft", "with", "the", "x"}


def _name_tokens(s: str) -> list:
    """Artist name as words: accents dropped, any script kept (so non-Latin names still compare)."""
    s = "".join(ch for ch in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(ch)).casefold()
    s = re.sub(r"[\(\[].*?[\)\]]", " ", s)
    return [t for t in re.findall(r"\w+", s) if t not in _FILLER]


def _artist_ok(want: str, got: str) -> bool:
    """Fuzzy, but the artist has to agree. Never true when either side is empty."""
    w, g = _name_tokens(want), _name_tokens(got)
    if not w or not g:
        return False
    ws, gs = " ".join(w), " ".join(g)
    if ws == gs:
        return True
    # One credit inside a longer one, on word boundaries ("Nick Drake" in "Nick Drake & John Martyn").
    if f" {ws} " in f" {gs} " or f" {gs} " in f" {ws} ":
        return True
    return difflib.SequenceMatcher(None, ws, gs).ratio() >= 0.85   # small typos ("Beatels")


def _year_of(s) -> int:
    m = re.match(r"(\d{4})", str(s or ""))
    return int(m.group(1)) if m else 0


def _pick(cands: list, year: int, tracks: int, artist: str = ""):
    """cands = [(url, got_artist, got_album, year, tracks)], already matching on artist and title. The artist's own
    credit beats a shared one ("Nick Drake" over "AURORA & Nick Drake"); then year and track count break ties;
    otherwise the search's own order stands."""
    if not cands:
        return None
    want = " ".join(_name_tokens(artist))
    def score(c):
        sc = 4 if want and " ".join(_name_tokens(c[1])) == want else 0
        if year and c[3]:
            sc += 2 if abs(c[3] - year) <= 1 else -1
        if tracks and c[4]:
            sc += 1 if c[4] == tracks else 0
        return sc
    return max(enumerate(cands), key=lambda ic: (score(ic[1]), -ic[0]))[1]


def _big(u: str) -> str:
    return u.replace("100x100bb", "600x600bb")


def _itunes(artist: str, album: str, title: str, apple_id: str, year: int = 0, tracks: int = 0):
    if apple_id.isdigit():   # Apple's own id: exact, no guessing
        j = _get(f"https://itunes.apple.com/lookup?country=ca&id={apple_id}")
        for r in j.get("results", []):
            if r.get("artworkUrl100"):
                return _big(r["artworkUrl100"]), r.get("artistName", ""), r.get("collectionName", "")
    if not artist or (not album and not title):
        return None
    if album:
        q = urllib.parse.quote(f"{artist} {album}")
        j = _get(f"https://itunes.apple.com/search?country=ca&media=music&entity=album&limit=15&term={q}")
        got = _pick([(_big(r["artworkUrl100"]), r.get("artistName", ""), r.get("collectionName", ""),
                      _year_of(r.get("releaseDate")), r.get("trackCount") or 0)
                     for r in j.get("results", [])
                     if r.get("artworkUrl100") and _same(r.get("collectionName", ""), album)
                     and _artist_ok(artist, r.get("artistName", ""))], year, tracks, artist)
        if got:
            return got[:3]
    if title:
        q = urllib.parse.quote(f"{artist} {title}")
        j = _get(f"https://itunes.apple.com/search?country=ca&media=music&entity=song&limit=15&term={q}")
        got = _pick([(_big(r["artworkUrl100"]), r.get("artistName", ""), r.get("collectionName", ""),
                      _year_of(r.get("releaseDate")), r.get("trackCount") or 0)
                     for r in j.get("results", [])
                     if r.get("artworkUrl100") and _same(r.get("trackName", ""), title)
                     and _artist_ok(artist, r.get("artistName", ""))
                     and (not album or _same(r.get("collectionName", ""), album))], year, tracks, artist)
        if got:
            return got[:3]
    return None


def _mb(url: str):
    with _mb_lock:
        wait = 1.1 - (time.time() - _mb_last[0])
        if wait > 0:
            time.sleep(wait)
        _mb_last[0] = time.time()
        return _get(url)


def _caa(artist: str, album: str, year: int = 0):
    if not artist or not album:
        return None
    q = f'releasegroup:"{album}" AND artist:"{artist}"'
    j = _mb("https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=8&query=" + urllib.parse.quote(q))
    cands = []
    for g in j.get("release-groups", []):
        credit = " ".join(a.get("name", "") for a in g.get("artist-credit", []) if isinstance(a, dict))
        if _same(g.get("title", ""), album) and _artist_ok(artist, credit):
            cands.append((g["id"], credit, g.get("title", ""), _year_of(g.get("first-release-date")), 0))
    while cands:
        best = _pick(cands, year, 0, artist)
        cands.remove(best)
        u = f"https://coverartarchive.org/release-group/{best[0]}/front-500"
        try:
            req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=8) as r:
                if r.status == 200:
                    return u, best[1], best[2]
        except Exception:
            continue
    return None


def _spotify(artist: str, album: str, title: str):
    from main import _search_spotify  # this service's own spotapi search
    if not artist:
        return None
    for q, entity, want in ((album, "album", album), (title, "track", title)):
        if not q:
            continue
        r = _search_spotify(f"{q} {artist}", entity, title=want, artist=artist)
        if r.get("url") and r.get("confidence") == "high" and r.get("thumbnail_url") \
                and _artist_ok(artist, r.get("artist") or ""):
            return r["thumbnail_url"].replace("ab67616d00001e02", "ab67616d0000b273"), r.get("artist") or "", r.get("title") or ""   # 300 px → 640 px copy
    return None


def _key(artist: str, album: str, title: str, id: str) -> str:
    return "|".join([_norm(artist), _norm(album) or "t:" + _norm(title), id if id.isdigit() else ""])


def lookup(artist: str = "", album: str = "", title: str = "", id: str = "", year: int = 0, tracks: int = 0):
    """The uncached search: (url, source, got_artist, got_album, errors)."""
    errors = 0
    for name, fn in (("itunes", lambda: _itunes(artist, album, title, id, year, tracks)),
                     ("caa", lambda: _caa(artist, album, year)),
                     ("spotify", lambda: _spotify(artist, album, title))):
        try:
            got = fn()
        except Exception:
            errors += 1
            got = None
        if got:
            return got[0], name, got[1], got[2], errors
    return None, None, None, None, errors


@router.get("/api/art/find")
def find_art(artist: str = "", album: str = "", title: str = "", id: str = "", year: str = "", tracks: str = ""):
    artist, album, title = artist.strip(), album.strip(), title.strip()
    if not _name_tokens(artist) and not id.isdigit():
        return {"url": None, "source": None, "cached": False, "reason": "no artist"}   # never guess from a title alone
    key = _key(artist, album, title, id)
    with _db_lock, _conn() as c:
        row = c.execute("select url, source, at from art where k = ?", (key,)).fetchone()
    if row:
        url, source, at = row
        if time.time() - at < (HIT_TTL if url else MISS_TTL):
            return {"url": url, "source": source, "cached": True}
    found, source, got_artist, got_album, errors = lookup(artist, album, title, id, _year_of(year),
                                                          int(tracks) if tracks.isdigit() else 0)
    if found or errors == 0:   # a source being down is not "no cover": don't cache that as a miss
        with _db_lock, _conn() as c:
            c.execute("insert or replace into art (k, url, source, at, got_artist, got_album) values (?, ?, ?, ?, ?, ?)",
                      (key, found, source, time.time(), got_artist, got_album))
    return {"url": found, "source": source, "cached": False}
