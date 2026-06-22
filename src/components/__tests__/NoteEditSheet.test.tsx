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
  drainAll: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../services/photoUploadQueue', () => ({
  enqueuePhotos: jest.fn().mockResolvedValue(undefined),
}));

// locationService is mocked so the geocode round-trip is deterministic; the real
// resolveLocationEdit helper runs, so these tests exercise the actual save wiring.
jest.mock('../../services/locationService', () => ({
  geocodeLocation: jest.fn(),
  reverseCity: jest.fn(),
}));

jest.mock('../../services/tripAnchorService', () => ({
  invalidateTripAnchors: jest.fn(),
}));

jest.mock('../../services/tripService', () => ({
  listTrips: jest.fn().mockResolvedValue([]),
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
  MAX_PHOTOS_PER_NOTE: 3,
  usePhotoPicker: () => ({
    photos: mockPickerPhotos,
    pick: mockPick,
    remove: mockPickerRemove,
    clear: mockClear,
  }),
}));

import { uploadPhoto, deletePhotos } from '../../services/photoService';
import { updateNote, deleteNote } from '../../services/noteService';
import { enqueuePhotos } from '../../services/photoUploadQueue';
import { geocodeLocation, reverseCity } from '../../services/locationService';
import NoteEditSheet from '../NoteEditSheet';

const mockUploadPhoto = uploadPhoto as jest.MockedFunction<typeof uploadPhoto>;
const mockDeletePhotos = deletePhotos as jest.MockedFunction<typeof deletePhotos>;
const mockUpdateNote = updateNote as jest.MockedFunction<typeof updateNote>;
const mockDeleteNote = deleteNote as jest.MockedFunction<typeof deleteNote>;
const mockEnqueuePhotos = enqueuePhotos as jest.MockedFunction<typeof enqueuePhotos>;
const mockGeocode = geocodeLocation as jest.MockedFunction<typeof geocodeLocation>;
const mockReverseCity = reverseCity as jest.MockedFunction<typeof reverseCity>;

const URL_0 = 'https://x/storage/v1/object/public/photos/user-1/note-1/0.jpg';
const URL_1 = 'https://x/storage/v1/object/public/photos/user-1/note-1/1.jpg';

const baseNote = {
  id: 'note-1',
  user_id: 'user-1',
  content: 'Original text',
  category: 'food',
  photo_urls: [URL_0, URL_1],
} as unknown as Note;

