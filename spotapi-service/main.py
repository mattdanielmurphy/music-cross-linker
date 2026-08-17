import re
import time
import logging
import difflib
from itertools import zip_longest
from fastapi import FastAPI

app = FastAPI()
logging.basicConfig(level=logging.INFO)

# In-memory query cache with TTL (1 hour)
_CACHE = {}
_CACHE_TTL = 3600  # seconds
_MAX_CACHE_SIZE = 2000


def _get_cached(key: str) -> dict | None:
    if key in _CACHE:
        val, ts = _CACHE[key]
        if time.time() - ts < _CACHE_TTL:
            return val
        del _CACHE[key]
    return None


def _set_cached(key: str, val: dict):
    if len(_CACHE) >= _MAX_CACHE_SIZE:
        oldest = sorted(_CACHE.keys(), key=lambda k: _CACHE[k][1])[: int(_MAX_CACHE_SIZE * 0.2)]
        for k in oldest:
            _CACHE.pop(k, None)
    _CACHE[key] = (val, time.time())


# Reissue/edition descriptors that shouldn't prevent a title from counting as
# an exact match against the plain title — covers both parenthetical forms
# ("Fragile (Super Deluxe)") and dash-suffixed forms ("Fragile - Remastered"),
# since Spotify uses both conventions depending on the release.
_EDITION_SUFFIX_RE = re.compile(
    r"[\-–—:]\s*\d{0,4}\s*"
    r"(super\s+deluxe|deluxe|remaster(ed)?|anniversary|expanded|special|"
    r"collector'?s|bonus\s+track(s)?|edition|version|reissue)"
    r"[a-z0-9 ]*$",
    re.IGNORECASE,
)


def _normalize(s: str) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"[\(\[\{].*?[\)\]\}]", "", s)  # strip parenthetical/bracketed content
    s = _EDITION_SUFFIX_RE.sub("", s)  # strip dash-suffixed edition descriptors
    s = re.sub(r"(?<=\d)\s*[\-–—]\s*(?=\d)", "-", s)  # preserve hyphenated number ranges e.g. 85-92
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()  # strip punctuation
    s = re.sub(r"^(the|a|an)\s+", "", s)  # strip leading articles
    return s.strip()


