import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { Note } from '../../services/noteHelpers';

// --- Mocks -----------------------------------------------------------------

jest.mock('../../services/photoService', () => ({
  uploadPhoto: jest.fn(),
  deletePhotos: jest.fn(),
}));

jest.mock('../../services/noteService', () => ({
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'temp-id',
}));

// CategoryPicker is exercised manually; render nothing here to isolate the sheet.
jest.mock('../CategoryPicker', () => ({
  __esModule: true,
  default: () => null,
}));

// usePhotoPicker is mocked with a mutable photos array so individual tests can
// simulate the user having newly-picked photos staged.
let mockPickerPhotos: { uri: string }[] = [];
const mockPick = jest.fn();
const mockPickerRemove = jest.fn();
const mockClear = jest.fn();
jest.mock('../../hooks/usePhotoPicker', () => ({
  MAX_PHOTOS_PER_NOTE: 4,
  usePhotoPicker: () => ({
    photos: mockPickerPhotos,
    pick: mockPick,
    remove: mockPickerRemove,
    clear: mockClear,
  }),
}));

import { uploadPhoto, deletePhotos } from '../../services/photoService';
import { updateNote, deleteNote } from '../../services/noteService';
import NoteEditSheet from '../NoteEditSheet';

const mockUploadPhoto = uploadPhoto as jest.MockedFunction<typeof uploadPhoto>;
const mockDeletePhotos = deletePhotos as jest.MockedFunction<typeof deletePhotos>;
const mockUpdateNote = updateNote as jest.MockedFunction<typeof updateNote>;
const mockDeleteNote = deleteNote as jest.MockedFunction<typeof deleteNote>;

const URL_0 = 'https://x/storage/v1/object/public/photos/user-1/note-1/0.jpg';
const URL_1 = 'https://x/storage/v1/object/public/photos/user-1/note-1/1.jpg';

const baseNote = {
  id: 'note-1',
  user_id: 'user-1',
  content: 'Original text',
  category: 'food',
  photo_urls: [URL_0, URL_1],
} as unknown as Note;

function renderSheet(overrides: Partial<{ onClose: jest.Mock; onDeleted: jest.Mock }> = {}) {
  const onClose = overrides.onClose ?? jest.fn();
  const onDeleted = overrides.onDeleted ?? jest.fn();
  const utils = render(
    <NoteEditSheet note={baseNote} visible={true} onClose={onClose} onDeleted={onDeleted} />,
  );
  return { ...utils, onClose, onDeleted };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPickerPhotos = [];
  mockUploadPhoto.mockResolvedValue('https://x/storage/v1/object/public/photos/user-1/temp-id/0.jpg');
  mockDeletePhotos.mockResolvedValue(undefined);
  mockUpdateNote.mockResolvedValue(undefined);
  mockDeleteNote.mockResolvedValue(undefined);
});

describe('NoteEditSheet — canSave gating', () => {
  it('enables Save when content is non-empty', () => {
    const { getByLabelText } = renderSheet();
    expect(getByLabelText('Save note')).toBeEnabled();
  });

  it('disables Save when content is cleared', () => {
    const { getByLabelText, getByPlaceholderText } = renderSheet();
    fireEvent.changeText(getByPlaceholderText("What's on your mind?"), '');
    expect(getByLabelText('Save note')).toBeDisabled();
  });

  it('disables Save when content is only whitespace', () => {
    const { getByLabelText, getByPlaceholderText } = renderSheet();
    fireEvent.changeText(getByPlaceholderText("What's on your mind?"), '   ');
    expect(getByLabelText('Save note')).toBeDisabled();
  });
});

