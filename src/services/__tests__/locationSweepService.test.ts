const mockNoteEq = jest.fn();
const mockNoteUpdate = jest.fn(() => ({ eq: mockNoteEq }));

function makeQuery(result: { data: unknown[] | null; error: unknown }) {
  const builder: any = {
    eq: jest.fn(() => builder),
    not: jest.fn(() => builder),
    or: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockTripsSelect = jest.fn();
const mockNotesSelect = jest.fn();
const mockFrom = jest.fn((table: string) =>
  table === 'trips'
    ? { select: mockTripsSelect }
    : { select: mockNotesSelect, update: mockNoteUpdate },
);

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

const mockGetTripAnchors = jest.fn();
jest.mock('../../services/tripAnchorService', () => ({
  getTripAnchors: (...a: unknown[]) => mockGetTripAnchors(...a),
}));

const mockReverseGeocodePlace = jest.fn();
jest.mock('../../services/locationService', () => ({
  reverseGeocodePlace: (...a: unknown[]) => mockReverseGeocodePlace(...a),
}));

import { sweepNoteLocations } from '../locationSweepService';

const PARIS = { lat: 48.8566, lng: 2.3522 };
const MTV = { lat: 37.3861, lng: -122.0839 };

beforeEach(() => {
  jest.clearAllMocks();
  mockNoteEq.mockResolvedValue({ error: null });
  mockReverseGeocodePlace.mockResolvedValue({ city: 'Paris', placeName: 'Paris' });
});

describe('sweepNoteLocations', () => {
  it('rewrites an outlier gps/null note to the nearest anchor as inferred', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: MTV.lat, lng: MTV.lng, location_source: null }], error: null }),
    );

    await expect(sweepNoteLocations('user-1')).resolves.toBe(1);

    expect(mockReverseGeocodePlace).toHaveBeenCalledWith(PARIS.lat, PARIS.lng);
    expect(mockNoteUpdate).toHaveBeenCalledWith({
      lat: PARIS.lat,
      lng: PARIS.lng,
      city: 'Paris',
      place_name: 'Paris',
      location_source: 'inferred',
    });
    expect(mockNoteEq).toHaveBeenCalledWith('id', 'n1');
  });

  it('upgrades a plausible null-source note to gps without touching coordinates', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: 48.85, lng: 2.35, location_source: null }], error: null }),
    );

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);

    expect(mockNoteUpdate).toHaveBeenCalledWith({ location_source: 'gps' });
    expect(mockNoteEq).toHaveBeenCalledWith('id', 'n1');
  });

  it('leaves a plausible gps-source note completely alone', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: 48.85, lng: 2.35, location_source: 'gps' }], error: null }),
    );

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
    expect(mockNoteUpdate).not.toHaveBeenCalled();
  });

  it('skips trips with no anchors entirely', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([]);

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
    expect(mockNotesSelect).not.toHaveBeenCalled();
  });

  it('does not count a note whose update fails (retried next launch)', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: MTV.lat, lng: MTV.lng, location_source: 'gps' }], error: null }),
    );
    mockNoteEq.mockResolvedValueOnce({ error: new Error('write failed') });

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
  });

  it('returns 0 on a trips query error', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: null, error: new Error('boom') }));
    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
  });
});
