import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../theme';

type Props = {
  value: number | null;
  onChange?: (value: number | null) => void;
  readOnly?: boolean;
  size?: 'small' | 'medium';
};

const STARS = [1, 2, 3, 4, 5];

export default function StarRating({ value, onChange, readOnly = false, size = 'medium' }: Props) {
  const fontSize = size === 'small' ? 13 : 26;
  const filled = value ?? 0;

  if (readOnly) {
    return (
      <View style={styles.row}>
        {STARS.map((n) => (
          <Text key={n} style={[styles.star, { fontSize }, n <= filled ? styles.on : styles.off]}>
            ★
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {STARS.map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${n} stars`}
          hitSlop={6}
          // Tapping the current rating clears it (undo without a separate button).
          onPress={() => onChange?.(value === n ? null : n)}
        >
          <Text style={[styles.star, { fontSize }, n <= filled ? styles.on : styles.off]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  star: {},
  on: { color: Colors.accent },
  off: { color: Colors.border },
});
