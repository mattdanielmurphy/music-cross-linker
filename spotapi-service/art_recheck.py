"""Re-check every cover art.py has cached against its current matching rule (2026-11-18, after the wrong "Pink Moon").

    venv/bin/python art_recheck.py [--dry]      → art_recheck.json beside this file, one line per row on stdout

Each cached cover is looked up again with the same artist / album / title / id it was cached under:
  - no artist and no Apple id: a title-only guess, which the rule no longer allows → removed;
  - the lookup now finds nothing (and no source failed): the old cover failed the rule → removed;
  - the lookup finds a different cover: the old one is replaced (counted separately: often just another edition);
  - same cover: kept, now with the artist and album it belongs to;
  - a source failed: left as it was, counted as unchecked.
Misses (no cover) for queries with no artist are removed too; other misses expire on their own in 12 hours.
iTunes allows about 20 searches a minute, so rows are spaced 3.5 s apart.
"""
import json
import sys
import time

import art

DRY = "--dry" in sys.argv


def main():
    with art._conn() as c:
        rows = c.execute("select k, url, source from art").fetchall()
    out = {"rows": len(rows), "title_only": [], "failed_rule": [], "changed": [], "kept": 0, "unchecked": [],
           "empty_misses": 0}
    gone, put = [], []
    for n, (k, url, source) in enumerate(rows):
        a, b, i = (k.split("|") + ["", "", ""])[:3]
        album, title = ("", b[2:]) if b.startswith("t:") else (b, "")
        if not url:
            if not a and not i:
                out["empty_misses"] += 1
                gone.append(k)
            continue
        if not a and not i:
            out["title_only"].append({"k": k, "old": url, "source": source})
            gone.append(k)
            print(f"{n} title-only  {k}", flush=True)
            continue
        new, src, got_a, got_b, errors = art.lookup(a, album, title, i)
        time.sleep(3.5)
        if new == url:
            out["kept"] += 1
            put.append((k, url, source, got_a, got_b))
            line = "kept"
        elif new:
            out["changed"].append({"k": k, "old": url, "new": new, "source": src, "got": [got_a, got_b]})
            put.append((k, new, src, got_a, got_b))
            line = "changed"
        elif errors:
            out["unchecked"].append(k)
            line = "unchecked"
        else:
            out["failed_rule"].append({"k": k, "old": url, "source": source})
            gone.append(k)
            line = "failed-rule"
        print(f"{n} {line:11} {k}", flush=True)
    if not DRY:
        with art._db_lock, art._conn() as c:
            c.executemany("delete from art where k = ?", [(k,) for k in gone])
            c.executemany("update art set url = ?, source = ?, at = ?, got_artist = ?, got_album = ? where k = ?",
                          [(u, s, time.time(), ga, gb, k) for k, u, s, ga, gb in put])
    out["removed"] = len(gone)
    out["dry"] = DRY
    art.DB.with_name("art_recheck.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in out.items()}), flush=True)


if __name__ == "__main__":
    main()
