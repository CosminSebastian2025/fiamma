import { env } from './env';
import { getSupabase } from './supabase';
import type {
  CoinPack,
  CoinTransaction,
  DeckProfile,
  Gift,
  Interest,
  MatchRow,
  Message,
  Profile,
  ProfileDraft,
  ProfilePhoto,
  ReportReason,
  StickerPack,
  SwipeDecision,
} from './types';

function raise(message: string | undefined, fallback: string): never {
  throw new Error(message && message.trim() ? message : fallback);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) raise(error.message, 'Impossibile caricare il profilo');
  return (data as Profile | null) ?? null;
}

export async function getMyPhotos(userId: string): Promise<ProfilePhoto[]> {
  const { data, error } = await getSupabase()
    .from('profile_photos')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) raise(error.message, 'Impossibile caricare le foto');
  return (data as ProfilePhoto[]) ?? [];
}

export async function getInterestCatalog(): Promise<Interest[]> {
  const { data, error } = await getSupabase()
    .from('interests')
    .select('*')
    .order('label', { ascending: true });
  if (error) raise(error.message, 'Impossibile caricare gli interessi');
  return (data as Interest[]) ?? [];
}

export async function getMyInterests(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('profile_interests')
    .select('interest_id, interests(label)')
    .eq('user_id', userId);
  if (error) raise(error.message, 'Impossibile caricare gli interessi');
  const rows = (data ?? []) as unknown as {
    interest_id: number;
    interests: { label: string } | { label: string }[] | null;
  }[];
  return rows
    .map((row) => {
      if (Array.isArray(row.interests)) return row.interests[0]?.label;
      return row.interests?.label;
    })
    .filter((label): label is string => Boolean(label));
}

export async function saveProfile(draft: ProfileDraft): Promise<Profile> {
  const { data, error } = await getSupabase().rpc('save_profile', {
    p_display_name: draft.displayName,
    p_birthdate: draft.birthdate,
    p_gender: draft.gender,
    p_seeking: draft.seeking,
    p_bio: draft.bio,
    p_city: draft.city || null,
    p_job_title: draft.jobTitle || null,
  });
  if (error) raise(error.message, 'Salvataggio profilo non riuscito');
  return data as Profile;
}

export async function setInterests(labels: string[]): Promise<void> {
  const { error } = await getSupabase().rpc('set_interests', { p_labels: labels });
  if (error) raise(error.message, 'Salvataggio interessi non riuscito');
}

export async function addPhoto(storageKey: string, position?: number): Promise<ProfilePhoto> {
  const { data, error } = await getSupabase().rpc('add_photo', {
    p_storage_key: storageKey,
    p_position: position ?? null,
  });
  if (error) raise(error.message, 'Salvataggio foto non riuscito');
  return data as ProfilePhoto;
}

export async function removePhoto(photoId: string): Promise<void> {
  const { error } = await getSupabase().rpc('remove_photo', { p_photo_id: photoId });
  if (error) raise(error.message, 'Rimozione foto non riuscita');
}

export async function completeOnboarding(): Promise<void> {
  const { error } = await getSupabase().rpc('complete_onboarding');
  if (error) raise(error.message, 'Completamento profilo non riuscito');
}

export async function updateLocation(
  lat: number,
  lng: number,
  city?: string | null,
): Promise<void> {
  const { error } = await getSupabase().rpc('update_location', {
    p_lat: lat,
    p_lng: lng,
    p_city: city ?? null,
  });
  if (error) raise(error.message, 'Aggiornamento posizione non riuscito');
}

export async function getDeck(): Promise<DeckProfile[]> {
  const { data, error } = await getSupabase().rpc('get_deck', {
    p_limit: 20,
    p_max_km: Number.isFinite(env.maxDeckDistanceKm) ? env.maxDeckDistanceKm : 50,
  });
  if (error) raise(error.message, 'Impossibile caricare i profili');
  const rows = (data ?? []) as Omit<DeckProfile, 'photoUrls'>[];
  return rows.map((row) => ({ ...row, photoUrls: [] }));
}

export async function swipe(targetId: string, decision: SwipeDecision): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('swipe', {
    p_target: targetId,
    p_decision: decision,
  });
  if (error) raise(error.message, 'Swipe non riuscito');
  return (data as string | null) ?? null;
}

export async function getMatches(): Promise<MatchRow[]> {
  const { data, error } = await getSupabase().rpc('get_matches');
  if (error) raise(error.message, 'Impossibile caricare i match');
  const rows = (data ?? []) as Omit<MatchRow, 'photoUrl'>[];
  return rows.map((row) => ({ ...row, photoUrl: null }));
}

export async function markRead(matchId: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('mark_read', { p_match: matchId });
  if (error) raise(error.message, 'Aggiornamento letture non riuscito');
  return (data as number) ?? 0;
}

