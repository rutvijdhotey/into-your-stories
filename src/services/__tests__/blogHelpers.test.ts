import { statusLabel, formatBlogDate } from '../blogHelpers';

describe('statusLabel', () => {
  it('maps each status to a human label', () => {
    expect(statusLabel('generating')).toBe('Generating…');
    expect(statusLabel('draft')).toBe('Ready to review');
    expect(statusLabel('published')).toBe('Published');
    expect(statusLabel('error')).toBe('Failed');
  });
});

describe('formatBlogDate', () => {
  it('formats an ISO timestamp as "Mon D, YYYY"', () => {
    expect(formatBlogDate('2026-05-29T10:00:00.000Z')).toBe('May 29, 2026');
  });
});
