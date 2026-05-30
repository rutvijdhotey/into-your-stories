import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('../../services/photoHelpers', () => ({
  extractExifLocation: jest.fn(),
  ensureMediaLibraryPermission: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { extractExifLocation, ensureMediaLibraryPermission } from '../../services/photoHelpers';

const mockRequestPermissions = ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestMediaLibraryPermissionsAsync
>;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;
const mockExtractExif = extractExifLocation as jest.MockedFunction<typeof extractExifLocation>;
const mockEnsurePermission = ensureMediaLibraryPermission as jest.MockedFunction<
  typeof ensureMediaLibraryPermission
>;

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermissions.mockResolvedValue({ status: 'granted', granted: true, expires: 'never', canAskAgain: true } as never);
  mockExtractExif.mockReturnValue(null);
  mockEnsurePermission.mockResolvedValue(true);
});

import { usePhotoPicker } from '../usePhotoPicker';

describe('usePhotoPicker', () => {
  it('starts with an empty photos array', () => {
    const { result } = renderHook(() => usePhotoPicker());
    expect(result.current.photos).toEqual([]);
  });

  it('adds no photos when permission is denied', async () => {
    mockEnsurePermission.mockResolvedValueOnce(false);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toEqual([]);
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });

  it('adds photos to state when picker returns assets', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 100, height: 100, exif: null },
        { uri: 'file:///b.jpg', width: 200, height: 200, exif: null },
      ],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toHaveLength(2);
    expect(result.current.photos[0].uri).toBe('file:///a.jpg');
    expect(result.current.photos[1].uri).toBe('file:///b.jpg');
  });

  it('does nothing when picker is cancelled', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true, assets: [] } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toEqual([]);
  });

  it('extracts EXIF location from assets that have GPS data', async () => {
    const fakeExif = { GPSLatitude: [48, 51, 30], GPSLatitudeRef: 'N', GPSLongitude: [2, 21, 3.6], GPSLongitudeRef: 'E' };
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: fakeExif }],
    } as never);
    mockExtractExif.mockReturnValueOnce({ lat: 48.858, lng: 2.351 });

    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });

    expect(mockExtractExif).toHaveBeenCalledWith(fakeExif);
    expect(result.current.photos[0].exifLocation).toEqual({ lat: 48.858, lng: 2.351 });
  });

  it('sets exifLocation to null when asset has no EXIF', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: null }],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos[0].exifLocation).toBeNull();
  });

  it('calls launchImageLibraryAsync with correct options', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true, assets: [] } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(mockLaunchLibrary).toHaveBeenCalledWith({
      allowsMultipleSelection: true,
      selectionLimit: 5,
      exif: true,
      quality: 0.7,
      mediaTypes: ['images'],
    });
  });

  it('limits the picker selection to the remaining slots passed in', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 1, height: 1, exif: null },
        { uri: 'file:///b.jpg', width: 1, height: 1, exif: null },
        { uri: 'file:///c.jpg', width: 1, height: 1, exif: null },
      ],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(2); });
    expect(mockLaunchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ selectionLimit: 2 }),
    );
    // Even if the OS over-returns, the hook clamps to the remaining slots.
    expect(result.current.photos).toHaveLength(2);
  });

  it('does not open the picker when no slots remain', async () => {
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(0); });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
    expect(result.current.photos).toEqual([]);
  });

  it('removes a photo at the given index', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 100, height: 100, exif: null },
        { uri: 'file:///b.jpg', width: 200, height: 200, exif: null },
      ],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    act(() => { result.current.remove(0); });
    expect(result.current.photos).toHaveLength(1);
    expect(result.current.photos[0].uri).toBe('file:///b.jpg');
  });

  it('clear() empties the photos array', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: null }],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toHaveLength(1);
    act(() => { result.current.clear(); });
    expect(result.current.photos).toEqual([]);
  });
});
