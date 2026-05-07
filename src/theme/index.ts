export const Colors = {
  background: '#111111',
  surface: '#1C1C1E',
  accent: '#C8703A',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#2C2C2E',
  error: '#FF453A',
  // Map pin colors per category
  food: '#FF9F0A',
  stay: '#30D158',
  activity: '#0A84FF',
  shopping: '#FF375F',
} as const;

export const Typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: Colors.textPrimary },
  heading: { fontSize: 20, fontWeight: '600' as const, color: Colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, color: Colors.textPrimary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: Colors.textSecondary },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
