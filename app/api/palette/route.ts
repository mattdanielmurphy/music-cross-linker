import { NextResponse } from 'next/server';
import { getPaletteFromImage } from '@/app/lib/palette';

export async function POST(request: Request) {
  const { imageUrl } = await request.json();

  if (!imageUrl) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  try {
    const palette = getPaletteFromImage(imageUrl);
    return NextResponse.json(palette);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
  }
}
