import { render } from '@testing-library/react-native';
import ItineraryView from '../ItineraryView';
import type { Itinerary } from '../../services/blogHelpers';

const itinerary: Itinerary = [
  {
    day: 1,
    date: '2026-05-12',
    title: 'Old town & the river',
    stops: [
      {
        time_of_day: 'morning',
        place_name: 'Café Aurora',
        category: 'food',
        description: 'Pastries and strong coffee.',
        lat: 41.1,
        lng: -8.6,
      },
      {
        time_of_day: 'evening',
        place_name: 'Riverside walk',
        category: 'activity',
        description: 'Sunset along the water.',
        lat: null,
        lng: null,
      },
    ],
  },
];

describe('ItineraryView', () => {
  it('renders day header, title, and stops', () => {
    const { getByText } = render(<ItineraryView itinerary={itinerary} />);
    expect(getByText('Day 1')).toBeTruthy();
    expect(getByText('Old town & the river')).toBeTruthy();
    expect(getByText('Café Aurora')).toBeTruthy();
    expect(getByText('Riverside walk')).toBeTruthy();
    expect(getByText('Pastries and strong coffee.')).toBeTruthy();
  });

  it('shows part-of-day labels for stops that have them', () => {
    const { getByText } = render(<ItineraryView itinerary={itinerary} />);
    expect(getByText('Morning')).toBeTruthy();
    expect(getByText('Evening')).toBeTruthy();
  });
});
