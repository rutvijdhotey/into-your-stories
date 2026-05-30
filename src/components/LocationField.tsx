import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  loading?: boolean;
  editable?: boolean;
};

export default function LocationField({
  value,
  onChangeText,
  loading = false,
  editable = true,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.pin}>📍</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable && !loading}
        placeholder={loading ? 'Locating…' : 'Add a location'}
        placeholderTextColor={Colors.textSecondary}
        style={styles.input}
        accessibilityLabel="Note location"
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  pin: { fontSize: 12 },
  input: { flex: 1, fontSize: 12, color: Colors.textPrimary, padding: 0 },
});
