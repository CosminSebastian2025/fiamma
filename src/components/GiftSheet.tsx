import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getGiftCatalog,
  getStickerCatalog,
  getWallet,
  purchaseStickerPack,
  sendGift,
  sendSticker,
} from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { colors, radius, spacing } from '@/lib/theme';
import type { Gift, Message, StickerPack } from '@/lib/types';

interface Props {
  visible: boolean;
  matchId: string;
  onClose: () => void;
  onSent: (message: Message) => void;
  onOpenWallet: () => void;
}

type Tab = 'gifts' | 'stickers';

export function GiftSheet({ visible, matchId, onClose, onSent, onOpenWallet }: Props) {
  const [tab, setTab] = useState<Tab>('gifts');
  const [balance, setBalance] = useState(0);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    Promise.all([getWallet(), getGiftCatalog(), getStickerCatalog()])
      .then(([coins, giftRows, packRows]) => {
        if (!active) return;
        setBalance(coins);
        setGifts(giftRows);
        setPacks(packRows);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const handleGift = async (gift: Gift) => {
    if (busy) return;
    setBusy(gift.id);
    setError(null);
    try {
      const message = await sendGift(matchId, gift.id);
      setBalance((current) => current - gift.coin_cost);
      onSent(message);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSticker = async (stickerId: string) => {
    if (busy) return;
    setBusy(stickerId);
    setError(null);
    try {
      const message = await sendSticker(matchId, stickerId);
      onSent(message);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handleUnlock = async (pack: StickerPack) => {
    if (busy) return;
    setBusy(pack.pack_id);
    setError(null);
    try {
      const next = await purchaseStickerPack(pack.pack_id);
      setBalance(next);
      setPacks(await getStickerCatalog());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Text style={styles.title}>Regali & sticker</Text>
              <Text style={styles.subtitle}>I messaggi restano sempre gratuiti</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ricarica monete"
              onPress={onOpenWallet}
              style={styles.balanceChip}
            >
              <Text style={styles.balanceText}>🪙 {balance}</Text>
              <Ionicons name="add" size={16} color={colors.accent} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTab('gifts')}
              style={[styles.tab, tab === 'gifts' && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, tab === 'gifts' && styles.tabLabelActive]}>
                Regali
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTab('stickers')}
              style={[styles.tab, tab === 'stickers' && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, tab === 'stickers' && styles.tabLabelActive]}>
                Sticker
              </Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {tab === 'gifts' ? (
                <View style={styles.giftGrid}>
                  {gifts.map((gift) => {
                    const affordable = balance >= gift.coin_cost;
                    return (
                      <Pressable
                        key={gift.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Invia ${gift.name}, ${gift.coin_cost} monete`}
                        onPress={() => handleGift(gift)}
                        disabled={!affordable || Boolean(busy)}
                        style={({ pressed }) => [
                          styles.giftCard,
                          pressed && affordable && styles.pressed,
                          !affordable && styles.disabled,
                        ]}
                      >
                        {busy === gift.id ? (
                          <ActivityIndicator color={colors.accent} />
                        ) : (
                          <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                        )}
                        <Text style={styles.giftName} numberOfLines={1}>
                          {gift.name}
                        </Text>
                        <Text style={styles.giftCost}>🪙 {gift.coin_cost}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.packList}>
                  {packs.map((pack) => (
                    <View key={pack.pack_id} style={styles.packCard}>
                      <View style={styles.packHeader}>
                        <Text style={styles.packEmoji}>{pack.emoji}</Text>
                        <View style={styles.packTitle}>
                          <Text style={styles.packName}>{pack.name}</Text>
                          <Text style={styles.packMeta}>
                            {pack.unlocked
                              ? 'Sbloccato'
                              : `Sblocca per 🪙 ${pack.coin_cost}`}
                          </Text>
                        </View>
                        {!pack.unlocked ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Sblocca ${pack.name}`}
                            onPress={() => handleUnlock(pack)}
                            disabled={Boolean(busy)}
                            style={styles.unlockButton}
                          >
                            {busy === pack.pack_id ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={styles.unlockLabel}>
                                {balance >= pack.coin_cost ? 'Sblocca' : 'Monete'}
                              </Text>
                            )}
                          </Pressable>
                        ) : null}
                      </View>
                      <View style={styles.stickerRow}>
                        {pack.stickers.map((sticker) => {
                          const usable = pack.unlocked;
                          return (
                            <Pressable
                              key={sticker.id}
                              accessibilityRole="button"
                              accessibilityLabel={`Invia sticker ${sticker.name}`}
                              onPress={() => handleSticker(sticker.id)}
                              disabled={!usable || Boolean(busy)}
                              style={({ pressed }) => [
                                styles.stickerButton,
                                pressed && usable && styles.pressed,
                                !usable && styles.disabled,
                              ]}
                            >
                              {busy === sticker.id ? (
                                <ActivityIndicator color={colors.accent} size="small" />
                              ) : (
                                <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
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
    maxHeight: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  headerTitle: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12 },
  balanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    margin: spacing.md,
    padding: 4,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.surfaceAlt },
  tabLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  tabLabelActive: { color: colors.text },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  giftCard: {
    width: '23%',
    minWidth: 76,
    flexGrow: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
  },
  giftEmoji: { fontSize: 30 },
  giftName: { color: colors.text, fontSize: 11, fontWeight: '600' },
  giftCost: { color: colors.muted, fontSize: 11 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  packList: { gap: spacing.sm },
  packCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  packHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  packEmoji: { fontSize: 24 },
  packTitle: { flex: 1, gap: 1 },
  packName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  packMeta: { color: colors.muted, fontSize: 11 },
  unlockButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    minWidth: 74,
    alignItems: 'center',
  },
  unlockLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stickerButton: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerEmoji: { fontSize: 24 },
  error: {
    color: colors.accentSoft,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.md,
  },
});
