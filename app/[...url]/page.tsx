import { redirect } from 'next/navigation';
import { fetchOdesliByUrl } from '../lib/odesli';
import { slugify } from '../lib/slugify';

export default async function Page({ params }: { params: Promise<{ url: string[] }> }) {
  const resolvedParams = await params;
  const urlSegments = resolvedParams.url || [];
  
  // Reconstruct full URL if it started with http/https
  let rawUrl = urlSegments.join('/');
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = 'https://' + rawUrl;
  }

  const odesli = await fetchOdesliByUrl(rawUrl);

  if (odesli?.artistName && odesli?.title) {
    const artistSlug = slugify(odesli.artistName);
    const titleSlug = slugify(odesli.title);
    redirect(`/${artistSlug}/${titleSlug}`);
  }

  // Fallback to home if resolution failed
  redirect('/');
}
