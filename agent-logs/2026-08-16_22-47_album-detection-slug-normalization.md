# Album Detection & Slug Normalization - 2026-08-16

Resolved 5 key issues to improve album vs track resolution and metadata accuracy:

1. **Track vs Album heuristics and patterns**: Refined detection logic to better distinguish between track and album contexts.
2. **Explicit route and query parameter typeHint**: Added support for `?type=album`/`?type=track` query parameters and `/album/`/`/track/` route prefixes to override auto-detection.
3. **Dynamic type promotion**: Implemented logic to promote metadata type based on verified Apple Music/Spotify candidate data.
4. **Slug de-hyphenation in `formatSlug`**: Updated `formatSlug` to correctly handle hyphenated titles (e.g., *Alive 2007*).
5. **Canonical title and artist metadata binding**: Ensured canonical title and artist metadata are correctly bound from `match_candidates` to the H1 element.
