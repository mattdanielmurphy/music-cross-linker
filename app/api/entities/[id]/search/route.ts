import { NextResponse } from 'next/server';
import sql from '@/app/lib/db';
import { searchYouTubeVideos } from '@/app/lib/youtube';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const entityId = resolvedParams.id;
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!platform || !query) {
      return NextResponse.json({ error: 'Missing platform or query' }, { status: 400 });
    }

    const candidates = [];

    if (platform === 'spotify') {
      // Via spotapi-service (see AG_CONTEXT.md) — never the official Spotify
      // Web API, never search-engine scraping. This endpoint returns real
      // title/artist/thumbnail_url straight from Spotify's own search, unlike
      // the old DuckDuckGo scrape which had no reliable artist field.
      const baseUrl = process.env.SPOTAPI_URL;
      if (!baseUrl) {
        console.error('SPOTAPI_URL is not configured; skipping SpotAPI candidate search');
      } else {
        try {
          const params2 = new URLSearchParams({ q: query, limit: String(limit) });
          const searchUrl = `${baseUrl.replace(/\/$/, '')}/api/spotify/search-candidates?${params2.toString()}`;
          const res = await fetch(searchUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
          const data = res.ok ? await res.json() : null;
          const spotifyCandidates = data?.candidates || [];

          if (spotifyCandidates.length > 0) {
            const rows = spotifyCandidates.map((c: any, i: number) => ({
              entity_id: entityId,
              platform: 'spotify',
              candidate_url: c.candidate_url,
              title: c.title,
              artist: c.artist,
              thumbnail_url: c.thumbnail_url,
              rank: i + 1,
              source: 'manual_search',
            }));
            // Single batched multi-row insert instead of one round trip per
            // candidate — with limit=30+ (after a few "Load More" clicks) the
            // old sequential-await loop took several seconds just for DB writes.
            const inserted = await sql`INSERT INTO match_candidates ${sql(rows)} RETURNING *`;
            candidates.push(...inserted);
          }
        } catch (e) {
          console.error('SpotAPI candidate search failed:', e);
        }
      }
    } else if (platform === 'youtube') {
      const youtubeResults = await searchYouTubeVideos(query, limit);
      if (youtubeResults && youtubeResults.length > 0) {
        const rows = youtubeResults.map((v: any, i: number) => ({
          entity_id: entityId,
          platform: 'youtube',
          candidate_url: `https://www.youtube.com/watch?v=${v.id}`,
          title: v.title,
          artist: v.channel,
          thumbnail_url: v.thumbnail,
          rank: i + 1,
          source: 'manual_search',
        }));
        const inserted = await sql`INSERT INTO match_candidates ${sql(rows)} RETURNING *`;
        candidates.push(...inserted);
      }
    } else if (platform === 'apple_music') {
      const itunesSearch = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song,album&limit=${limit}`)
        .then(r => r.json()).catch(() => null);
        
      if (itunesSearch?.results) {
        const rows = itunesSearch.results
          .map((r: any) => ({
            candidateUrl: (r.trackViewUrl || r.collectionViewUrl)?.split('?')[0] || null,
            r,
          }))
          .filter((x: any) => x.candidateUrl)
          .map((x: any, i: number) => ({
            entity_id: entityId,
            platform: 'apple_music',
            candidate_url: x.candidateUrl,
            title: x.r.trackName || x.r.collectionName,
            artist: x.r.artistName,
            thumbnail_url: x.r.artworkUrl100,
            rank: i + 1,
            source: 'manual_search',
          }));

        if (rows.length > 0) {
          const inserted = await sql`INSERT INTO match_candidates ${sql(rows)} RETURNING *`;
          candidates.push(...inserted);
        }
      }
    }

    return NextResponse.json({ success: true, candidates });
  } catch (error) {
    console.error('Error manual searching:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
