// Supabase query-builder mock: from('notes').update({...}).eq('id', id) and
// from('notes').delete().eq('id', id) both resolve to { error }.
const mockEq = jest.fn();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockDelete = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({
  update: mockUpdate,
  delete: mockDelete,
  upsert: mockUpsert,
}));

// `from` is referenced lazily so the mock-prefixed const is initialized by the
// time noteService actually calls it (imports are hoisted above these consts).
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('../../services/offlineQueue', () => ({
  peekAll: jest.fn().mockResolvedValue([]),
  removeByOfflineId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/photoUploadService', () => ({
  drainPhotoUploads: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/taggingService', () => ({
  drainTagging: jest.fn().mockResolvedValue(undefined),
}));

import { updateNote, deleteNote, drainQueue, moveNote, type UpdateNoteInput } from '../noteService';
import { peekAll } from '../../services/offlineQueue';

const mockPeekAll = peekAll as jest.MockedFunction<typeof peekAll>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateNote', () => {
  const patch: UpdateNoteInput = {
    content: 'Updated text',
    category: 'food',
    photo_urls: ['https://x/photos/u/n/0.jpg'],
    lat: null,
    lng: null,
    city: null,
    place_name: null,
    location_source: null,
  };

  it('updates the note and resets tagging_status to pending', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(updateNote('note-1', patch)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockUpdate).toHaveBeenCalledWith({
      content: 'Updated text',
      category: 'food',
      photo_urls: ['https://x/photos/u/n/0.jpg'],
      lat: null,
      lng: null,
      city: null,
      place_name: null,
      location_source: null,
      tagging_status: 'pending',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('persists a null category', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await updateNote('note-2', { ...patch, category: null });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ category: null }),
    );
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('update failed') });

    await expect(updateNote('note-1', patch)).rejects.toThrow('update failed');
  });
});

describe('drainQueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes occurred_at to the upserted row when present in PendingNote', async () => {
    mockPeekAll.mockResolvedValueOnce([
      {
        offline_id: 'off-1',
        user_id: 'u1',
        trip_id: 't1',
        content: 'Test',
        category: null,
        lat: null,
        lng: null,
        city: null,
        place_name: null,
        location_source: null,
        captured_at: '2026-06-01T10:00:00.000Z',
        occurred_at: '2024-08-15T14:32:00.000Z',
        photo_uris: [],
      },
    ]);
    mockUpsert.mockResolvedValueOnce({ error: null });

    await drainQueue();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: '2024-08-15T14:32:00.000Z' }),
      expect.anything(),
    );
  });

  it('writes null for occurred_at when not set in PendingNote', async () => {
    mockPeekAll.mockResolvedValueOnce([
      {
        offline_id: 'off-2',
        user_id: 'u1',
        trip_id: 't1',
        content: 'Test',
        category: null,
        lat: null,
        lng: null,
        city: null,
        place_name: null,
        location_source: null,
        captured_at: '2026-06-01T10:00:00.000Z',
        occurred_at: null,
        photo_uris: [],
      },
    ]);
    mockUpsert.mockResolvedValueOnce({ error: null });

    await drainQueue();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: null }),
      expect.anything(),
    );
  });
});

describe('deleteNote', () => {
  it('deletes the note by id', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(deleteNote('note-1')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('delete failed') });

    await expect(deleteNote('note-1')).rejects.toThrow('delete failed');
  });
});

describe('moveNote', () => {
  it('updates only trip_id and resolves on success', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(moveNote('note-1', 'trip-2')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockUpdate).toHaveBeenCalledWith({ trip_id: 'trip-2' });
    expect(mockEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('rls denied') });

    await expect(moveNote('note-1', 'trip-2')).rejects.toThrow('rls denied');
  });
});
