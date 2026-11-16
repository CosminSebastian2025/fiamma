import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.wordmark}>
        fiamma<Text style={styles.dot}>.</Text>
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  wordmark: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  dot: { color: colors.accent },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21 },
});
