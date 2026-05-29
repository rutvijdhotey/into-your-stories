// Supabase mock: functions.invoke for the edge call; from('notes') supports both
// .select('*').eq(...)  (drainTagging query, resolves { data, error }) and
// .update({...}).eq('id', id)  (tagNote write, resolves { error }).
const mockInvoke = jest.fn();
const mockSelectEq = jest.fn();
const mockUpdateEq = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect, update: mockUpdate }));

// `mock*` consts are referenced lazily (inside closures) so they are initialized
// by the time the mocked module is actually used — the hoisted jest.mock factory
// runs before these declarations execute.
jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => (mockInvoke as jest.Mock)(...args) },
    from: (table: string) => mockFrom(table),
  },
}));

import { tagNote, drainTagging } from '../taggingService';
import type { Note } from '../noteHelpers';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    user_id: 'user-1',
    trip_id: 'trip-1',
    content: 'Amazing ramen at Ichiran',
    category: null,
    lat: null,
    lng: null,
    city: null,
    place_name: null,
    tagging_status: 'pending',
    photo_urls: [],
    offline_id: 'off-1',
    captured_at: '2026-05-28T00:00:00.000Z',
    created_at: '2026-05-28T00:00:00.000Z',
    updated_at: '2026-05-28T00:00:00.000Z',
    ...overrides,
  } as Note;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tagNote', () => {
  it('tags a blank note from the suggestion and marks it complete', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' },
      error: null,
    });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    const ok = await tagNote(makeNote());

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('tag-note', {
      body: { content: 'Amazing ramen at Ichiran', lat: null, lng: null, city: null },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      category: 'food',
      place_name: 'Ichiran Ramen',
      city: 'Tokyo',
      tagging_status: 'complete',
    });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('keeps the user category and GPS city, still sets place_name', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' },
      error: null,
    });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await tagNote(makeNote({ category: 'stay', city: 'Kyoto' }));

    expect(mockUpdate).toHaveBeenCalledWith({
      category: 'stay',
      place_name: 'Ichiran Ramen',
      city: 'Kyoto',
      tagging_status: 'complete',
    });
  });

  it('leaves the note pending (no write) when the function errors', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('502') });

    const ok = await tagNote(makeNote());

    expect(ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('drainTagging', () => {
  it('tags every pending note and returns the count', async () => {
    mockSelectEq.mockResolvedValueOnce({
      data: [makeNote({ id: 'a' }), makeNote({ id: 'b' })],
      error: null,
    });
    mockInvoke.mockResolvedValue({
      data: { category: 'general', place_name: null, city: null },
      error: null,
    });
    mockUpdateEq.mockResolvedValue({ error: null });

    const count = await drainTagging();

    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockSelectEq).toHaveBeenCalledWith('tagging_status', 'pending');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it('returns 0 when the query errors', async () => {
    mockSelectEq.mockResolvedValueOnce({ data: null, error: new Error('db down') });

    const count = await drainTagging();

    expect(count).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
