import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/lib/theme';
import { Logo } from './Logo';

export function SetupNotice() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Logo subtitle="Manca la configurazione di Supabase." />
        <View style={styles.card}>
          <Text style={styles.step}>1. Crea il file .env</Text>
          <Text style={styles.code}>cp .env.example .env</Text>
          <Text style={styles.step}>2. Incolla URL e anon key</Text>
          <Text style={styles.body}>
            Le trovi in Supabase → Project Settings → API. Usa solo la chiave «anon public»:
            la service role key non deve mai finire nell’app.
          </Text>
          <Text style={styles.step}>3. Riavvia il server</Text>
          <Text style={styles.code}>npx expo start --clear</Text>
        </View>
        <Text style={styles.footer}>
          La guida completa è nel README: migrazioni, foto locali e funzioni Edge.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  step: { color: colors.text, fontWeight: '700', fontSize: 15, marginTop: spacing.sm },
  code: {
    color: colors.accentSoft,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  footer: { color: colors.muted, fontSize: 13, textAlign: 'center' },
});
