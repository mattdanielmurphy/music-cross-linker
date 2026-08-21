'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useDynamicTheme } from './DynamicThemeProvider';

export default function TypeBadge({ isAlbum, typeHint }: { isAlbum: boolean; typeHint?: 'album' | 'track' | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const { reconciledType } = useDynamicTheme();

  const currentType = typeHint || reconciledType || (isAlbum ? 'album' : 'track');
  const nextType = currentType === 'album' ? 'track' : 'album';

  const toggle = () => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set('type', nextType);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  };

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className="badge"
    >
      {isPending ? 'Switching...' : `${currentType === 'album' ? 'Album' : 'Track'} Link`}
      {!isPending && <span className="type-badge-switch-hint">⇄</span>}
    </button>
  );
}
