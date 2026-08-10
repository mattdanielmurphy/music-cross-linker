export const COUNTRIES = [
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
];

export const getCountryFlagEmoji = (code: string): string => {
  const country = COUNTRIES.find((c) => c.code === code.toUpperCase());
  return country?.flag || '🌐';
};

export const getCountryInfo = (code?: string) => {
  const country = COUNTRIES.find((c) => c.code === code?.toUpperCase());
  return country || { code: 'CA', name: 'Canada', flag: '🇨🇦' };
};

export async function detectCountryFromHeaders(headersList: Headers): Promise<string> {
  const keys = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code', 'x-real-ip', 'x-forwarded-for'];
  
  for (const key of keys) {
    const value = headersList.get(key);
    if (value && value.length === 2) return value.toUpperCase();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const response = await fetch('http://ip-api.com/json/', { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();
    return data.countryCode || 'CA';
  } catch {
    return 'CA';
  }
}
