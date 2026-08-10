const mockCreateSignedUrls = jest.fn();
const mockFromStorage = jest.fn((_bucket: string) => ({
  createSignedUrls: mockCreateSignedUrls,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => mockFromStorage(bucket) } },
}));

import {
  signPhotoRefs,
  peekSignedUrl,
  clearSignedPhotoCache,
  EXPORT_TTL_SECONDS,
} from '../signedPhotoUrls';

const LEGACY =
  'https://abcdefgh.supabase.co/storage/v1/object/public/photos/user-1/note-1/0.jpg';

/** Mirrors the supabase-js shape: one entry per requested path, in order. */
function signOk(paths: string[]) {
  return {
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}?token=t`, error: null })),
    error: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSignedPhotoCache();
});

describe('signPhotoRefs', () => {
  it('does not call storage when there is nothing to sign', async () => {
    expect((await signPhotoRefs([])).size).toBe(0);
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('passes local URIs straight through without signing them', async () => {
    const map = await signPhotoRefs(['file:///var/photo.jpg']);
    expect(map.get('file:///var/photo.jpg')).toBe('file:///var/photo.jpg');
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('signs a bare storage path and keys the result by the original ref', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['user-1/note-1/0.jpg']));

    const map = await signPhotoRefs(['user-1/note-1/0.jpg']);

    expect(mockFromStorage).toHaveBeenCalledWith('photos');
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['user-1/note-1/0.jpg'], 3600);
    expect(map.get('user-1/note-1/0.jpg')).toBe('https://signed/user-1/note-1/0.jpg?token=t');
  });

  it('signs a legacy public URL by its extracted path', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['user-1/note-1/0.jpg']));

    const map = await signPhotoRefs([LEGACY]);

    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['user-1/note-1/0.jpg'], 3600);
    expect(map.get(LEGACY)).toBe('https://signed/user-1/note-1/0.jpg?token=t');
  });

  it('requests each distinct path once even when refs repeat', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));

    const map = await signPhotoRefs(['p/0.jpg', 'p/0.jpg']);

    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['p/0.jpg'], 3600);
    expect(map.get('p/0.jpg')).toBe('https://signed/p/0.jpg?token=t');
  });

  it('maps one signed path back to every ref that shares it', async () => {
    // Cover photos carry a ?v= cache-buster, so two refs can share a path.
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['u/trip-covers/t.jpg']));

    const map = await signPhotoRefs([
      'u/trip-covers/t.jpg?v=1',
      'u/trip-covers/t.jpg?v=2',
    ]);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(map.get('u/trip-covers/t.jpg?v=1')).toBe('https://signed/u/trip-covers/t.jpg?token=t');
    expect(map.get('u/trip-covers/t.jpg?v=2')).toBe('https://signed/u/trip-covers/t.jpg?token=t');
  });

  it('omits refs the signer could not sign', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({
      data: [
        { path: 'p/0.jpg', signedUrl: 'https://signed/p/0.jpg?token=t', error: null },
        { path: 'p/gone.jpg', signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    });

    const map = await signPhotoRefs(['p/0.jpg', 'p/gone.jpg']);

    expect(map.get('p/0.jpg')).toBe('https://signed/p/0.jpg?token=t');
    expect(map.has('p/gone.jpg')).toBe(false);
  });

  it('resolves to an empty map when the whole request fails', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    expect((await signPhotoRefs(['p/0.jpg'])).size).toBe(0);
  });

  it('survives the storage call throwing', async () => {
    mockCreateSignedUrls.mockRejectedValueOnce(new Error('network'));
    expect((await signPhotoRefs(['p/0.jpg'])).size).toBe(0);
  });

  it('ignores refs that are not photos-bucket references', async () => {
    const map = await signPhotoRefs(['https://example.com/cat.jpg', '']);
    expect(map.size).toBe(0);
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('serves a second request from cache without signing again', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));
    await signPhotoRefs(['p/0.jpg']);

    const map = await signPhotoRefs(['p/0.jpg']);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(map.get('p/0.jpg')).toBe('https://signed/p/0.jpg?token=t');
  });

  it('does not populate the render cache with long-lived export URLs', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));

    await signPhotoRefs(['p/0.jpg'], { ttlSeconds: EXPORT_TTL_SECONDS, useCache: false });

    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['p/0.jpg'], EXPORT_TTL_SECONDS);
    expect(peekSignedUrl('p/0.jpg')).toBeNull();
  });
});

describe('peekSignedUrl', () => {
  it('returns null before anything is signed', () => {
    expect(peekSignedUrl('p/0.jpg')).toBeNull();
  });

  it('returns a local URI unchanged', () => {
    expect(peekSignedUrl('file:///var/photo.jpg')).toBe('file:///var/photo.jpg');
  });

  it('returns a cached URL after signing', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));
    await signPhotoRefs(['p/0.jpg']);
    expect(peekSignedUrl('p/0.jpg')).toBe('https://signed/p/0.jpg?token=t');
  });

  it('treats a URL inside the refresh margin as expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T12:00:00Z'));
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));
    await signPhotoRefs(['p/0.jpg']);

    // 1h TTL, 5min margin → still fresh at 54min, stale at 56min.
    jest.setSystemTime(new Date('2026-08-07T12:54:00Z'));
    expect(peekSignedUrl('p/0.jpg')).not.toBeNull();

    jest.setSystemTime(new Date('2026-08-07T12:56:00Z'));
    expect(peekSignedUrl('p/0.jpg')).toBeNull();
    jest.useRealTimers();
  });

  it('re-signs after the cached URL goes stale', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T12:00:00Z'));
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));
    await signPhotoRefs(['p/0.jpg']);

    jest.setSystemTime(new Date('2026-08-07T13:30:00Z'));
    mockCreateSignedUrls.mockResolvedValueOnce(signOk(['p/0.jpg']));
    await signPhotoRefs(['p/0.jpg']);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
