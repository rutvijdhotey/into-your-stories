import { render } from '@testing-library/react-native';
import { Image } from 'react-native';
import type { Trip } from '../../services/tripHelpers';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((toValue: unknown) => toValue),
    withSpring: jest.fn((toValue: unknown) => toValue),
    runOnJS: jest.fn((fn: (...args: unknown[]) => unknown) => fn),
    default: { View },
  };
});

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: jest.fn(() => ({
      activeOffsetX: jest.fn().mockReturnThis(),
      failOffsetY: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
    })),
  },
  GestureDetector: jest.fn(({ children }: { children: unknown }) => children),
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

// Signed-URL resolution has its own suite (signedPhotoUrls.test.ts); here a
// reference resolves to itself so these tests stay about what the card renders.
jest.mock('../../hooks/useSignedPhotos', () => ({
  useSignedPhotoUrl: (ref: string | null | undefined) => ref ?? null,
  useSignedPhotoUrls: (refs: string[]) => Object.fromEntries(refs.map((r) => [r, r])),
}));

import TripCard from '../TripCard';

const baseTrip: Trip = {
  id: 't1',
  user_id: 'u1',
  name: 'Paris',
  destinations: ['Paris'],
  start_date: null,
  end_date: null,
  status: 'active',
  note_count: 0,
  cover_photo_url: null,
  created_at: '2026-01-01T00:00:00Z',
} as Trip;

const noop = () => {};

describe('TripCard cover photo', () => {
  it('renders the cover photo as the card background when cover_photo_url is set', () => {
    const trip = { ...baseTrip, cover_photo_url: 'https://example.com/cover.jpg?v=1' };
    const { UNSAFE_queryAllByType } = render(
      <TripCard trip={trip} onPress={noop} onLongPress={noop} />,
    );

    const images = UNSAFE_queryAllByType(Image);
    const cover = images.find(
      (img) => (img.props.source as { uri?: string } | undefined)?.uri === trip.cover_photo_url,
    );
    expect(cover).toBeTruthy();
    expect(cover!.props.resizeMode).toBe('cover');
  });

  it('renders no cover Image (gradient only) when cover_photo_url is null', () => {
    const { UNSAFE_queryAllByType } = render(
      <TripCard trip={baseTrip} onPress={noop} onLongPress={noop} />,
    );

    const images = UNSAFE_queryAllByType(Image);
    expect(images.length).toBe(0);
  });
});
