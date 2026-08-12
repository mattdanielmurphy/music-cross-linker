import { NextResponse } from 'next/server';
import sql from '@/app/lib/db';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const entityId = resolvedParams.id;
    const body = await req.json();
    const { platform, matched_url, candidate_id, verified_by, uncertain } = body;

    if (!platform || !matched_url) {
      return NextResponse.json({ error: 'Missing platform or matched_url' }, { status: 400 });
    }

    await sql`
      INSERT INTO entity_matches (entity_id, platform, matched_url, matched_by, candidate_id, verified_by, verified_at, uncertain)
      VALUES (${entityId}, ${platform}, ${matched_url}, 'manual', ${candidate_id || null}, ${verified_by || null}, now(), ${!!uncertain})
      ON CONFLICT (entity_id, platform) 
      DO UPDATE SET 
        matched_url = EXCLUDED.matched_url,
        matched_by = EXCLUDED.matched_by,
        candidate_id = EXCLUDED.candidate_id,
        verified_by = EXCLUDED.verified_by,
        verified_at = EXCLUDED.verified_at,
        uncertain = EXCLUDED.uncertain,
        updated_at = now()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving manual match:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
