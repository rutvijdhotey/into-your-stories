import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import MoveToTripSheet from '../MoveToTripSheet';
import { listTrips } from '../../services/tripService';
import { moveNote } from '../../services/noteService';
import type { Trip } from '../../services/tripHelpers';

jest.mock('../../services/tripService', () => ({ listTrips: jest.fn() }));
jest.mock('../../services/noteService', () => ({ moveNote: jest.fn() }));

const mockListTrips = listTrips as jest.MockedFunction<typeof listTrips>;
const mockMoveNote = moveNote as jest.MockedFunction<typeof moveNote>;

const trip = (id: string, name: string): Trip =>
  ({
    id,
    user_id: 'u1',
    name,
    destinations: ['Paris'],
    status: 'active',
    note_count: 0,
    cover_photo_url: null,
    start_date: null,
    end_date: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }) as unknown as Trip;

beforeEach(() => {
  jest.clearAllMocks();
  mockListTrips.mockResolvedValue([trip('t1', 'Current Trip'), trip('t2', 'Other Trip')]);
});

function renderSheet(overrides: Partial<{ onClose: jest.Mock; onMoved: jest.Mock }> = {}) {
  const onClose = overrides.onClose ?? jest.fn();
  const onMoved = overrides.onMoved ?? jest.fn();
  const utils = render(
    <MoveToTripSheet
      visible
      userId="u1"
      currentTripId="t1"
      noteId="n1"
      onClose={onClose}
      onMoved={onMoved}
    />,
  );
  return { ...utils, onClose, onMoved };
}

it('lists the user trips excluding the current trip', async () => {
  const { queryByText, getByText } = renderSheet();
  await waitFor(() => expect(getByText('Other Trip')).toBeTruthy());
  expect(queryByText('Current Trip')).toBeNull();
});

it('moves the note and calls onMoved after confirmation', async () => {
  // Auto-confirm the Alert by invoking the "Move" button's onPress.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const move = (buttons ?? []).find((b) => b.text === 'Move');
    move?.onPress?.();
  });
  mockMoveNote.mockResolvedValue(undefined);

  const { getByText, onMoved } = renderSheet();
  await waitFor(() => expect(getByText('Other Trip')).toBeTruthy());
  fireEvent.press(getByText('Other Trip'));

  await waitFor(() => expect(mockMoveNote).toHaveBeenCalledWith('n1', 't2'));
  expect(onMoved).toHaveBeenCalled();
});

it('does nothing when the confirmation is cancelled', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {}); // user dismisses
  const { getByText, onMoved } = renderSheet();
  await waitFor(() => expect(getByText('Other Trip')).toBeTruthy());
  fireEvent.press(getByText('Other Trip'));

  expect(mockMoveNote).not.toHaveBeenCalled();
  expect(onMoved).not.toHaveBeenCalled();
});
