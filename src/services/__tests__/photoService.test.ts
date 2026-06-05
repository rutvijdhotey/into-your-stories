const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockRemove = jest.fn();
const mockFrom = {
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
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
  it('uploads the photo and returns the public URL', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'user1/note1/0.jpg' }, error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://example.com/photos/user1/note1/0.jpg' },
    });

    const url = await uploadPhoto('user1', 'note1', 0, 'file:///photo.jpg');

    expect(global.fetch).toHaveBeenCalledWith('file:///photo.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'user1/note1/0.jpg',
      mockArrayBuffer,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(mockGetPublicUrl).toHaveBeenCalledWith('user1/note1/0.jpg');
    expect(url).toBe('https://example.com/photos/user1/note1/0.jpg');
  });

  it('throws when supabase upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage error') });

    await expect(uploadPhoto('user1', 'note1', 0, 'file:///photo.jpg')).rejects.toThrow('Storage error');
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });
});

describe('uploadCoverPhoto', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uploads to the trip-covers path and returns a cache-busted URL', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    mockUpload.mockResolvedValueOnce({ data: { path: 'user1/trip-covers/trip1.jpg' }, error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://example.com/photos/user1/trip-covers/trip1.jpg' },
    });

    const url = await uploadCoverPhoto('user1', 'trip1', 'file:///cover.jpg');

    expect(mockUpload).toHaveBeenCalledWith(
      'user1/trip-covers/trip1.jpg',
      mockArrayBuffer,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(mockGetPublicUrl).toHaveBeenCalledWith('user1/trip-covers/trip1.jpg');
    expect(url).toBe('https://example.com/photos/user1/trip-covers/trip1.jpg?v=1234');
  });

  it('throws when upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage error') });
    await expect(uploadCoverPhoto('user1', 'trip1', 'file:///cover.jpg')).rejects.toThrow('Storage error');
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });
});

describe('deletePhotos', () => {
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
