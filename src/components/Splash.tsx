import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../lib/theme';
import { Logo } from './Logo';

export function Splash() {
  return (
    <View style={styles.container}>
      <Logo />
      <ActivityIndicator color={colors.accent} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  spinner: { marginTop: spacing.sm },
});
