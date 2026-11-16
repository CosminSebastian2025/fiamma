import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { GiftSheet } from '@/components/GiftSheet';
import { SafetySheet } from '@/components/SafetySheet';
import { Splash } from '@/components/Splash';
import { getGiftCatalog, getMessages, getStickerCatalog, markRead, sendMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { formatMessageTime } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';
import type { Gift, Message, Sticker } from '@/lib/types';

export default function Chat() {
  const params = useLocalSearchParams<{
    matchId?: string;
    partnerId?: string;
    name?: string;
    photoUrl?: string;
  }>();
  const matchId = typeof params.matchId === 'string' ? params.matchId : '';
  const partnerId = typeof params.partnerId === 'string' ? params.partnerId : '';
  const partnerName = typeof params.name === 'string' && params.name ? params.name : 'Match';
  const photoUrl = typeof params.photoUrl === 'string' && params.photoUrl ? params.photoUrl : null;

  const { session, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftMap, setGiftMap] = useState<Record<string, Gift>>({});
  const [stickerMap, setStickerMap] = useState<Record<string, Sticker>>({});
  const listRef = useRef<FlatList<Message>>(null);
  const userId = session?.user.id ?? null;

  const appendMessage = (message: Message) => {
    setMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message],
    );
  };

  useEffect(() => {
    let active = true;
    Promise.all([getGiftCatalog(), getStickerCatalog()])
      .then(([giftRows, packRows]) => {
        if (!active) return;
        setGiftMap(Object.fromEntries(giftRows.map((gift) => [gift.id, gift])));
        const stickers = packRows.flatMap((pack) => pack.stickers);
        setStickerMap(Object.fromEntries(stickers.map((sticker) => [sticker.id, sticker])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!matchId) return;
    let active = true;
    getMessages(matchId)
      .then((rows) => {
        if (!active) return;
        setMessages(rows);
        setLoading(false);
        void markRead(matchId).catch(() => undefined);
      })
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [matchId]);

  useEffect(() => {
    if (!matchId || !userId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );
          if (incoming.sender_id !== userId) {
            void markRead(matchId).catch(() => undefined);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId, userId]);

  if (authLoading) return <Splash />;
  if (!session) return <Redirect href="/sign-in" />;

  const handleSend = async () => {
    const text = body.trim();
    if (!text || !matchId || !userId || sending) return;

    setSending(true);
    setError(null);
    setBody('');
    try {
      const message = await sendMessage(matchId, userId, text);
      appendMessage(message);
    } catch (e) {
      setBody(text);
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Indietro"
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Avatar name={partnerName} uri={photoUrl} size={42} />
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {partnerName}
            </Text>
            <Text style={styles.headerSubtitle}>Match attivo</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Opzioni di sicurezza"
            onPress={() => (partnerId ? setSafetyOpen(true) : undefined)}
            style={styles.iconButton}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Rompi il ghiaccio</Text>
                <Text style={styles.emptyBody}>
                  Siete un match: scrivi qualcosa di tuo, non limitarti a «ciao».
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === userId;

              if (item.kind === 'sticker') {
                const sticker = item.sticker_id ? stickerMap[item.sticker_id] : undefined;
                return (
                  <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                    <View style={styles.stickerMessage}>
                      <Text style={styles.stickerEmoji}>{sticker?.emoji ?? '✨'}</Text>
                      <Text style={styles.stickerTime}>
                        {formatMessageTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (item.kind === 'gift') {
                const gift = item.gift_id ? giftMap[item.gift_id] : undefined;
                return (
                  <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                    <View style={[styles.giftBubble, mine && styles.giftBubbleMine]}>
                      <Text style={styles.giftEmoji}>{gift?.emoji ?? '🎁'}</Text>
                      <Text style={styles.giftName}>{gift?.name ?? 'Regalo'}</Text>
                      <Text style={styles.giftTime}>
                        {formatMessageTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              }

              return (
                <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={[styles.messageText, mine && styles.messageTextMine]}>
                      {item.body}
                    </Text>
                    <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
                      {formatMessageTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Regali e sticker"
            onPress={() => setGiftOpen(true)}
            disabled={!matchId}
            style={styles.giftButton}
          >
            <Ionicons name="gift-outline" size={21} color={colors.accent} />
          </Pressable>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Scrivi un messaggio..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={2000}
            blurOnSubmit={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invia messaggio"
            onPress={handleSend}
            disabled={!body.trim() || sending}
            style={[styles.sendButton, (!body.trim() || sending) && styles.sendButtonDisabled]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>

        {partnerId ? (
          <SafetySheet
            visible={safetyOpen}
            partnerId={partnerId}
            partnerName={partnerName}
            onClose={() => setSafetyOpen(false)}
            onDone={() => {
              setSafetyOpen(false);
              router.back();
            }}
          />
        ) : null}

        {matchId ? (
          <GiftSheet
            visible={giftOpen}
            matchId={matchId}
            onClose={() => setGiftOpen(false)}
            onSent={appendMessage}
            onOpenWallet={() => {
              setGiftOpen(false);
              router.push('/coins');
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 1 },
  headerName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  messageRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceAlt,
    borderBottomLeftRadius: 4,
  },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  messageTextMine: { color: '#fff' },
  messageTime: { color: colors.muted, fontSize: 10, alignSelf: 'flex-end' },
  messageTimeMine: { color: 'rgba(255,255,255,0.75)' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  giftButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stickerMessage: { alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
  stickerEmoji: { fontSize: 56, lineHeight: 68 },
  stickerTime: { color: colors.muted, fontSize: 10 },
  giftBubble: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
    minWidth: 120,
  },
  giftBubbleMine: { borderColor: colors.accent },
  giftEmoji: { fontSize: 40, lineHeight: 48 },
  giftName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  giftTime: { color: colors.muted, fontSize: 10 },
  error: {
    color: colors.accentSoft,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
});
