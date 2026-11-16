import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const blocked = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        variants[variant],
        pressed && !blocked && styles.pressed,
        blocked && styles.blocked,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.text} />
      ) : (
        <Text style={[styles.label, labels[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pressed: { opacity: 0.82 },
  blocked: { opacity: 0.5 },
});

const variants = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  soft: { backgroundColor: colors.surfaceAlt },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
});

const labels = StyleSheet.create({
  primary: { color: '#fff' },
  soft: { color: colors.text },
  ghost: { color: colors.text },
  danger: { color: colors.accent },
});
