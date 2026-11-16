import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { getMatches } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatListTime } from '@/lib/format';
import { signPhotoKeys } from '@/lib/media';
import { colors, radius, spacing } from '@/lib/theme';
import type { MatchRow } from '@/lib/types';

export default function Matches() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const rows = await getMatches();
      const urls = await signPhotoKeys(
        rows.map((row) => row.photo_key).filter((key): key is string => Boolean(key)),
      );
      setMatches(
        rows.map((row) => ({
          ...row,
          photoUrl: row.photo_key ? urls[row.photo_key] ?? null : null,
        })),
      );
      setError(null);
    } catch (e) {
      if (!quiet) setError(errorMessage(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(true), 20_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.kicker}>CONVERSAZIONI</Text>
        <Text style={styles.title}>I tuoi match</Text>
        <Text style={styles.subtitle}>
          {matches.length === 0
            ? 'Quando piaci a qualcuno e ricambi, la conversazione appare qui.'
            : `${matches.length} ${matches.length === 1 ? 'match' : 'match'} attivi`}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.match_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="heart-outline" size={30} color={colors.accentSoft} />
              </View>
              <Text style={styles.emptyTitle}>Nessun match, per ora</Text>
              <Text style={styles.emptyBody}>
                Continua a scoprire: il prossimo match potrebbe essere a un swipe di distanza.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/discover')}
                style={styles.emptyButton}
              >
                <Ionicons name="flame" size={18} color="#fff" />
                <Text style={styles.emptyButtonLabel}>Vai a scoprire</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/chat/[matchId]',
                  params: {
                    matchId: item.match_id,
                    partnerId: item.partner_id,
                    name: item.display_name,
                    photoUrl: item.photoUrl ?? '',
                  },
                })
              }
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Avatar name={item.display_name} uri={item.photoUrl} size={56} />
              <View style={styles.rowText}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Text style={styles.rowTime}>{formatListTime(item.last_message_at)}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text
                    style={[styles.rowPreview, item.unread_count > 0 && styles.rowPreviewUnread]}
                    numberOfLines={1}
                  >
                    {item.last_message ?? 'Ditevi ciao: il primo messaggio spetta a te.'}
                  </Text>
                  {item.unread_count > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeLabel}>
                        {item.unread_count > 9 ? '9+' : item.unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 2,
  },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowPressed: { opacity: 0.8 },
  rowText: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  rowTime: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowPreview: { color: colors.muted, fontSize: 13, flex: 1 },
  rowPreviewUnread: { color: colors.text, fontWeight: '600' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  emptyButtonLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: {
    color: colors.accentSoft,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
