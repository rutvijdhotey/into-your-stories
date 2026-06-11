const mockSingle = jest.fn();
const mockTripsSelect = jest.fn();

function makeNotesQuery(result: { data: unknown[] | null; error: unknown }) {
  const builder: any = {
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    not: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockNotesSelect = jest.fn();
const mockFrom = jest.fn((table: string) =>
  table === 'trips' ? { select: mockTripsSelect } : { select: mockNotesSelect },
);

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

const mockGeocode = jest.fn();
jest.mock('../../services/locationService', () => ({
  geocodeLocation: (...a: unknown[]) => mockGeocode(...a),
}));

import { getTripAnchors, clearAnchorCache } from '../tripAnchorService';

function mockTrip(destinations: string[] | null) {
  mockTripsSelect.mockReturnValue({
    eq: jest.fn(() => ({ single: mockSingle })),
  });
  mockSingle.mockResolvedValue({ data: destinations === null ? null : { destinations }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAnchorCache();
  mockNotesSelect.mockReturnValue(makeNotesQuery({ data: [], error: null }));
});

describe('getTripAnchors', () => {
  it('geocodes each destination into an anchor', async () => {
    mockTrip(['Paris', 'Nice']);
    mockGeocode
      .mockResolvedValueOnce({ lat: 48.85, lng: 2.35 })
      .mockResolvedValueOnce({ lat: 43.7, lng: 7.27 });

    await expect(getTripAnchors('trip-1')).resolves.toEqual([
      { lat: 48.85, lng: 2.35 },
      { lat: 43.7, lng: 7.27 },
    ]);
    expect(mockGeocode).toHaveBeenCalledWith('Paris');
    expect(mockGeocode).toHaveBeenCalledWith('Nice');
  });

  it('skips destinations that fail to geocode', async () => {
    mockTrip(['Paris', 'Atlantis']);
    mockGeocode
      .mockResolvedValueOnce({ lat: 48.85, lng: 2.35 })
      .mockResolvedValueOnce(null);

    await expect(getTripAnchors('trip-1')).resolves.toEqual([{ lat: 48.85, lng: 2.35 }]);
  });

  it('includes trusted (exif/manual) note coordinates as anchors', async () => {
    mockTrip([]);
    mockNotesSelect.mockReturnValue(
      makeNotesQuery({ data: [{ lat: 48.8, lng: 2.29 }, { lat: 48.86, lng: 2.34 }], error: null }),
    );

    await expect(getTripAnchors('trip-1')).resolves.toEqual([
      { lat: 48.8, lng: 2.29 },
      { lat: 48.86, lng: 2.34 },
    ]);
  });

  it('returns [] when there are no destinations and no trusted notes', async () => {
    mockTrip([]);
    await expect(getTripAnchors('trip-1')).resolves.toEqual([]);
  });

  it('memoizes non-empty results per trip (one fetch for two calls)', async () => {
    mockTrip(['Paris']);
    mockGeocode.mockResolvedValueOnce({ lat: 48.85, lng: 2.35 });

    await getTripAnchors('trip-1');
    await getTripAnchors('trip-1');

    expect(mockFrom).toHaveBeenCalledTimes(2); // trips + notes, once each
  });

  it('does NOT cache an empty result (offline retry stays possible)', async () => {
    mockTrip(['Paris']);
    mockGeocode.mockResolvedValueOnce(null); // offline

    await expect(getTripAnchors('trip-1')).resolves.toEqual([]);

    mockTrip(['Paris']);
    mockGeocode.mockResolvedValueOnce({ lat: 48.85, lng: 2.35 });
    await expect(getTripAnchors('trip-1')).resolves.toEqual([{ lat: 48.85, lng: 2.35 }]);
  });
});
