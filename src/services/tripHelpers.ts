import type { Database } from '../lib/database.types';

type TripRow = Database['public']['Tables']['trips']['Row'];
type TripInsertRow = Database['public']['Tables']['trips']['Insert'];

export type TripStatus = 'active' | 'completed';

// Narrow the DB row's `status: string` to the literal union we enforce via CHECK constraint.
export type Trip = Omit<TripRow, 'status'> & { status: TripStatus };
export type TripInsert = Omit<TripInsertRow, 'status'> & { status?: TripStatus };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a YYYY-MM-DD date string as a local-time Date. Avoids the UTC shift
// `new Date('2026-04-12')` produces (which can render as Apr 11 in negative TZs).
function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(d: Date, includeYear: boolean): string {
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return includeYear ? `${base}, ${d.getFullYear()}` : base;
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  if (start && !end) {
    const s = parseDateOnly(start);
    return `${formatShort(s, false)} – ongoing`;
  }
  if (!start && end) {
    const e = parseDateOnly(end);
    return `Ends ${formatShort(e, false)}`;
  }
  const s = parseDateOnly(start!);
  const e = parseDateOnly(end!);
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameYear) {
    return `${formatShort(s, false)} – ${formatShort(e, false)}`;
  }
  return `${formatShort(s, true)} – ${formatShort(e, true)}`;
}

export function parseDestinations(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isOverdueActive(trip: Trip, today: Date = new Date()): boolean {
  if (trip.status !== 'active' || !trip.end_date) return false;
  const end = parseDateOnly(trip.end_date);
  // overdue only if end is strictly before today (today is not overdue)
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return end < todayMidnight;
}

export function splitByStatus(trips: Trip[]): { active: Trip[]; completed: Trip[] } {
  const active: Trip[] = [];
  const completed: Trip[] = [];
  for (const t of trips) {
    if (t.status === 'active') active.push(t);
    else completed.push(t);
  }
  return { active, completed };
}
