jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn(() => ({})),
  withTiming: jest.fn(),
  withSpring: jest.fn(),
  runOnJS: jest.fn((fn: unknown) => fn),
  default: { View: 'View' },
}));
jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: jest.fn(() => ({
      activeOffsetX: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
    })),
  },
  GestureDetector: jest.fn(({ children }: { children: unknown }) => children),
}));

import { SWIPE_THRESHOLD } from '../TripCard';

describe('TripCard constants', () => {
  it('SWIPE_THRESHOLD is 80px per spec', () => {
    expect(SWIPE_THRESHOLD).toBe(80);
  });
});
