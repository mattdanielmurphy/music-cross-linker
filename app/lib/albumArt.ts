export interface AlbumArtOptions {
  appleMusicUrl?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
}

export function getBestAlbumArt(options: AlbumArtOptions): string | null {
  // 1. Apple Music: Attempt to get 1000x1000
  if (options.appleMusicUrl) {
    return options.appleMusicUrl.replace('{w}x{h}bb', '1000x1000bb');
  }

  // 2. Spotify: Usually provides a list of images
  if (options.spotifyUrl) {
    return options.spotifyUrl;
  }

  // 3. YouTube: Fallback
  if (options.youtubeUrl) {
    return options.youtubeUrl;
  }

  return null;
}