describe('NoteEditSheet — save flow', () => {
  it('stages an existing photo for removal and deletes it on save', async () => {
    const { getAllByLabelText, getByLabelText, onClose } = renderSheet();

    // Two existing photos -> two remove badges. Remove the first.
    expect(getAllByLabelText('Remove photo')).toHaveLength(2);
    fireEvent.press(getAllByLabelText('Remove photo')[0]);
    expect(getAllByLabelText('Remove photo')).toHaveLength(1);

    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());

    // Removed url is deleted from storage; surviving url is persisted.
    expect(mockDeletePhotos).toHaveBeenCalledWith([URL_0]);
    expect(mockUpdateNote).toHaveBeenCalledWith('note-1', {
      content: 'Original text',
      category: 'food',
      photo_urls: [URL_1],
    });
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('uploads new photos before updating, appending them to existing urls', async () => {
    mockPickerPhotos = [{ uri: 'file:///new.jpg' }];
    const UPLOADED = 'https://x/storage/v1/object/public/photos/user-1/temp-id/0.jpg';
    mockUploadPhoto.mockResolvedValueOnce(UPLOADED);

    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());

    expect(mockUploadPhoto).toHaveBeenCalledWith('user-1', 'temp-id', 0, 'file:///new.jpg');
    expect(mockUpdateNote).toHaveBeenCalledWith('note-1', {
      content: 'Original text',
      category: 'food',
      photo_urls: [URL_0, URL_1, UPLOADED],
    });
    // Ordering: upload happens before the note record is updated.
    expect(mockUploadPhoto.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdateNote.mock.invocationCallOrder[0],
    );
  });

  it('saves the trimmed, edited content', async () => {
    const { getByLabelText, getByPlaceholderText } = renderSheet();
    fireEvent.changeText(getByPlaceholderText("What's on your mind?"), '  new body  ');
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());
    expect(mockUpdateNote).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ content: 'new body' }),
    );
  });

  it('cleans up freshly-uploaded photos if the note update fails', async () => {
    mockPickerPhotos = [{ uri: 'file:///new.jpg' }];
    const UPLOADED = 'https://x/storage/v1/object/public/photos/user-1/temp-id/0.jpg';
    mockUploadPhoto.mockResolvedValueOnce(UPLOADED);
    mockUpdateNote.mockRejectedValueOnce(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // Best-effort cleanup of the orphaned upload.
    expect(mockDeletePhotos).toHaveBeenCalledWith([UPLOADED]);
    alertSpy.mockRestore();
  });
});

describe('NoteEditSheet — photo cap (4 per note)', () => {
  it('opens the picker with only the remaining slots', () => {
    // baseNote has 2 existing photos; cap is 4 -> 2 slots remain.
    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Add photos'));
    expect(mockPick).toHaveBeenCalledWith(2);
  });

  it('blocks adding and alerts when the note already has 4 photos', () => {
    // 2 existing + 2 newly picked = 4 -> at the limit.
    mockPickerPhotos = [{ uri: 'file:///x.jpg' }, { uri: 'file:///y.jpg' }];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Add photos'));

    expect(mockPick).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Photo limit reached', expect.stringContaining('4'));
    alertSpy.mockRestore();
  });
});

describe('NoteEditSheet — delete flow', () => {
  it('deletes the deduplicated union of photos, then the note', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getAllByLabelText, getByLabelText, onDeleted } = renderSheet();

    // Stage one removal so removedUrls + existingUrls + note.photo_urls overlap.
    fireEvent.press(getAllByLabelText('Remove photo')[0]);
    fireEvent.press(getByLabelText('Delete note'));

    // Pull the destructive button out of the confirm alert and invoke it.
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const destructive = buttons.find((b) => b.text === 'Delete');
    await act(async () => {
      await destructive?.onPress?.();
    });

    expect(mockDeletePhotos).toHaveBeenCalledTimes(1);
    const deletedArg = mockDeletePhotos.mock.calls[0][0];
    expect(deletedArg).toHaveLength(2);
    expect(deletedArg).toEqual(expect.arrayContaining([URL_0, URL_1]));

    expect(mockDeleteNote).toHaveBeenCalledWith('note-1');
    expect(mockDeleteNote.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockDeletePhotos.mock.invocationCallOrder[0],
    );
    expect(onDeleted).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
