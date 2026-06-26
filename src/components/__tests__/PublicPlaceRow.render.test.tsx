import { render, fireEvent } from '@testing-library/react-native';
import PublicPlaceRow from '../PublicPlaceRow';
import type { PublicPlace } from '../../services/publicPlaceHelpers';

function place(p: Partial<PublicPlace>): PublicPlace {
  return {
    id: 'p', place_key: 'k', place_name: 'Tartine', city: 'SF',
    lat: null, lng: null, coord_count: 0,
    visit_count: 4, rating_sum: 0, rating_count: 0,
    category_counts: {}, dominant_category: 'food',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...p,
  };
}

describe('PublicPlaceRow', () => {
  it('renders name and visit count', () => {
    const { getByText } = render(<PublicPlaceRow place={place({})} onPress={() => {}} />);
    expect(getByText('Tartine')).toBeTruthy();
    expect(getByText('4 visits')).toBeTruthy();
  });

  it('shows the average rating when rated', () => {
    const { getByText } = render(
      <PublicPlaceRow place={place({ rating_sum: 9, rating_count: 2 })} onPress={() => {}} />,
    );
    expect(getByText('★ 4.5')).toBeTruthy();
  });

  it('omits the rating when unrated', () => {
    const { queryByText } = render(<PublicPlaceRow place={place({})} onPress={() => {}} />);
    expect(queryByText(/★/)).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<PublicPlaceRow place={place({})} onPress={onPress} />);
    fireEvent.press(getByText('Tartine'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
