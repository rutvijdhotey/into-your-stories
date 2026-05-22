import {
  formatDateRange,
  parseDestinations,
  isOverdueActive,
  splitByStatus,
  type Trip,
} from '../tripHelpers';

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  user_id: 'u1',
  name: 'Test Trip',
  destinations: ['Tokyo'],
  start_date: null,
  end_date: null,
  status: 'active',
  cover_photo_url: null,
  note_count: 0,
  created_at: '2026-05-21T00:00:00Z',
  updated_at: '2026-05-21T00:00:00Z',
  ...overrides,
});

describe('formatDateRange', () => {
  it('returns "—" when both dates are null', () => {
    expect(formatDateRange(null, null)).toBe('—');
  });
  it('formats a closed range with same year', () => {
    expect(formatDateRange('2026-04-12', '2026-04-20')).toBe('Apr 12 – Apr 20');
  });
  it('formats an open-ended active range', () => {
    expect(formatDateRange('2026-04-12', null)).toBe('Apr 12 – ongoing');
  });
  it('formats a range crossing years', () => {
    expect(formatDateRange('2025-12-28', '2026-01-04')).toBe('Dec 28, 2025 – Jan 4, 2026');
  });
});

describe('parseDestinations', () => {
  it('splits comma-separated input and trims whitespace', () => {
    expect(parseDestinations('Tokyo, Kyoto ,  Osaka')).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
  });
  it('drops empty entries', () => {
    expect(parseDestinations('Tokyo,, ,Osaka')).toEqual(['Tokyo', 'Osaka']);
  });
  it('returns [] for empty input', () => {
    expect(parseDestinations('')).toEqual([]);
    expect(parseDestinations('   ')).toEqual([]);
  });
});

describe('isOverdueActive', () => {
  const today = new Date('2026-05-21T12:00:00Z');
  it('is true when an active trip has an end_date in the past', () => {
    expect(isOverdueActive(trip({ status: 'active', end_date: '2026-05-10' }), today)).toBe(true);
  });
  it('is false when an active trip has no end_date', () => {
    expect(isOverdueActive(trip({ status: 'active', end_date: null }), today)).toBe(false);
  });
  it('is false when an active trip ends today or later', () => {
    expect(isOverdueActive(trip({ status: 'active', end_date: '2026-05-21' }), today)).toBe(false);
    expect(isOverdueActive(trip({ status: 'active', end_date: '2026-05-25' }), today)).toBe(false);
  });
  it('is false for completed trips regardless of end_date', () => {
    expect(isOverdueActive(trip({ status: 'completed', end_date: '2026-05-10' }), today)).toBe(false);
  });
});

describe('splitByStatus', () => {
  it('partitions into active and completed lists preserving input order', () => {
    const a = trip({ id: 'a', status: 'active' });
    const b = trip({ id: 'b', status: 'completed' });
    const c = trip({ id: 'c', status: 'active' });
    expect(splitByStatus([a, b, c])).toEqual({ active: [a, c], completed: [b] });
  });
  it('returns empty arrays when input is empty', () => {
    expect(splitByStatus([])).toEqual({ active: [], completed: [] });
  });
});
