'use client';
import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { COUNTRIES } from '../lib/geo';
import { IconBrandSpotify, IconBrandApple, IconBrandYoutube, IconWorld, IconChevronDown, IconX, IconSearch } from '@tabler/icons-react';

export default function LinkButtons({ appleUrl, spotifyUrl, youtubeUrl, country }: any) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const currentCountry = useMemo(() => COUNTRIES.find(c => c.code === country) || COUNTRIES[0], [country]);

  const changeCountry = (code: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('country', code);
    router.push(`${pathname}?${params.toString()}`);
    setIsOpen(false);
  };

  const filteredCountries = useMemo(() => 
    COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <div className="link-button-wrapper">
      <div className="region-banner" onClick={() => setIsOpen(true)}>
        <IconWorld size={18} />
        <span>Region: {currentCountry.flag} {currentCountry.name}</span>
        <IconChevronDown size={16} />
      </div>

      <div className="btn-link-grid">
        <a href={spotifyUrl} className="btn-link spotify" target="_blank" rel="noopener noreferrer">
          <IconBrandSpotify size={24} />
          <span>Spotify</span>
        </a>
        <a href={appleUrl} className="btn-link apple" target="_blank" rel="noopener noreferrer">
          <IconBrandApple size={24} />
          <span>Apple Music</span>
        </a>
        <a href={youtubeUrl} className="btn-link youtube" target="_blank" rel="noopener noreferrer">
          <IconBrandYoutube size={24} />
          <span>YouTube</span>
        </a>
      </div>

      {isOpen && (
        <div className="country-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div className="country-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Region</h3>
              <button onClick={() => setIsOpen(false)}><IconX /></button>
            </div>
            <div className="search-wrapper">
              <IconSearch size={18} />
              <input 
                type="text" 
                placeholder="Search countries..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="country-search-input"
              />
            </div>
            <div className="country-grid">
              {filteredCountries.map(c => (
                <button key={c.code} className="country-option" onClick={() => changeCountry(c.code)}>
                  {c.flag} {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
