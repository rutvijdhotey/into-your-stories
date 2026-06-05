// Supabase mock: from('notes').select('id, photo_urls').eq(...).maybeSingle() and
// from('notes').update({...}).eq(...)
const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockUpdateEq = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect, update: mockUpdate }));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

// photoService mock
const mockUploadPhoto = jest.fn();
jest.mock('../photoService', () => ({
  uploadPhoto: (...args: unknown[]) => (mockUploadPhoto as jest.Mock)(...args),
}));

// photoUploadQueue mock: peekAllPhotos is a jest.fn so we can control per-call results
const mockPeekAllPhotos = jest.fn();
const mockUpdatePhotoAttempt = jest.fn();
const mockRemovePhotosByKey = jest.fn();

jest.mock('../photoUploadQueue', () => ({
  peekAllPhotos: (...args: unknown[]) => (mockPeekAllPhotos as jest.Mock)(...args),
  updatePhotoAttempt: (...args: unknown[]) => (mockUpdatePhotoAttempt as jest.Mock)(...args),
  removePhotosByKey: (...args: unknown[]) => (mockRemovePhotosByKey as jest.Mock)(...args),
}));

import { drainPhotoUploads } from '../photoUploadService';
import type { PendingPhotoUpload } from '../photoUploadQueue';

function makeItem(overrides: Partial<PendingPhotoUpload> = {}): PendingPhotoUpload {
  return {
    id: 'item-1',
    offline_note_id: 'offline-note-1',
    user_id: 'user-1',
    index: 0,
    local_uri: 'file:///photo.jpg',
    attempts: 0,
    status: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdatePhotoAttempt.mockResolvedValue(undefined);
  mockRemovePhotosByKey.mockResolvedValue(undefined);
});

describe('drainPhotoUploads', () => {
  it('is a no-op when no pending items exist', async () => {
    mockPeekAllPhotos.mockResolvedValue([]);
    await drainPhotoUploads();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('is a no-op when all items are already failed', async () => {
    mockPeekAllPhotos.mockResolvedValue([makeItem({ status: 'failed' })]);
    await drainPhotoUploads();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it('uploads a pending item and patches the note on success', async () => {
    const item = makeItem();
    // First peekAllPhotos: [item pending]; second (after success, item removed): []
    mockPeekAllPhotos
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([]);
    mockUploadPhoto.mockResolvedValueOnce('https://cdn.example.com/photo.jpg');
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'db-note-1', photo_urls: [] } });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await drainPhotoUploads();

    expect(mockUploadPhoto).toHaveBeenCalledWith('user-1', 'offline-note-1', 0, 'file:///photo.jpg');
    expect(mockUpdatePhotoAttempt).not.toHaveBeenCalled();
    expect(mockMaybeSingle).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({ photo_urls: ['https://cdn.example.com/photo.jpg'] });
    expect(mockRemovePhotosByKey).toHaveBeenCalledWith({ offline_note_id: 'offline-note-1' });
  });

  it('increments attempts when upload fails', async () => {
    const item = makeItem();
    const afterFailure = makeItem({ attempts: 1 });
    mockPeekAllPhotos
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([afterFailure]);
    mockUploadPhoto.mockRejectedValueOnce(new Error('network error'));

    await drainPhotoUploads();

    expect(mockUpdatePhotoAttempt).toHaveBeenCalledWith('item-1');
    expect(mockRemovePhotosByKey).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips items with no note key and increments their attempts', async () => {
    const item = makeItem({ offline_note_id: undefined, note_db_id: undefined });
    const afterSkip = makeItem({ offline_note_id: undefined, note_db_id: undefined, attempts: 1 });
    mockPeekAllPhotos
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([afterSkip]);

    await drainPhotoUploads();

    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(mockUpdatePhotoAttempt).toHaveBeenCalledWith('item-1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('patches note using note_db_id when offline_note_id is absent', async () => {
    const item = makeItem({ offline_note_id: undefined, note_db_id: 'db-note-42' });
    mockPeekAllPhotos
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([]);
    mockUploadPhoto.mockResolvedValueOnce('https://cdn.example.com/photo.jpg');
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'db-note-42', photo_urls: [] } });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await drainPhotoUploads();

    expect(mockUpdate).toHaveBeenCalledWith({ photo_urls: ['https://cdn.example.com/photo.jpg'] });
    expect(mockRemovePhotosByKey).toHaveBeenCalledWith({ note_db_id: 'db-note-42' });
  });

  it('does not patch if an item for the group is still pending', async () => {
    const item0 = makeItem({ id: 'item-0', index: 0 });
    const item1 = makeItem({ id: 'item-1', index: 1 });
    // After the run: item0 succeeded (not in queue), item1 still pending (attempts=1)
    const afterRun = [makeItem({ id: 'item-1', index: 1, attempts: 1, status: 'pending' })];
    mockPeekAllPhotos
      .mockResolvedValueOnce([item0, item1])
      .mockResolvedValueOnce(afterRun);
    mockUploadPhoto
      .mockResolvedValueOnce('https://cdn.example.com/0.jpg')
      .mockRejectedValueOnce(new Error('fail'));

    await drainPhotoUploads();

    // item1 still pending → group not fully resolved → no patch
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
