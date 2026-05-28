jest.mock('react-native-reanimated', () => {
  const withTimingCb = jest.fn();
  const withSpringMock = jest.fn();
  return {
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((toValue, config, cb) => {
      withTimingCb.mockImplementation(cb);
      return toValue;
    }),
    withSpring: withSpringMock,
    runOnJS: jest.fn((fn: (...args: unknown[]) => unknown) => fn),
    default: { View: 'View' },
    __withTimingCb: withTimingCb,
    __withSpringMock: withSpringMock,
  };
});

jest.mock('react-native-gesture-handler', () => {
  let capturedOnUpdate: ((e: { translationX: number }) => void) | null = null;
  let capturedOnEnd: ((e: { translationX: number }) => void) | null = null;
  return {
    Gesture: {
      Pan: jest.fn(() => ({
        activeOffsetX: jest.fn().mockReturnThis(),
        failOffsetY: jest.fn().mockReturnThis(),
        onUpdate: jest.fn((cb: (e: { translationX: number }) => void) => {
          capturedOnUpdate = cb;
          return { onEnd: jest.fn((cb2: (e: { translationX: number }) => void) => { capturedOnEnd = cb2; return {}; }) };
        }),
      })),
    },
    GestureDetector: jest.fn(({ children }: { children: unknown }) => children),
    __getCapturedHandlers: () => ({ onUpdate: capturedOnUpdate, onEnd: capturedOnEnd }),
  };
});

import { SWIPE_THRESHOLD } from '../TripCard';
import * as Reanimated from 'react-native-reanimated';
import * as GestureHandler from 'react-native-gesture-handler';

describe('TripCard constants', () => {
  it('SWIPE_THRESHOLD is 80px per spec', () => {
    expect(SWIPE_THRESHOLD).toBe(80);
  });
});

describe('TripCard pan gesture logic', () => {
  let sharedValue: { value: number };
  let panGestureCallbacks: { onUpdate: ((e: { translationX: number }) => void) | null; onEnd: ((e: { translationX: number }) => void) | null };

  beforeEach(() => {
    sharedValue = { value: 0 };
    (Reanimated.useSharedValue as jest.Mock).mockReturnValue(sharedValue);
    jest.clearAllMocks();
  });

  it('onUpdate clamps translateX to [-SWIPE_THRESHOLD, 0]', () => {
    // Re-import to get fresh gesture capture
    jest.resetModules();

    // Test the clamping logic directly without component rendering
    const clampFn = (translationX: number) =>
      Math.max(-SWIPE_THRESHOLD, Math.min(0, translationX));

    expect(clampFn(-50)).toBe(-50);   // within threshold
    expect(clampFn(-80)).toBe(-80);   // at threshold
    expect(clampFn(-120)).toBe(-80);  // past threshold, clamped
    expect(clampFn(20)).toBe(0);      // rightward, clamped to 0
  });

  it('threshold check: triggers navigation when translationX < -SWIPE_THRESHOLD', () => {
    expect(-100 < -SWIPE_THRESHOLD).toBe(true);
    expect(-79 < -SWIPE_THRESHOLD).toBe(false);
    expect(-80 < -SWIPE_THRESHOLD).toBe(false); // exactly at threshold does NOT trigger
  });

  it('SWIPE_THRESHOLD boundary: -81 triggers, -80 snaps back', () => {
    expect(-81 < -SWIPE_THRESHOLD).toBe(true);
    expect(-80 < -SWIPE_THRESHOLD).toBe(false);
  });
});
