'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function TypeBadge({ isAlbum, typeHint }: { isAlbum: boolean; typeHint?: 'album' | 'track' | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentType = typeHint || (isAlbum ? 'album' : 'track');
  const nextType = currentType === 'album' ? 'track' : 'album';

  const toggle = () => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set('type', nextType);
    router.push(`?${params.toString()}`);
  };

  return (
    <button
      onClick={toggle}
      title={`Click to toggle: currently ${currentType === 'album' ? 'Album' : 'Track'} Link`}
      className="badge"
      style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
    >
      {isAlbum ? 'Album Link' : 'Track Link'}
    </button>
  );
}
