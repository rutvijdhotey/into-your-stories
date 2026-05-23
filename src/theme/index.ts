export const Colors = {
  background: '#111111',
  surface: '#1C1C1E',
  accent: '#C8703A',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary: '#555555',
  border: '#2C2C2E',
  error: '#FF453A',
  food: '#FF9F0A',
  stay: '#30D158',
  activity: '#0A84FF',
  shopping: '#FF375F',
} as const;

export const CategoryColors: Record<string, { bg: string; text: string }> = {
  food:       { bg: 'rgba(220,60,60,0.2)',   text: '#FF7878' },
  stay:       { bg: 'rgba(112,96,224,0.2)',  text: '#A898FF' },
  activity:   { bg: 'rgba(48,168,112,0.2)', text: '#58D898' },
  shopping:   { bg: 'rgba(240,160,48,0.2)', text: '#FFB060' },
  'to-visit': { bg: 'rgba(48,96,200,0.2)',  text: '#70A8FF' },
  general:    { bg: 'rgba(255,255,255,0.1)', text: '#888888' },
};

export const TripGradients: [string, string][] = [
  ['#3D2B1F', '#6B3A2A'],
  ['#1A2A3A', '#2A4A6A'],
  ['#1A2E1A', '#2A5A2A'],
  ['#2A1A3A', '#4A2A6A'],
  ['#2E2A1A', '#5A4A1A'],
  ['#1A2A2E', '#1A4A5A'],
  ['#2E1A1A', '#5A2A2A'],
  ['#1E1E2E', '#2E2E5A'],
];

export function getTripGradient(tripName: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < tripName.length; i++) {
    hash = (hash * 31 + tripName.charCodeAt(i)) & 0xffffffff;
  }
  return TripGradients[Math.abs(hash) % TripGradients.length];
}

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  fab: {
    shadowColor: '#C0581A',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;

export const BorderRadius = {
  card: 16,
  sheet: 24,
  pill: 999,
  input: 12,
  button: 13,
} as const;

export const Typography = {
  title:   { fontSize: 28, fontWeight: '700' as const, color: Colors.textPrimary },
  heading: { fontSize: 20, fontWeight: '600' as const, color: Colors.textPrimary },
  body:    { fontSize: 16, fontWeight: '400' as const, color: Colors.textPrimary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: Colors.textSecondary },
  label:   { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, color: Colors.textSecondary },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
