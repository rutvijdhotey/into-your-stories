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

// Mock global fetch for URI → Blob conversion
const mockBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
const mockFetchResponse = { blob: jest.fn().mockResolvedValue(mockBlob) };
global.fetch = jest.fn().mockResolvedValue(mockFetchResponse) as jest.Mock;

import { uploadPhoto, deletePhotos } from '../photoService';

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
      mockBlob,
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
});