function renderSheet(
  overrides: Partial<{ onClose: jest.Mock; onDeleted: jest.Mock; onMoved: jest.Mock }> = {},
) {
  const onClose = overrides.onClose ?? jest.fn();
  const onDeleted = overrides.onDeleted ?? jest.fn();
  const onMoved = overrides.onMoved ?? jest.fn();
  const utils = render(
    <NoteEditSheet
      note={baseNote}
      visible={true}
      onClose={onClose}
      onDeleted={onDeleted}
      onMoved={onMoved}
    />,
  );
  return { ...utils, onClose, onDeleted, onMoved };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPickerPhotos = [];
  mockUploadPhoto.mockResolvedValue('https://x/storage/v1/object/public/photos/user-1/temp-id/0.jpg');
  mockDeletePhotos.mockResolvedValue(undefined);
  mockUpdateNote.mockResolvedValue(undefined);
  mockDeleteNote.mockResolvedValue(undefined);
  mockEnqueuePhotos.mockResolvedValue(undefined);
  mockGeocode.mockResolvedValue(null);
  mockReverseCity.mockResolvedValue(null);
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

  it('enqueues new photos for background upload and updates with existing urls only', async () => {
    mockPickerPhotos = [{ uri: 'file:///new.jpg' }];

    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());

    // Photos are enqueued, not uploaded synchronously.
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(mockEnqueuePhotos).toHaveBeenCalledWith(
      ['file:///new.jpg'],
      { user_id: 'user-1', note_db_id: 'note-1' },
    );
    // updateNote is called with only the existing (kept) URLs.
    expect(mockUpdateNote).toHaveBeenCalledWith('note-1', {
      content: 'Original text',
      category: 'food',
      photo_urls: [URL_0, URL_1],
    });
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

  it('shows an error alert if the note update fails', async () => {
    mockPickerPhotos = [{ uri: 'file:///new.jpg' }];
    mockUpdateNote.mockRejectedValueOnce(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // Photos were enqueued (not uploaded synchronously), so nothing to clean up.
    expect(mockDeletePhotos).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('NoteEditSheet — editable location', () => {
  const locatedNote = {
    id: 'note-1',
    user_id: 'user-1',
    content: 'Original text',
    category: 'food',
    photo_urls: [URL_0, URL_1],
    lat: 37.4,
    lng: -122.08,
    city: 'Mountain View',
    place_name: 'Googleplex',
    location_source: 'gps',
  } as unknown as Note;

  function renderLocated() {
    return render(
      <NoteEditSheet
        note={locatedNote}
        visible={true}
        onClose={jest.fn()}
        onDeleted={jest.fn()}
        onMoved={jest.fn()}
      />,
    );
  }

  it('pre-fills the field with place_name and preserves location when untouched', async () => {
    const { getByLabelText } = renderLocated();
    // Field shows the existing place_name.
    expect(getByLabelText('Note location').props.value).toBe('Googleplex');

    fireEvent.press(getByLabelText('Save note'));
    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());

    // Not edited -> no geocoding, original location persisted unchanged.
    expect(mockGeocode).not.toHaveBeenCalled();
    expect(mockUpdateNote).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        lat: 37.4,
        lng: -122.08,
        city: 'Mountain View',
        place_name: 'Googleplex',
        location_source: 'gps',
      }),
    );
  });

  it('geocodes an edited location and writes coords + typed place + reverse city', async () => {
    mockGeocode.mockResolvedValueOnce({ lat: 48.85, lng: 2.35 });
    mockReverseCity.mockResolvedValueOnce('Paris');

    const { getByLabelText } = renderLocated();
    fireEvent.changeText(getByLabelText('Note location'), 'Paris');
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());

    expect(mockGeocode).toHaveBeenCalledWith('Paris');
    expect(mockReverseCity).toHaveBeenCalledWith(48.85, 2.35);
    expect(mockUpdateNote).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        lat: 48.85,
        lng: 2.35,
        city: 'Paris',
        place_name: 'Paris',
        location_source: 'manual',
      }),
    );
  });

  it('drops the pin when geocoding an edited location fails, keeping the typed label', async () => {
    mockGeocode.mockResolvedValueOnce(null); // offline / no result

    const { getByLabelText } = renderLocated();
    fireEvent.changeText(getByLabelText('Note location'), 'Paris');
    fireEvent.press(getByLabelText('Save note'));

    await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());

    expect(mockReverseCity).not.toHaveBeenCalled();
    expect(mockUpdateNote).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        lat: null,
        lng: null,
        city: null,
        place_name: 'Paris',
        location_source: 'manual',
      }),
    );
  });
});

describe('NoteEditSheet — photo cap (3 per note)', () => {
  it('opens the picker with only the remaining slots', () => {
    // baseNote has 2 existing photos; cap is 3 -> 1 slot remains.
    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Add photos'));
    expect(mockPick).toHaveBeenCalledWith(1);
  });

  it('blocks adding and alerts when the note already has 3 photos', () => {
    // 2 existing + 1 newly picked = 3 -> at the limit.
    mockPickerPhotos = [{ uri: 'file:///x.jpg' }];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByLabelText } = renderSheet();
    fireEvent.press(getByLabelText('Add photos'));

    expect(mockPick).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Photo limit reached', expect.stringContaining('3'));
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

describe('NoteEditSheet — move to trip', () => {
  it('opens the move sheet when "Move to trip…" is pressed', () => {
    const { getByLabelText, getByText } = render(
      <NoteEditSheet
        note={baseNote}
        visible
        onClose={jest.fn()}
        onDeleted={jest.fn()}
        onMoved={jest.fn()}
      />,
    );
    fireEvent.press(getByLabelText('Move note to another trip'));
    expect(getByText('Move to Trip')).toBeTruthy();
  });
});
