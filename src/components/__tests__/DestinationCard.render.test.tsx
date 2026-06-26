import { render, fireEvent } from '@testing-library/react-native';
import DestinationCard from '../DestinationCard';
import type { Destination } from '../../services/publicPlaceHelpers';

const dest: Destination = {
  city: 'Paris',
  place_count: 3,
  total_visits: 7,
  categories: ['food', 'activity'],
};

describe('DestinationCard', () => {
  it('renders city, place count and visit count', () => {
    const { getByText } = render(<DestinationCard destination={dest} onPress={() => {}} />);
    expect(getByText('Paris')).toBeTruthy();
    expect(getByText('3 places · 7 visits')).toBeTruthy();
  });

  it('singularizes one place / one visit', () => {
    const one: Destination = { city: 'Rome', place_count: 1, total_visits: 1, categories: [] };
    const { getByText } = render(<DestinationCard destination={one} onPress={() => {}} />);
    expect(getByText('1 place · 1 visit')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<DestinationCard destination={dest} onPress={onPress} />);
    fireEvent.press(getByText('Paris'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
