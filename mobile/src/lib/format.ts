import type { TFunction } from 'i18next';

/** 150000 -> "1,50,000" (Nepali/Indian digit grouping). */
export function formatRs(amount: number): string {
  const s = Math.round(amount).toString();
  if (s.length <= 3) return `Rs ${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `Rs ${rest},${last3}`;
}

export function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

export type Freshness = 'fresh' | 'ok' | 'stale';

/** How recently the owner confirmed the room is still available. */
export function freshness(confirmedAt: string | null, t: TFunction): { level: Freshness; label: string } {
  if (!confirmedAt) return { level: 'stale', label: t('fresh.never') };
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(confirmedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let ago: string;
  if (minutes < 60) ago = t('time.minutes', { count: Math.max(minutes, 1) });
  else if (hours < 24) ago = t('time.hours', { count: hours });
  else ago = t('time.days', { count: days });

  const level: Freshness = hours < 24 ? 'fresh' : hours < 48 ? 'ok' : 'stale';
  return { level, label: t('fresh.confirmed', { ago }) };
}
