import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../services/photoHelpers', () => ({
  ensureMediaLibraryPermission: jest.fn(),
}));
jest.mock('../../services/photoService', () => ({
  uploadCoverPhoto: jest.fn(),
  deletePhotos: jest.fn(),
}));
jest.mock('../../services/tripService', () => ({
  updateCoverPhoto: jest.fn(),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission } from '../../services/photoHelpers';
import { uploadCoverPhoto, deletePhotos } from '../../services/photoService';
import { updateCoverPhoto } from '../../services/tripService';
import { useAuth } from '../../contexts/AuthContext';
import { useCoverPhoto } from '../useCoverPhoto';

const mockLaunch = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<typeof ImagePicker.launchImageLibraryAsync>;
const mockEnsure = ensureMediaLibraryPermission as jest.MockedFunction<typeof ensureMediaLibraryPermission>;
const mockUpload = uploadCoverPhoto as jest.MockedFunction<typeof uploadCoverPhoto>;
const mockDelete = deletePhotos as jest.MockedFunction<typeof deletePhotos>;
const mockUpdate = updateCoverPhoto as jest.MockedFunction<typeof updateCoverPhoto>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const trip = { id: 'trip1', cover_photo_url: null } as never;
const tripWithCover = { id: 'trip1', cover_photo_url: 'https://x/photos/u/trip-covers/trip1.jpg?v=1' } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ session: { user: { id: 'user1' } } } as never);
  mockEnsure.mockResolvedValue(true);
});

describe('useCoverPhoto.setCover', () => {
  it('does nothing and does not upload when permission is denied', async () => {
    mockEnsure.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(mockLaunch).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('is a no-op when the picker is cancelled', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: true } as never);
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('uploads the picked photo and saves the URL', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c.jpg' }] } as never);
    mockUpload.mockResolvedValueOnce('https://x/photos/user1/trip-covers/trip1.jpg?v=9');
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(mockUpload).toHaveBeenCalledWith('user1', 'trip1', 'file:///c.jpg');
    expect(mockUpdate).toHaveBeenCalledWith('trip1', 'https://x/photos/user1/trip-covers/trip1.jpg?v=9');
    expect(result.current.busy).toBe(false);
  });

  it('alerts and leaves the cover unchanged when upload fails', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c.jpg' }] } as never);
    mockUpload.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(alertSpy).toHaveBeenCalledWith('Could not update cover', 'boom');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('useCoverPhoto.removeCover', () => {
  it('nulls the column and best-effort deletes the old file', async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useCoverPhoto(tripWithCover));
    await act(async () => { await result.current.removeCover(); });
    expect(mockUpdate).toHaveBeenCalledWith('trip1', null);
    expect(mockDelete).toHaveBeenCalledWith(['https://x/photos/u/trip-covers/trip1.jpg?v=1']);
  });
});
