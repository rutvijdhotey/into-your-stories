import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

type Props = {
  emoji?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
};

export default function EmptyState({ emoji, title, subtitle, ctaLabel, onCtaPress }: Props) {
  return (
    <View style={styles.container}>
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <Pressable style={styles.cta} onPress={onCtaPress}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  cta: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.input,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  ctaLabel: { ...Typography.body, fontWeight: '800' },
});
