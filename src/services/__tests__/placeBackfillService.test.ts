const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

function makeSelectQuery(result: { data: unknown[] | null; error: unknown }) {
  const builder: any = {
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    not: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockSelect = jest.fn();
const mockFrom = jest.fn((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('../../services/locationService', () => ({
  reverseGeocodePlace: jest.fn(),
}));

import { backfillPlaceNames } from '../placeBackfillService';
import { reverseGeocodePlace } from '../../services/locationService';

const mockReverseGeocodePlace = reverseGeocodePlace as jest.MockedFunction<typeof reverseGeocodePlace>;

beforeEach(() => {
  jest.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
});

describe('backfillPlaceNames', () => {
  it('returns 0 and makes no updates when there are no eligible notes', async () => {
    mockSelect.mockReturnValue(makeSelectQuery({ data: [], error: null }));

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 0 and makes no updates on a query error', async () => {
    mockSelect.mockReturnValue(makeSelectQuery({ data: null, error: new Error('boom') }));

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('resolves place_name (and city when missing) for each eligible note', async () => {
    mockSelect.mockReturnValue(
      makeSelectQuery({
        data: [
          { id: 'n1', lat: 48.85, lng: 2.35, city: 'Paris' },
          { id: 'n2', lat: 35.66, lng: 139.7, city: null },
        ],
        error: null,
      }),
    );
    mockReverseGeocodePlace
      .mockResolvedValueOnce({ city: 'Paris', placeName: 'Eiffel Tower' })
      .mockResolvedValueOnce({ city: 'Shibuya', placeName: 'Shibuya Crossing' });

    await expect(backfillPlaceNames('user-1')).resolves.toBe(2);

    expect(mockReverseGeocodePlace).toHaveBeenNthCalledWith(1, 48.85, 2.35);
    expect(mockReverseGeocodePlace).toHaveBeenNthCalledWith(2, 35.66, 139.7);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { place_name: 'Eiffel Tower', city: 'Paris' });
    expect(mockEq).toHaveBeenNthCalledWith(1, 'id', 'n1');
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { place_name: 'Shibuya Crossing', city: 'Shibuya' });
    expect(mockEq).toHaveBeenNthCalledWith(2, 'id', 'n2');
  });

  it('skips a note (no update, not counted) when reverse geocoding yields no place name', async () => {
    mockSelect.mockReturnValue(
      makeSelectQuery({
        data: [{ id: 'n1', lat: 0, lng: 0, city: null }],
        error: null,
      }),
    );
    mockReverseGeocodePlace.mockResolvedValueOnce({ city: null, placeName: null });

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not count a note whose update fails', async () => {
    mockSelect.mockReturnValue(
      makeSelectQuery({
        data: [{ id: 'n1', lat: 48.85, lng: 2.35, city: 'Paris' }],
        error: null,
      }),
    );
    mockReverseGeocodePlace.mockResolvedValueOnce({ city: 'Paris', placeName: 'Eiffel Tower' });
    mockEq.mockResolvedValueOnce({ error: new Error('write failed') });

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);
  });
});
