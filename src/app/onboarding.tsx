import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Logo } from '@/components/Logo';
import { Splash } from '@/components/Splash';
import {
  addPhoto,
  completeOnboarding,
  getInterestCatalog,
  getMyInterests,
  getMyPhotos,
  removePhoto,
  saveProfile,
  setInterests,
  updateLocation,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { ageFromBirthdate, formatBirthdate, parseBirthdate } from '@/lib/format';
import { pickImage, signPhotoKeys, uploadPhoto, type PreparedImage } from '@/lib/media';
import { colors, radius, spacing } from '@/lib/theme';
import type { Gender, Interest, ProfileDraft, ProfilePhoto } from '@/lib/types';

const genderOptions: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Donna' },
  { value: 'man', label: 'Uomo' },
  { value: 'nonbinary', label: 'Non binario' },
];

const seekOptions: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Donne' },
  { value: 'man', label: 'Uomini' },
  { value: 'nonbinary', label: 'Persone non binarie' },
];

const emptyDraft: ProfileDraft = {
  displayName: '',
  birthdate: '',
  gender: 'woman',
  seeking: ['woman', 'man', 'nonbinary'],
  bio: '',
  city: '',
  jobTitle: '',
};

export default function Onboarding() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editing = params.edit === '1';
  const { session, profile, loading, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [birthdateInput, setBirthdateInput] = useState('');
  const [catalog, setCatalog] = useState<Interest[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<PreparedImage[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;

    (async () => {
      try {
        const items = await getInterestCatalog();
        if (!active) return;
        setCatalog(items);

        if (profile) {
          setDraft({
            displayName: profile.display_name,
            birthdate: profile.birthdate,
            gender: profile.gender,
            seeking: profile.seeking,
            bio: profile.bio,
            city: profile.city ?? '',
            jobTitle: profile.job_title ?? '',
          });
          setBirthdateInput(formatBirthdate(profile.birthdate));

          const [ownPhotos, ownInterests] = await Promise.all([
            getMyPhotos(profile.id),
            getMyInterests(profile.id),
          ]);
          const urls = await signPhotoKeys(ownPhotos.map((photo) => photo.storage_key));
          if (!active) return;
          setPhotos(ownPhotos);
          setPhotoUrls(urls);
          setSelectedInterests(ownInterests);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setInitialized(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile, session]);

  if (!session) return <Redirect href="/sign-in" />;
  if (profile?.is_onboarded && !editing) return <Redirect href="/discover" />;
  if (loading || !initialized) return <Splash />;

  const toggleSeeking = (value: Gender) => {
    setDraft((current) => ({
      ...current,
      seeking: current.seeking.includes(value)
        ? current.seeking.filter((item) => item !== value)
        : [...current.seeking, value],
    }));
  };

  const toggleInterest = (label: string) => {
    setError(null);
    setSelectedInterests((current) => {
      if (current.includes(label)) return current.filter((item) => item !== label);
      if (current.length >= 15) {
        setError('Puoi scegliere al massimo 15 interessi.');
        return current;
      }
      return [...current, label];
    });
  };

  const goToPhotos = () => {
    const iso = parseBirthdate(birthdateInput);
    if (draft.displayName.trim().length < 2) {
      setError('Inserisci il tuo nome (almeno 2 caratteri).');
      return;
    }
    if (!iso) {
      setError('Data di nascita non valida: usa il formato GG/MM/AAAA.');
      return;
    }
    if (ageFromBirthdate(iso) < 18) {
      setError('Devi avere almeno 18 anni per usare Fiamma.');
      return;
    }
    if (draft.seeking.length === 0) {
      setError('Scegli almeno una preferenza di ricerca.');
      return;
    }
    setDraft((current) => ({ ...current, birthdate: iso }));
    setError(null);
    setStep(1);
  };

  const handleAddPhoto = async () => {
    if (photos.length + pendingImages.length >= 6) {
      setError('Puoi caricare al massimo 6 foto.');
      return;
    }
    try {
      const image = await pickImage();
      if (image) setPendingImages((current) => [...current, image]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleRemoveExisting = async (photo: ProfilePhoto) => {
    try {
      await removePhoto(photo.id);
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Permesso posizione negato: potrai attivarlo dalle impostazioni di sistema.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      let city: string | null = null;
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        city = places[0]?.city ?? places[0]?.subregion ?? null;
      } catch {
        city = null;
      }
      await updateLocation(position.coords.latitude, position.coords.longitude, city);
      if (city) setDraft((current) => ({ ...current, city }));
      setLocationLabel(city ? `Posizione attiva · ${city}` : 'Posizione attiva');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (photos.length + pendingImages.length === 0) {
      setError('Aggiungi almeno una foto per continuare.');
      return;
    }
    const iso = parseBirthdate(birthdateInput);
    if (!iso || ageFromBirthdate(iso) < 18) {
      setError('Controlla la data di nascita.');
      setStep(0);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        ...draft,
        displayName: draft.displayName.trim(),
        birthdate: iso,
        bio: draft.bio.trim(),
      });
      await setInterests(selectedInterests);

      let position = photos.length;
      for (const image of pendingImages) {
        const key = await uploadPhoto(session.user.id, image);
        await addPhoto(key, position);
        position += 1;
      }

      await completeOnboarding();
      await refreshProfile();
      router.replace(editing ? '/profile' : '/discover');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const totalPhotos = photos.length + pendingImages.length;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerTop}>
              {step === 1 || editing ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Indietro"
                  onPress={() => (step === 1 ? setStep(0) : router.back())}
                  style={styles.back}
                >
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </Pressable>
              ) : (
                <Logo />
              )}
              <Text style={styles.stepLabel}>{step === 0 ? 'Passo 1 di 2' : 'Passo 2 di 2'}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: step === 0 ? '50%' : '100%' }]} />
            </View>
            <Text style={styles.title}>
              {step === 0 ? 'Raccontaci di te' : 'Le tue foto'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 0
                ? 'Bastano poche informazioni. Puoi cambiarle quando vuoi.'
                : 'La prima foto è quella che vedranno per prima. Meglio un volto sorridente.'}
            </Text>
          </View>

          {step === 0 ? (
            <View style={styles.section}>
              <Field
                label="Nome"
                value={draft.displayName}
                onChangeText={(value) => setDraft((current) => ({ ...current, displayName: value }))}
                placeholder="Come ti chiami?"
                maxLength={40}
              />
              <Field
                label="Data di nascita"
                value={birthdateInput}
                onChangeText={setBirthdateInput}
                placeholder="GG/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                hint="Devi avere almeno 18 anni. L'età sarà visibile sul profilo."
              />

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Genere</Text>
                <View style={styles.chips}>
                  {genderOptions.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={draft.gender === option.value}
                      onPress={() => setDraft((current) => ({ ...current, gender: option.value }))}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Cerco</Text>
                <View style={styles.chips}>
                  {seekOptions.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={draft.seeking.includes(option.value)}
                      onPress={() => toggleSeeking(option.value)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Field
                    label="Città"
                    value={draft.city}
                    onChangeText={(value) => setDraft((current) => ({ ...current, city: value }))}
                    placeholder="Milano"
                    maxLength={60}
                  />
                </View>
                <View style={styles.rowItem}>
                  <Field
                    label="Lavoro"
                    value={draft.jobTitle}
                    onChangeText={(value) => setDraft((current) => ({ ...current, jobTitle: value }))}
                    placeholder="Designer"
                    maxLength={60}
                  />
                </View>
              </View>

              <Field
                label="Bio"
                value={draft.bio}
                onChangeText={(value) => setDraft((current) => ({ ...current, bio: value }))}
                placeholder="Due righe su di te: cosa ti fa ridere, dove vorresti andare..."
                multiline
                numberOfLines={4}
                maxLength={500}
                style={styles.bioInput}
                hint={`${draft.bio.length}/500`}
              />

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Interessi</Text>
                <Text style={styles.groupHint}>Scegline fino a 15.</Text>
                <View style={styles.chips}>
                  {catalog.map((interest) => (
                    <Chip
                      key={interest.id}
                      label={interest.label}
                      selected={selectedInterests.includes(interest.label)}
                      onPress={() => toggleInterest(interest.label)}
                    />
                  ))}
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Continua" onPress={goToPhotos} />
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.photoGrid}>
                {photos.map((photo) => (
                  <View key={photo.id} style={styles.photoTile}>
                    <Image
                      source={{ uri: photoUrls[photo.storage_key] }}
                      style={styles.photoImage}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Rimuovi foto"
                      onPress={() => handleRemoveExisting(photo)}
                      style={styles.removePhoto}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {pendingImages.map((image, index) => (
                  <View key={`${image.uri}-${index}`} style={styles.photoTile}>
                    <Image source={{ uri: image.uri }} style={styles.photoImage} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Rimuovi foto"
                      onPress={() =>
                        setPendingImages((current) => current.filter((_, i) => i !== index))
                      }
                      style={styles.removePhoto}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {totalPhotos < 6 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Aggiungi foto"
                    onPress={handleAddPhoto}
                    style={[styles.photoTile, styles.addPhoto]}
                  >
                    <Ionicons name="add" size={26} color={colors.muted} />
                    <Text style={styles.addPhotoLabel}>Aggiungi</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.locationCard}>
                <Ionicons name="location-outline" size={22} color={colors.accentSoft} />
                <View style={styles.locationText}>
                  <Text style={styles.locationTitle}>
                    {locationLabel ?? 'Attiva la posizione'}
                  </Text>
                  <Text style={styles.locationSubtitle}>
                    Serve solo per mostrarti persone vicine. Le coordinate esatte non sono mai
                    condivise.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleLocation}
                  disabled={locating}
                  style={styles.locationButton}
                >
                  {locating ? (
                    <Text style={styles.locationButtonLabel}>...</Text>
                  ) : (
                    <Ionicons name="navigate" size={18} color={colors.text} />
                  )}
                </Pressable>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button
                label={editing ? 'Salva modifiche' : 'Inizia a scoprire'}
                onPress={handleSave}
                loading={saving}
              />
              <Text style={styles.footerNote}>
                Caricando una foto dichiari di averne i diritti. I metadati EXIF, inclusa la
                posizione GPS, vengono rimossi prima dell’upload.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
  },
  header: { gap: spacing.sm },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  section: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  groupHint: { color: colors.muted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoTile: {
    width: '31.5%',
    aspectRatio: 0.78,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  photoImage: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  locationText: { flex: 1, gap: 2 },
  locationTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  locationSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  locationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonLabel: { color: colors.text, fontWeight: '700' },
  error: { color: colors.accentSoft, fontSize: 13, lineHeight: 19 },
  footerNote: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
