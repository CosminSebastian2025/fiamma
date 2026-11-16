import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { blockUser, reportUser } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { colors, radius, spacing } from '@/lib/theme';
import type { ReportReason } from '@/lib/types';
import { Button } from './Button';
import { Chip } from './Chip';
import { Field } from './Field';

interface Props {
  visible: boolean;
  partnerId: string;
  partnerName: string;
  onClose: () => void;
  onDone: () => void;
}

const reasons: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Molestie' },
  { value: 'fake_profile', label: 'Profilo falso' },
  { value: 'underage', label: 'Minorenne' },
  { value: 'nudity', label: 'Nudità' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Altro' },
];

type Mode = 'menu' | 'block' | 'report';

export function SafetySheet({ visible, partnerId, partnerName, onClose, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [blockToo, setBlockToo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode('menu');
    setReason(null);
    setDetails('');
    setBlockToo(true);
    setBusy(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const finish = () => {
    reset();
    onDone();
  };

  const handleBlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await blockUser(partnerId);
      finish();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (!reason) {
      setError('Scegli un motivo per la segnalazione.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reportUser(partnerId, reason, details, blockToo);
      finish();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {mode === 'menu' ? (
            <>
              <Text style={styles.title}>Sicurezza</Text>
              <Text style={styles.subtitle}>
                Il tuo benessere viene prima di tutto. Puoi bloccare o segnalare {partnerName} in
                qualsiasi momento.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMode('block')}
                style={styles.row}
              >
                <Ionicons name="hand-left-outline" size={22} color={colors.accentSoft} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Blocca {partnerName}</Text>
                  <Text style={styles.rowSubtitle}>
                    Non potrà più vederti né scriverti. Il match sparisce dalla lista.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMode('report')}
                style={styles.row}
              >
                <Ionicons name="flag-outline" size={22} color={colors.warning} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Segnala {partnerName}</Text>
                  <Text style={styles.rowSubtitle}>
                    Invia il profilo alla moderazione. Puoi bloccare anche in automatico.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <Button label="Chiudi" variant="ghost" onPress={close} />
            </>
          ) : null}

          {mode === 'block' ? (
            <>
              <Text style={styles.title}>Bloccare {partnerName}?</Text>
              <Text style={styles.subtitle}>
                La conversazione non sarà più accessibile e non potrete ricontattarvi. L’azione è
                immediata.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Blocca" variant="danger" onPress={handleBlock} loading={busy} />
              <Button label="Annulla" variant="ghost" onPress={() => setMode('menu')} />
            </>
          ) : null}

          {mode === 'report' ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={styles.title}>Segnala {partnerName}</Text>
              <Text style={styles.subtitle}>
                La segnalazione è anonima per l’altra persona. Grazie per aiutarci a tenere Fiamma
                sicura.
              </Text>
              <View style={styles.chips}>
                {reasons.map((item) => (
                  <Chip
                    key={item.value}
                    label={item.label}
                    selected={reason === item.value}
                    onPress={() => setReason(item.value)}
                  />
                ))}
              </View>
              <Field
                label="Dettagli (facoltativo)"
                value={details}
                onChangeText={setDetails}
                placeholder="Cosa è successo?"
                multiline
                numberOfLines={3}
                maxLength={1000}
                style={styles.details}
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: blockToo }}
                onPress={() => setBlockToo((current) => !current)}
                style={styles.checkboxRow}
              >
                <Ionicons
                  name={blockToo ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={blockToo ? colors.accent : colors.muted}
                />
                <Text style={styles.checkboxLabel}>Blocca anche questo utente</Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Invia segnalazione" onPress={handleReport} loading={busy} />
              <Button label="Annulla" variant="ghost" onPress={() => setMode('menu')} />
            </ScrollView>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 8,
    gap: spacing.md,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  form: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  details: { minHeight: 88, textAlignVertical: 'top' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkboxLabel: { color: colors.text, fontSize: 14 },
  error: { color: colors.accentSoft, fontSize: 13, lineHeight: 19 },
});