export async function blockUser(targetId: string): Promise<void> {
  const { error } = await getSupabase().rpc('block_user', { p_target: targetId });
  if (error) raise(error.message, 'Blocco non riuscito');
}

export async function reportUser(
  targetId: string,
  reason: ReportReason,
  details: string,
  block: boolean,
): Promise<void> {
  const { error } = await getSupabase().rpc('report_user', {
    p_target: targetId,
    p_reason: reason,
    p_details: details || null,
    p_block: block,
  });
  if (error) raise(error.message, 'Segnalazione non riuscita');
}

export async function getMessages(matchId: string): Promise<Message[]> {
  const { data, error } = await getSupabase()
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) raise(error.message, 'Impossibile caricare i messaggi');
  return (data as Message[]) ?? [];
}

export async function sendMessage(
  matchId: string,
  senderId: string,
  body: string,
): Promise<Message> {
  const { data, error } = await getSupabase()
    .from('messages')
    .insert({ match_id: matchId, sender_id: senderId, body: body.trim() })
    .select('*')
    .single();
  if (error) raise(error.message, 'Invio non riuscito');
  return data as Message;
}

export async function getWallet(): Promise<number> {
  const { data, error } = await getSupabase().rpc('get_wallet');
  if (error) raise(error.message, 'Impossibile caricare il saldo monete');
  return (data as number) ?? 0;
}

export async function getCoinShop(): Promise<CoinPack[]> {
  const { data, error } = await getSupabase().rpc('get_coin_shop');
  if (error) raise(error.message, 'Impossibile caricare i pacchetti');
  return (data as CoinPack[]) ?? [];
}

export async function getGiftCatalog(): Promise<Gift[]> {
  const { data, error } = await getSupabase().rpc('get_gift_catalog');
  if (error) raise(error.message, 'Impossibile caricare i regali');
  return (data as Gift[]) ?? [];
}

export async function getStickerCatalog(): Promise<StickerPack[]> {
  const { data, error } = await getSupabase().rpc('get_sticker_catalog');
  if (error) raise(error.message, 'Impossibile caricare gli sticker');
  return (data as StickerPack[]) ?? [];
}

export async function getCoinTransactions(limit = 50): Promise<CoinTransaction[]> {
  const { data, error } = await getSupabase()
    .from('coin_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) raise(error.message, 'Impossibile caricare i movimenti');
  return (data as CoinTransaction[]) ?? [];
}

export async function sendGift(matchId: string, giftId: string): Promise<Message> {
  const { data, error } = await getSupabase().rpc('send_gift', {
    p_match: matchId,
    p_gift: giftId,
  });
  if (error) raise(error.message, 'Invio regalo non riuscito');
  return data as Message;
}

export async function sendSticker(matchId: string, stickerId: string): Promise<Message> {
  const { data, error } = await getSupabase().rpc('send_sticker', {
    p_match: matchId,
    p_sticker: stickerId,
  });
  if (error) raise(error.message, 'Invio sticker non riuscito');
  return data as Message;
}

export async function purchaseStickerPack(packId: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('purchase_sticker_pack', {
    p_pack: packId,
  });
  if (error) raise(error.message, 'Acquisto sticker non riuscito');
  return (data as number) ?? 0;
}

function checkoutError(code: string | undefined): string | undefined {
  switch (code) {
    case 'stripe_not_configured':
      return 'Pagamenti non ancora configurati';
    case 'price_not_configured':
      return 'Pacchetto non configurato su Stripe';
    case 'price_mismatch':
      return 'Prezzo non allineato con Stripe, riprova più tardi';
    case 'unknown_pack':
      return 'Pacchetto non disponibile';
    case 'unauthorized':
      return 'Sessione scaduta, accedi di nuovo';
    default:
      return undefined;
  }
}

export async function startCoinCheckout(packId: string): Promise<string> {
  const { data, error } = await getSupabase().functions.invoke('stripe-coin-checkout', {
    body: { packId },
  });

  if (error) {
    let code: string | undefined;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = (await context.json()) as { error?: unknown };
        if (typeof payload.error === 'string') code = payload.error;
      } catch {
        // Corpo non JSON: resta l'errore generico.
      }
    }
    raise(checkoutError(code), 'Acquisto non disponibile');
  }

  const payload = data as { url?: string; error?: string } | null;
  if (!payload?.url) raise(checkoutError(payload?.error), 'Acquisto non disponibile');
  return payload.url;
}

export async function deleteAccount(): Promise<void> {
  const { data, error } = await getSupabase().functions.invoke('delete-account', {
    method: 'POST',
    body: {},
  });
  if (error) raise(error.message, 'Cancellazione account non riuscita');
  const payload = data as { deleted?: boolean; error?: string } | null;
  if (!payload?.deleted) raise(payload?.error, 'Cancellazione account non riuscita');
}
