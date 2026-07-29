import { fetchOdesliByUrl } from '../lib/odesli';
...
  let artist = '';
  let title = '';
  let type: 'track' | 'album' = 'track';

  const odesliData = await fetchOdesliByUrl(url);
  if (odesliData?.artistName && odesliData?.title) {
    artist = odesliData.artistName;
    title = odesliData.title;
  } else {
    try {
      if (url.includes('music.apple.com')) {
        // ... rest of the original logic
      } else if (url.includes('open.spotify.com')) {
        // ...
      }
    } catch (e) {
      console.error(e);
    }
  }


  if (artist && title) {
    const redirectPath = `/${slugify(artist)}/${slugify(title)}?type=${type}`;
    console.log('[RESOLVER REDIRECT]', redirectPath);
    redirect(redirectPath);
  }
  return <div>Could not resolve track. URL: {url}</div>;
}
