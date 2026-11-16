import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MatchModal } from '@/components/MatchModal';
import { SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';
import { getDeck, swipe } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { signPhotoKeys } from '@/lib/media';
import { colors, radius, spacing } from '@/lib/theme';
import type { DeckProfile, SwipeDecision } from '@/lib/types';

interface MatchInfo {
  matchId: string;
  partnerId: string;
  name: string;
  photoUrl: string | null;
}

export default function Discover() {
  const [cards, setCards] = useState<DeckProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const cardRef = useRef<SwipeCardHandle>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deck = await getDeck();
      const urls = await signPhotoKeys(
        deck.flatMap((profile) => profile.photos.map((photo) => photo.key)),
      );
      setCards(
        deck.map((profile) => ({
          ...profile,
          photoUrls: profile.photos
            .map((photo) => urls[photo.key])
            .filter((url): url is string => Boolean(url)),
        })),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleDecision = useCallback(
    async (decision: SwipeDecision) => {
      const top = cards[0];
      if (!top) return;
      setCards((current) => current.slice(1));
      setError(null);
      try {
        const matchId = await swipe(top.id, decision);
        if (matchId) {
          setMatch({
            matchId,
            partnerId: top.id,
            name: top.display_name,
            photoUrl: top.photoUrls[0] ?? null,
          });
        }
      } catch (e) {
        setError(errorMessage(e));
        setCards((current) => [top, ...current]);
      }
    },
    [cards],
  );

  const next = cards[1] ?? null;
  const current = cards[0] ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SCOPRI</Text>
          <Text style={styles.title}>Persone vicine</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aggiorna i profili"
          onPress={() => void load()}
          style={styles.iconButton}
        >
          <Ionicons name="refresh" size={20} color={colors.text} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.deck}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : current ? (
          <>
            {next ? (
              <View style={styles.nextCard}>
                {next.photoUrls[0] ? (
                  <Image source={{ uri: next.photoUrls[0] }} style={styles.nextImage} />
                ) : (
                  <View style={[styles.nextImage, styles.nextPlaceholder]} />
                )}
              </View>
            ) : null}
            <SwipeCard
              key={current.id}
              ref={cardRef}
              profile={current}
              onDecision={handleDecision}
              isTop
            />
          </>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="flame-outline" size={34} color={colors.accentSoft} />
            </View>
            <Text style={styles.emptyTitle}>Per ora è tutto</Text>
            <Text style={styles.emptyBody}>
              Hai visto tutti i profili disponibili. Torna più tardi: nuove persone arrivano ogni
              giorno.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={styles.emptyButton}
            >
              <Ionicons name="refresh" size={18} color={colors.text} />
              <Text style={styles.emptyButtonLabel}>Aggiorna</Text>
            </Pressable>
          </View>
        )}
      </View>

      {current && !loading ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Passa"
            onPress={() => cardRef.current?.swipe('pass')}
            style={[styles.action, styles.actionPass]}
          >
            <Ionicons name="close" size={32} color={colors.accentSoft} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mi piace"
            onPress={() => cardRef.current?.swipe('like')}
            style={[styles.action, styles.actionLike]}
          >
            <Ionicons name="heart" size={30} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionsSpacer} />
      )}

      <MatchModal
        visible={Boolean(match)}
        name={match?.name ?? ''}
        photoUrl={match?.photoUrl}
        onClose={() => setMatch(null)}
        onChat={() => {
          if (!match) return;
          const currentMatch = match;
          setMatch(null);
          router.push({
            pathname: '/chat/[matchId]',
            params: {
              matchId: currentMatch.matchId,
              partnerId: currentMatch.partnerId,
              name: currentMatch.name,
              photoUrl: currentMatch.photoUrl ?? '',
            },
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 2,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deck: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nextCard: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    transform: [{ scale: 0.96 }, { translateY: 10 }],
    opacity: 0.55,
    borderRadius: radius.lg + 4,
    overflow: 'hidden',
  },
  nextImage: { width: '100%', height: '100%' },
  nextPlaceholder: { backgroundColor: colors.surface },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  actionsSpacer: { height: 74 },
  action: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionPass: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  actionLike: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyButtonLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  error: {
    color: colors.accentSoft,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
