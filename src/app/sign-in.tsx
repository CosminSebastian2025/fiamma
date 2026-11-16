import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Logo } from '@/components/Logo';
import { Splash } from '@/components/Splash';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';

export default function SignIn() {
  const { loading, session, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Splash />;
  if (session) return <Redirect href={profile?.is_onboarded ? '/discover' : '/onboarding'} />;

  const sendCode = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } = await getSupabase().auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: true },
      });
      if (otpError) throw otpError;
      setEmail(clean);
      setStage('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (code.trim().length < 4) {
      setError('Inserisci il codice ricevuto via email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await getSupabase().auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'email',
      });
      if (verifyError) throw verifyError;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Logo subtitle="Incontri che scaldano. Persone vere, a due passi da te." />
          </View>

          <View style={styles.panel}>
            {stage === 'email' ? (
              <>
                <Text style={styles.title}>Entra o crea il tuo profilo</Text>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="nome@esempio.it"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onSubmitEditing={sendCode}
                  returnKeyType="go"
                />
                <Button label="Ricevi il codice" onPress={sendCode} loading={busy} />
              </>
            ) : (
              <>
                <Text style={styles.title}>Controlla la posta</Text>
                <Text style={styles.body}>
                  Abbiamo inviato un codice a {email}. Inseriscilo qui sotto (controlla anche lo
                  spam).
                </Text>
                <Field
                  label="Codice"
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                  onSubmitEditing={verifyCode}
                  returnKeyType="go"
                />
                <Button label="Accedi" onPress={verifyCode} loading={busy} />
                <Button
                  label="Cambia email"
                  variant="ghost"
                  onPress={() => {
                    setStage('email');
                    setCode('');
                    setError(null);
                  }}
                />
                <Button
                  label="Invia di nuovo il codice"
                  variant="ghost"
                  onPress={sendCode}
                  disabled={busy}
                />
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Text style={styles.legal}>
            Continuando confermi di avere almeno 18 anni e accetti termini e privacy policy.
            Orientamento e dati di profilo sono trattati secondo il GDPR.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  hero: { gap: spacing.md, marginTop: spacing.lg },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: colors.accentSoft, fontSize: 13, lineHeight: 19 },
  legal: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
