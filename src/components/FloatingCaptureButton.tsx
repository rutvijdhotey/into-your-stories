import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme';

type Props = {
  onPress: () => void;
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
const FAB_GAP = 16;

export default function FloatingCaptureButton({ onPress }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Capture a note"
      style={({ pressed }) => [
        styles.fab,
        { bottom },
        pressed && styles.fabPressed,
      ]}
    >
      <Text style={styles.icon}>＋</Text>
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
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPressed: { opacity: 0.85 },
  icon: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '600' },
});