def _normalize_with_articles(s: str) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"[\(\[\{].*?[\)\]\}]", "", s)
    s = _EDITION_SUFFIX_RE.sub("", s)
    s = re.sub(r"(?<=\d)\s*[\-–—]\s*(?=\d)", "-", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _extract_id(item: dict) -> str | None:
    data = item.get("data", {}) or {}
    item_id = data.get("id")
    if not item_id:
        uri = data.get("uri", "")
        if uri:
            item_id = uri.split(":")[-1]
    return item_id


def _spotify_artist_names(data: dict) -> list[str]:
    artists = data.get("artists", {}).get("items", []) or []
    return [a.get("profile", {}).get("name", "") for a in artists]


def _extract_thumbnail(data_obj: dict) -> str | None:
    """Pulls a cover art URL out of a track or album item's data blob.
    Tracks nest it under albumOfTrack.coverArt; albums have coverArt directly.
    """
    cover_art = (data_obj.get("albumOfTrack") or {}).get("coverArt") or data_obj.get("coverArt") or {}
    sources = cover_art.get("sources", []) or []
    if not sources:
        return None
    # Prefer a mid-size image (closest to 300px) over the largest/smallest.
    best = min(sources, key=lambda s: abs((s.get("width") or 0) - 300))
    return best.get("url")


def _format_result(best_tier: str, best_item: dict, entity: str) -> dict:
    item_id = _extract_id(best_item)
    if not item_id:
        return {"url": None}
    data_obj = best_item.get("data", {}) or {}
    artist_names = _spotify_artist_names(data_obj)
    return {
        "url": f"https://open.spotify.com/{entity}/{item_id}",
        "confidence": best_tier,
        "title": data_obj.get("name"),
        "artist": ", ".join(artist_names) if artist_names else None,
        "thumbnail_url": _extract_thumbnail(data_obj),
        "entity": entity,
    }


def _classify_match(name_raw: str, artist_names_raw: list[str], norm_title: str, norm_artist: str) -> tuple[str, float]:
    name = _normalize(name_raw)
    artist_names = [_normalize(a) for a in artist_names_raw]

    title_exact = bool(norm_title) and name == norm_title
    title_is_single_word = bool(norm_title) and len(norm_title.split()) == 1

    title_word_match = False
    if norm_title and not title_is_single_word:
        pattern = re.compile(rf"\b{re.escape(norm_title)}\b")
        title_word_match = bool(pattern.search(name))

    artist_match = False
    if norm_artist:
        artist_match = norm_artist in artist_names or any(
            norm_artist in a or a in norm_artist for a in artist_names
        )
    artist_unknown = not norm_artist

    similarity = difflib.SequenceMatcher(
        None, f"{norm_artist} {norm_title}".strip(), f"{name} {' '.join(artist_names)}".strip()
    ).ratio()

    # Exact match bonus if the leading article also matches verbatim
    article_bonus = 0.0
    if title_exact:
        if _normalize_with_articles(name_raw) == _normalize_with_articles(norm_title):
            article_bonus = 2.0

    edition_penalty = min(len(name_raw) - len(name), 60) * 0.05

    if title_exact and (artist_match or artist_unknown):
        return "high", 100 + article_bonus + similarity * 10 - edition_penalty
    if (title_exact or title_word_match) and artist_match:
        return "low", 50 + article_bonus + similarity * 10 - edition_penalty
    if title_exact and not artist_unknown and not artist_match:
        return "low", 40 + article_bonus + similarity * 10 - edition_penalty
    if artist_match and similarity > 0.35:
        return "low", 20 + similarity * 10 - edition_penalty

    return "none", 0


def _search_spotify(q: str, entity: str, title: str = "", artist: str = "") -> dict:
    """entity is either 'track' or 'album'. Never returns the other type."""
    cache_key = f"typed:{entity}:{q.lower().strip()}:{title.lower().strip()}:{artist.lower().strip()}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    norm_title = _normalize(title)
    norm_artist = _normalize(artist)

    def _fetch_items(query: str, limit: int) -> list:
        s = Song(client=client)
        data = s.query_songs(query, limit=limit)
        if entity == "album":
            return data.get("data", {}).get("searchV2", {}).get("albumsV2", {}).get("items", []) or []
        return data.get("data", {}).get("searchV2", {}).get("tracksV2", {}).get("items", []) or []

    def _classify_items(items: list) -> list:
        out = []
        for it in items:
            item = it.get("item", {}) or it.get("itemV2", {}) or it
            data_obj = item.get("data", {}) or {}
            tier, score = _classify_match(
                data_obj.get("name", ""), _spotify_artist_names(data_obj), norm_title, norm_artist
            )
            if tier == "none":
                continue
            out.append((tier, score, item))
        return out

    try:
        from spotapi.song import Song
        from spotapi.public import client_pool

        client = client_pool.get()
        try:
            candidates = _classify_items(_fetch_items(q, limit=25))

            has_high = any(c[0] == "high" for c in candidates)
            if not has_high and title and _normalize(title) and title.strip().lower() != q.strip().lower():
                extra = _classify_items(_fetch_items(title, limit=25))
                seen_ids = {_extract_id(c[2]) for c in candidates}
                for c in extra:
                    if _extract_id(c[2]) not in seen_ids:
                        candidates.append(c)

            if not candidates:
                res = {"url": None}
                _set_cached(cache_key, res)
                return res

            candidates.sort(key=lambda c: (c[0] == "high", c[1]), reverse=True)
            best_tier, _, best_item = candidates[0]
            res = _format_result(best_tier, best_item, entity)
            _set_cached(cache_key, res)
            return res
        finally:
            client_pool.put(client)
    except Exception as e:
        logging.error(f"Error searching spotapi ({entity}): {e}")

    return {"url": None}


def _search_spotify_unified(q: str, is_album: bool = False, title: str = "", artist: str = "") -> dict:
    """Unified search: queries Spotify GraphQL once, evaluating both tracks and albums
    simultaneously in a single round trip with in-memory caching.
    """
    cache_key = f"unified:{is_album}:{q.lower().strip()}:{title.lower().strip()}:{artist.lower().strip()}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    norm_title = _normalize(title)
    norm_artist = _normalize(artist)

    def _classify_list(items: list, entity: str) -> list:
        out = []
        for it in items:
            item = it.get("item", {}) or it.get("itemV2", {}) or it
            data_obj = item.get("data", {}) or {}
            tier, score = _classify_match(
                data_obj.get("name", ""), _spotify_artist_names(data_obj), norm_title, norm_artist
            )
            if tier == "none":
                continue
            # Prefer guessed entity type slightly on score ties
            type_bonus = 3.0 if (entity == "album" if is_album else entity == "track") else 0.0
            out.append((tier, score + type_bonus, item, entity))
        return out

    try:
        from spotapi.song import Song
        from spotapi.public import client_pool

        client = client_pool.get()
        try:
            s = Song(client=client)
            data = s.query_songs(q, limit=25)
            search_v2 = data.get("data", {}).get("searchV2", {}) or {}
            track_items = search_v2.get("tracksV2", {}).get("items", []) or []
            album_items = search_v2.get("albumsV2", {}).get("items", []) or []

            candidates = _classify_list(track_items, "track") + _classify_list(album_items, "album")

            has_high = any(c[0] == "high" for c in candidates)
            if not has_high and title and _normalize(title) and title.strip().lower() != q.strip().lower():
                data_title = s.query_songs(title, limit=25)
                search_v2_t = data_title.get("data", {}).get("searchV2", {}) or {}
                track_items_t = search_v2_t.get("tracksV2", {}).get("items", []) or []
                album_items_t = search_v2_t.get("albumsV2", {}).get("items", []) or []
                extra = _classify_list(track_items_t, "track") + _classify_list(album_items_t, "album")
                seen_ids = {_extract_id(c[2]) for c in candidates}
                for c in extra:
                    if _extract_id(c[2]) not in seen_ids:
                        candidates.append(c)

            if not candidates:
                res = {"url": None}
                _set_cached(cache_key, res)
                return res

            candidates.sort(key=lambda c: (c[0] == "high", c[1]), reverse=True)
            best_tier, _, best_item, best_entity = candidates[0]
            res = _format_result(best_tier, best_item, best_entity)
            _set_cached(cache_key, res)
            return res
        finally:
            client_pool.put(client)
    except Exception as e:
        logging.error(f"Error searching spotapi (unified): {e}")

    return {"url": None}


@app.get("/api/spotify/search")
def search_spotify_unified_endpoint(q: str, is_album: bool = False, title: str = "", artist: str = ""):
    """Unified single-trip Spotify search evaluating both tracks and albums."""
    return _search_spotify_unified(q, is_album=is_album, title=title, artist=artist)


@app.get("/api/spotify/search-track")
def search_spotify_track(q: str, title: str = "", artist: str = ""):
    """Search Spotify for a track match only. Never returns an album."""
    return _search_spotify(q, "track", title=title, artist=artist)


@app.get("/api/spotify/search-album")
def search_spotify_album(q: str, title: str = "", artist: str = ""):
    """Search Spotify for an album match only. Never returns a track."""
    return _search_spotify(q, "album", title=title, artist=artist)


def _item_to_candidate(item: dict, entity: str) -> dict | None:
    data_obj = item.get("data", {}) or {}
    item_id = _extract_id(item)
    if not item_id:
        return None
    artist_names = _spotify_artist_names(data_obj)
    return {
        "platform": "spotify",
        "candidate_url": f"https://open.spotify.com/{entity}/{item_id}",
        "title": data_obj.get("name"),
        "artist": ", ".join(artist_names) if artist_names else None,
        "thumbnail_url": _extract_thumbnail(data_obj),
    }


@app.get("/api/spotify/search-candidates")
def search_spotify_candidates(q: str, limit: int = 10):
    """Returns a flat list of Spotify track + album candidates for manual re-search."""
    cache_key = f"candidates:{q.lower().strip()}:{limit}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    try:
        from spotapi.song import Song
        from spotapi.public import client_pool

        client = client_pool.get()
        try:
            s = Song(client=client)
            data = s.query_songs(q, limit=limit)
            search_v2 = data.get("data", {}).get("searchV2", {}) or {}
            track_items = search_v2.get("tracksV2", {}).get("items", []) or []
            album_items = search_v2.get("albumsV2", {}).get("items", []) or []

            candidates = []
            for t_it, a_it in zip_longest(track_items, album_items):
                if t_it is not None:
                    t_item = t_it.get("item", {}) or t_it.get("itemV2", {}) or t_it
                    c = _item_to_candidate(t_item, "track")
                    if c:
                        candidates.append(c)
                if a_it is not None:
                    a_item = a_it.get("item", {}) or a_it.get("itemV2", {}) or a_it
                    c = _item_to_candidate(a_item, "album")
                    if c:
                        candidates.append(c)

            res = {"success": True, "candidates": candidates[:limit]}
            _set_cached(cache_key, res)
            return res
        finally:
            client_pool.put(client)
    except Exception as e:
        logging.error(f"Error listing spotapi candidates: {e}")
        return {"success": False, "candidates": []}


@app.get("/api/spotify/health")
def health_spotify():
    return {"status": "ok"}
