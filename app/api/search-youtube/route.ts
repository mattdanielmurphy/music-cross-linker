import { NextResponse } from 'next/server';
import { searchYouTubeVideos } from '../../lib/youtube';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const results = await searchYouTubeVideos(q);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[YOUTUBE SEARCH API ERROR]', error);
    return NextResponse.json({ error: 'Failed to search YouTube' }, { status: 500 });
  }
}
