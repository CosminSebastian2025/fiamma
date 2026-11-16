import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { deleteAccount, getMyInterests, getMyPhotos, getWallet } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { ageFromBirthdate, genderLabel } from '@/lib/format';
import { signPhotoKeys } from '@/lib/media';
import { colors, radius, spacing } from '@/lib/theme';
import type { ProfilePhoto } from '@/lib/types';

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [interests, setInterests] = useState<string[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const [ownPhotos, ownInterests, balance] = await Promise.all([
        getMyPhotos(profile.id),
        getMyInterests(profile.id),
        getWallet(),
      ]);
      const urls = await signPhotoKeys(ownPhotos.map((photo) => photo.storage_key));
      setPhotos(ownPhotos);
      setPhotoUrls(urls);
      setInterests(ownInterests);
      setCoins(balance);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const age = ageFromBirthdate(profile.birthdate);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut().catch(() => undefined);
      setConfirmDelete(false);
      router.replace('/sign-in');
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>IL TUO PROFILO</Text>
            <Text style={styles.title}>Ciao, {profile.display_name.split(' ')[0]}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Modifica profilo"
            onPress={() => router.push('/onboarding?edit=1')}
            style={styles.editButton}
          >
            <Ionicons name="pencil" size={18} color={colors.text} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apri il portafoglio monete"
          onPress={() => router.push('/coins')}
          style={({ pressed }) => [styles.walletCard, pressed && styles.walletPressed]}
        >
          <Text style={styles.walletEmoji}>🪙</Text>
          <View style={styles.walletText}>
            <Text style={styles.walletTitle}>Monete Fiamma</Text>
            <Text style={styles.walletBalance}>
              {coins === null ? 'Caricamento...' : `${coins} disponibili`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={styles.card}>
          {loading ? (
            <View style={styles.photoLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {photos.map((photo) => (
                <Image
                  key={photo.id}
                  source={{ uri: photoUrls[photo.storage_key] }}
                  style={styles.photo}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.photoEmpty}>
              <Avatar name={profile.display_name} size={72} />
              <Text style={styles.photoEmptyLabel}>Aggiungi una foto per farti notare.</Text>
            </View>
          )}

          <View style={styles.identity}>
            <Text style={styles.name}>
              {profile.display_name}, {age}
            </Text>
            <Text style={styles.meta}>
              {[profile.city, profile.job_title].filter(Boolean).join(' · ') || 'Nuovo su Fiamma'}
            </Text>
            <Text style={styles.meta}>
              {genderLabel(profile.gender)} · Cerco:{' '}
              {profile.seeking.map(genderLabel).join(', ') || 'tutti'}
            </Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </View>

          {interests.length > 0 ? (
            <View style={styles.interests}>
              {interests.map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <Text style={styles.interestLabel}>{interest}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button label="Modifica profilo" variant="soft" onPress={() => router.push('/onboarding?edit=1')} />
          <Button
            label="Esci"
            variant="ghost"
            onPress={() => {
              void signOut().then(() => router.replace('/sign-in'));
            }}
          />
          <Button label="Elimina account" variant="danger" onPress={() => setConfirmDelete(true)} />
          <Text style={styles.account}>
            {session?.user.email ? `Account: ${session.user.email}` : ''}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Eliminare l’account?</Text>
            <Text style={styles.modalBody}>
              Profilo, foto, match e conversazioni saranno cancellati in modo permanente. Questa
              azione non può essere annullata.
            </Text>
            {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
            <Button
              label="Elimina definitivamente"
              variant="danger"
              onPress={handleDelete}
              loading={deleting}
            />
            <Button label="Annulla" variant="ghost" onPress={() => setConfirmDelete(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  editButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  walletPressed: { opacity: 0.8 },
  walletEmoji: { fontSize: 26 },
  walletText: { flex: 1, gap: 1 },
  walletTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  walletBalance: { color: colors.muted, fontSize: 12 },
  photoLoading: { height: 180, alignItems: 'center', justifyContent: 'center' },
  photoRow: { padding: spacing.sm, gap: spacing.sm },
  photo: {
    width: 128,
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  photoEmpty: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoEmptyLabel: { color: colors.muted, fontSize: 13 },
  identity: { padding: spacing.lg, gap: 4 },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  bio: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  interests: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  interestChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  interestLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  actions: { gap: spacing.sm },
  account: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: spacing.xs },
  error: { color: colors.accentSoft, fontSize: 13, lineHeight: 19 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  modalBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
