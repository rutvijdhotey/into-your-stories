const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockFrom = {
  upload: mockUpload,
  remove: mockRemove,
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn().mockImplementation(() => mockFrom),
    },
  },
}));

// expo-image-manipulator: pass the URI through unchanged so tests stay simple
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri })),
  SaveFormat: { JPEG: 'jpeg' },
}));

// Mock global fetch for URI → ArrayBuffer conversion
const mockArrayBuffer = new ArrayBuffer(16);
const mockFetchResponse = { arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer) };
global.fetch = jest.fn().mockResolvedValue(mockFetchResponse) as jest.Mock;

import { uploadPhoto, deletePhotos, uploadCoverPhoto } from '../photoService';

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse);
});

describe('uploadPhoto', () => {
  // The bucket is private (migration 025), so what gets stored is the storage
  // path — never a URL. The app signs it at render time.
  it('uploads the photo and returns its storage path', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'user1/note1/0.jpg' }, error: null });

    const ref = await uploadPhoto('user1', 'note1', 0, 'file:///photo.jpg');

    expect(global.fetch).toHaveBeenCalledWith('file:///photo.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'user1/note1/0.jpg',
      mockArrayBuffer,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(ref).toBe('user1/note1/0.jpg');
  });

  it('throws when supabase upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage error') });

    await expect(uploadPhoto('user1', 'note1', 0, 'file:///photo.jpg')).rejects.toThrow('Storage error');
  });
});

describe('uploadCoverPhoto', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uploads to the trip-covers path and returns a cache-busted path', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    mockUpload.mockResolvedValueOnce({ data: { path: 'user1/trip-covers/trip1.jpg' }, error: null });

    const ref = await uploadCoverPhoto('user1', 'trip1', 'file:///cover.jpg');

    expect(mockUpload).toHaveBeenCalledWith(
      'user1/trip-covers/trip1.jpg',
      mockArrayBuffer,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(ref).toBe('user1/trip-covers/trip1.jpg?v=1234');
  });

  it('throws when upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage error') });
    await expect(uploadCoverPhoto('user1', 'trip1', 'file:///cover.jpg')).rejects.toThrow('Storage error');
  });
});

describe('deletePhotos', () => {
  it('removes bare storage paths as given', async () => {
    mockRemove.mockResolvedValueOnce({ data: [], error: null });

    await deletePhotos(['user1/note1/0.jpg', 'user1/trip-covers/trip1.jpg?v=99']);

    expect(mockRemove).toHaveBeenCalledWith([
      'user1/note1/0.jpg',
      'user1/trip-covers/trip1.jpg',
    ]);
  });

  it('removes extracted paths from storage', async () => {
    mockRemove.mockResolvedValueOnce({ data: [], error: null });

    await deletePhotos([
      'https://example.supabase.co/storage/v1/object/public/photos/user1/note1/0.jpg',
      'https://example.supabase.co/storage/v1/object/public/photos/user1/note1/1.jpg',
    ]);

    expect(mockRemove).toHaveBeenCalledWith([
      'user1/note1/0.jpg',
      'user1/note1/1.jpg',
    ]);
  });

  it('does nothing when the URL list is empty', async () => {
    await deletePhotos([]);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('does not throw on storage error (best-effort)', async () => {
    mockRemove.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      deletePhotos(['https://example.supabase.co/storage/v1/object/public/photos/user1/note1/0.jpg']),
    ).resolves.toBeUndefined();
  });

  it('strips a query suffix before resolving the storage path', async () => {
    mockRemove.mockResolvedValueOnce({ data: [], error: null });

    await deletePhotos([
      'https://example.supabase.co/storage/v1/object/public/photos/user1/trip-covers/trip1.jpg?v=1234',
    ]);

    expect(mockRemove).toHaveBeenCalledWith(['user1/trip-covers/trip1.jpg']);
  });
});
