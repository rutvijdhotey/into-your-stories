import { Pressable, Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Spacing } from '../theme';

// Subtle 2-stop warm gradient for primary CTAs only (ties into the app's
// gradient-heavy headers). Secondary/destructive buttons stay flat outlines.
export const PRIMARY_GRADIENT = ['#C8703A', '#A85A2A'] as const;

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Outer layout (flex, margins, positioning). */
  style?: StyleProp<ViewStyle>;
  /** Gradient fill overrides (padding, borderRadius). */
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function GradientButton({
  label,
  onPress,
  disabled = false,
  style,
  contentStyle,
  textStyle,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [style, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={PRIMARY_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, contentStyle]}
      >
        <Text style={[styles.label, textStyle]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
