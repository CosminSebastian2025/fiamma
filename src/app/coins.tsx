import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Splash } from '@/components/Splash';
import { getCoinShop, getCoinTransactions, getWallet, startCoinCheckout } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { colors, radius, spacing } from '@/lib/theme';
import type { CoinPack, CoinTransaction } from '@/lib/types';

const REASON_LABEL: Record<CoinTransaction['reason'], string> = {
  purchase: 'Acquisto monete',
  gift_sent: 'Regalo inviato',
  sticker_pack: 'Pacchetto sticker',
  refund: 'Rimborso',
  bonus: 'Bonus di benvenuto',
  admin_adjustment: 'Rettifica',
};

function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2).replace('.', ',');
  return currency.toLowerCase() === 'eur' ? `€ ${amount}` : `${amount} ${currency.toUpperCase()}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CoinsScreen() {
  const { profile, session, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ checkout?: string }>();
  const [balance, setBalance] = useState<number | null>(null);
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [history, setHistory] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkoutDone = params.checkout === 'success';
  const checkoutCanceled = params.checkout === 'cancel';

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const [coins, shop, movements] = await Promise.all([
        getWallet(),
        getCoinShop(),
        getCoinTransactions(40),
      ]);
      setBalance(coins);
      setPacks(shop);
      setHistory(movements);
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

  useEffect(() => {
    if (!checkoutDone) return;
    const timer = setTimeout(() => {
      void load();
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkoutDone, load]);

  const handleBuy = async (pack: CoinPack) => {
    if (Platform.OS !== 'web' || buying) return;
    setBuying(pack.id);
    setError(null);
    try {
      const url = await startCoinCheckout(pack.id);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
      setBuying(null);
    }
  };

  if (authLoading) return <Splash />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Monete</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {checkoutDone ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Pagamento completato. Il saldo si aggiorna entro pochi secondi.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void load()}>
              <Text style={styles.noticeAction}>Aggiorna</Text>
            </Pressable>
          </View>
        ) : null}

        {checkoutCanceled ? (
          <Text style={styles.cancelNote}>Pagamento annullato, nessun addebito.</Text>
        ) : null}

        <View style={styles.balanceCard}>
          <Text style={styles.balanceKicker}>IL TUO SALDO</Text>
          {loading && balance === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.balanceValue}>🪙 {balance ?? 0}</Text>
          )}
          <Text style={styles.balanceHint}>
            Le monete non scadono, non hanno valore monetario e non si trasferiscono.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pacchetti</Text>
          <Text style={styles.sectionNote}>
            {Platform.OS === 'web'
              ? 'Pagamento sicuro con Stripe. Le monete vengono accreditate appena il pagamento risulta completato.'
              : 'Su iOS e Android i pacchetti arriveranno con l’acquisto in-app dello store. Su web puoi acquistare subito con Stripe.'}
          </Text>
          {loading && packs.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.packList}>
              {packs.map((pack) => (
                <View key={pack.id} style={styles.packCard}>
                  <View style={styles.packLeft}>
                    <Text style={styles.packName}>{pack.name}</Text>
                    <Text style={styles.packDescription}>{pack.description}</Text>
                  </View>
                  <View style={styles.packRight}>
                    <Text style={styles.packPrice}>
                      {formatPrice(pack.price_cents, pack.currency)}
                    </Text>
                    {Platform.OS === 'web' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Acquista ${pack.name}`}
                        onPress={() => handleBuy(pack)}
                        disabled={Boolean(buying)}
                        style={[styles.buyButton, buying === pack.id && styles.buyingButton]}
                      >
                        {buying === pack.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.buyLabel}>Acquista</Text>
                        )}
                      </Pressable>
                    ) : (
                      <View style={styles.comingSoon}>
                        <Text style={styles.comingSoonLabel}>In arrivo</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movimenti</Text>
          {loading && history.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : history.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Nessun movimento per ora.</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {history.map((row) => {
                const positive = row.delta > 0;
                return (
                  <View key={row.id} style={styles.historyRow}>
                    <View style={styles.historyText}>
                      <Text style={styles.historyReason}>{REASON_LABEL[row.reason]}</Text>
                      <Text style={styles.historyDate}>{formatDate(row.created_at)}</Text>
                    </View>
                    <Text
                      style={[styles.historyDelta, positive ? styles.positive : styles.negative]}
                    >
                      {positive ? '+' : ''}
                      {row.delta}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Text style={styles.legal}>
          Le monete non sono convertibili in denaro e non sono trasferibili ad altri utenti. I
          regali inviati non sono rimborsabili, salvo i casi previsti dalla legge. Messaggi e
          videocall non consumano mai monete.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceKicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  balanceValue: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  balanceHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 320,
  },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sectionNote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  loadingBox: { paddingVertical: spacing.lg, alignItems: 'center' },
  packList: { gap: spacing.sm },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  packLeft: { flex: 1, gap: 2 },
  packName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  packDescription: { color: colors.muted, fontSize: 12 },
  packRight: { alignItems: 'flex-end', gap: 4 },
  packPrice: { color: colors.text, fontSize: 14, fontWeight: '700' },
  comingSoon: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comingSoonLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  buyButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 84,
    alignItems: 'center',
  },
  buyingButton: { opacity: 0.7 },
  buyLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 },
  noticeAction: { color: colors.success, fontSize: 12, fontWeight: '800' },
  cancelNote: { color: colors.muted, fontSize: 12 },
  historyList: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyText: { flex: 1, gap: 1 },
  historyReason: { color: colors.text, fontSize: 13, fontWeight: '600' },
  historyDate: { color: colors.muted, fontSize: 11 },
  historyDelta: { fontSize: 14, fontWeight: '800' },
  positive: { color: colors.success },
  negative: { color: colors.accentSoft },
  emptyBox: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 13 },
  legal: { color: colors.muted, fontSize: 11, lineHeight: 17, opacity: 0.8 },
  error: { color: colors.accentSoft, fontSize: 13, lineHeight: 19 },
});
