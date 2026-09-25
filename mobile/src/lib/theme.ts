// GharKhoji design tokens. Change colours/spacing here and the whole app follows.
import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  // Brand
  primary: '#0B7A68', // teal — trust, calm
  primaryDark: '#065F52',
  primaryDeep: '#044A40',
  primarySoft: '#E3F4F0',
  primaryTint: '#B8E4DA',
  accent: '#FF7A59', // warm coral — the "door" in our logo
  accentSoft: '#FFEDE7',
  // Neutrals
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#0B1220',
  textSecondary: '#475467',
  textMuted: '#8A94A6',
  border: '#E6E9EF',
  borderStrong: '#D0D5DD',
  overlay: 'rgba(11,18,32,0.55)',
  // Status
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  fresh: '#12A150',
  freshBg: '#E3F7EA',
  ok: '#C27803',
  okBg: '#FFF4D6',
  stale: '#667085',
  staleBg: '#F2F4F7',
  agent: '#E8590C',
  agentBg: '#FFEDE0',
  owner: '#0B7A68',
  ownerBg: '#E3F4F0',
};

export const gradients = {
  brand: ['#12967F', '#065F52'] as const,
  hero: ['#0E8A75', '#044A40'] as const,
  // Area tiles rotate through these
  tiles: [
    ['#12967F', '#0B5F53'],
    ['#FF8A65', '#E8590C'],
    ['#5B8DEF', '#3558C4'],
    ['#A77BF3', '#6F42C1'],
    ['#F5B83D', '#D48806'],
    ['#29B6C9', '#127E8F'],
  ] as const,
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 };

export const font = {
  hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6 },
  h1: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, fontWeight: '600' as const },
  tiny: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.3 },
};

/** Soft, modern elevation that looks right on both iOS and Android. */
export function shadow(level: 1 | 2 | 3 = 1): ViewStyle {
  const [y, blur, opacity, elevation] = { 1: [2, 8, 0.06, 2], 2: [6, 16, 0.1, 5], 3: [12, 28, 0.16, 10] }[level];
  if (Platform.OS === 'android') return { elevation };
  return { shadowColor: '#0B1220', shadowOffset: { width: 0, height: y }, shadowRadius: blur, shadowOpacity: opacity };
}
