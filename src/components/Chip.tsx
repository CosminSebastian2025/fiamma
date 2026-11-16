import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectedLabel: { color: '#fff' },
});
