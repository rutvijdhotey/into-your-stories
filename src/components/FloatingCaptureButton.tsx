import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shadows } from '../theme';

type Props = {
  onPress: () => void;
  onLongPress?: () => void;
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
const FAB_GAP = 16;

export default function FloatingCaptureButton({ onPress, onLongPress }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel="Capture a note. Long press to record instantly."
      style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.fabPressed]}
    >
      <LinearGradient
        colors={['#E08040', '#C0581A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.icon}>＋</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    ...Shadows.fab,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: { opacity: 0.85 },
  icon: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '600' },
});
