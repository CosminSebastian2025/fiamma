-- ---------------------------------------------------------------------------
-- Monete digitali, regali e sticker
--
-- Regole di prodotto:
--   * le monete non scadono, non hanno valore monetario, non si trasferiscono
--     e non si convertono in denaro;
--   * si usano SOLO per regali e sticker, mai per messaggi o videocall;
--   * ogni movimento passa da un ledger immutabile: il saldo della wallet e'
--     sempre la somma dei movimenti;
--   * i regali sono acquisti (le monete vengono bruciate), non trasferimenti:
--     il destinatario non riceve monete.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------------

create type public.coin_reason as enum (
  'purchase',
  'gift_sent',
  'sticker_pack',
  'refund',
  'bonus',
  'admin_adjustment'
);

create type public.coin_provider as enum ('stripe', 'apple', 'google', 'promo', 'admin');

-- ---------------------------------------------------------------------------
-- Wallet e ledger
-- ---------------------------------------------------------------------------

create table public.coin_wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason public.coin_reason not null,
  ref text,
  created_at timestamptz not null default now()
);

create index coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);
create unique index coin_ledger_ref_idx
  on public.coin_ledger (user_id, reason, ref);

-- ---------------------------------------------------------------------------
-- Catalogo: pacchetti monete, regali, sticker
-- ---------------------------------------------------------------------------

create table public.coin_packs (
  id text primary key,
  name text not null,
  description text not null default '',
  coins int not null check (coins > 0),
  bonus_coins int not null default 0 check (bonus_coins >= 0),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'eur',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.gifts (
  id text primary key,
  name text not null,
  emoji text not null,
  coin_cost int not null check (coin_cost > 0),
  active boolean not null default true,
  sort int not null default 0
);

create table public.sticker_packs (
  id text primary key,
  name text not null,
  emoji text not null,
  coin_cost int not null default 0 check (coin_cost >= 0),
  active boolean not null default true,
  sort int not null default 0
);

create table public.stickers (
  id text primary key,
  pack_id text not null references public.sticker_packs (id) on delete cascade,
  name text not null,
  emoji text not null,
  sort int not null default 0
);

create index stickers_pack_idx on public.stickers (pack_id, sort);

create table public.sticker_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pack_id text not null references public.sticker_packs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

-- ---------------------------------------------------------------------------
-- Acquisti (tracciamento + idempotenza webhook)
-- ---------------------------------------------------------------------------

create table public.coin_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.coin_provider not null,
  provider_ref text not null,
  pack_id text not null references public.coin_packs (id),
  coins int not null check (coins > 0),
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'pending'
    check (status in ('pending', 'credited', 'refunded', 'failed')),
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  unique (provider, provider_ref)
);

create index coin_purchases_user_idx on public.coin_purchases (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Messaggi: testo, regalo o sticker
-- ---------------------------------------------------------------------------

alter table public.messages add column kind text not null default 'text';

-- Il vecchio check su body non conosce kind: va rimosso per nome reale.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%char_length%'
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.messages alter column body drop not null;
alter table public.messages add column gift_id text references public.gifts (id);
alter table public.messages add column sticker_id text references public.stickers (id);

alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'gift', 'sticker'));

alter table public.messages add constraint messages_body_check
  check (
    (kind = 'text'
      and body is not null
      and char_length(trim(body)) between 1 and 2000
      and gift_id is null
      and sticker_id is null)
    or (kind = 'gift'
      and body is null
      and gift_id is not null
      and sticker_id is null)
    or (kind = 'sticker'
      and body is null
      and gift_id is null
      and sticker_id is not null)
  );

-- Il client puo' inserire solo messaggi di testo: regali e sticker passano
-- esclusivamente dalle RPC atomiche (altrimenti si aggirerebbe il costo).
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text' and public.can_message(match_id));

revoke insert on public.messages from authenticated;
grant insert (match_id, sender_id, body) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Wallet: creazione con bonus di benvenuto
-- ---------------------------------------------------------------------------

create or replace function public.ensure_coin_wallet(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  insert into public.coin_wallets (user_id, balance)
  values (p_user, 0)
  on conflict (user_id) do nothing;

  if found then
    update public.coin_wallets
    set balance = balance + 50, updated_at = now()
    where user_id = p_user;

    insert into public.coin_ledger (user_id, delta, balance_after, reason, ref)
    values (p_user, 50, 50, 'bonus', 'welcome')
    on conflict (user_id, reason, ref) do nothing;
  end if;

  select balance into v_balance from public.coin_wallets where user_id = p_user;
  return coalesce(v_balance, 0);
end;
$$;

create or replace function public.on_profile_create_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_coin_wallet(new.id);
  return new;
end;
$$;

create trigger profiles_create_wallet
  after insert on public.profiles
  for each row execute function public.on_profile_create_wallet();

-- Backfill per i profili gia' esistenti.
select public.ensure_coin_wallet(id) from public.profiles;

-- ---------------------------------------------------------------------------
-- RPC: saldo e cataloghi
-- ---------------------------------------------------------------------------

create or replace function public.get_wallet()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return public.ensure_coin_wallet(v_uid);
end;
$$;

create or replace function public.get_coin_shop()
returns table (
  id text,
  name text,
  description text,
  coins int,
  bonus_coins int,
  price_cents int,
  currency text,
  sort int
)
language sql
stable
security definer
set search_path = public
as $$
  select cp.id, cp.name, cp.description, cp.coins, cp.bonus_coins,
         cp.price_cents, cp.currency, cp.sort
  from public.coin_packs cp
  where cp.active
  order by cp.sort;
$$;

create or replace function public.get_gift_catalog()
returns table (id text, name text, emoji text, coin_cost int, sort int)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.emoji, g.coin_cost, g.sort
  from public.gifts g
  where g.active
  order by g.sort;
$$;

create or replace function public.get_sticker_catalog()
returns table (
  pack_id text,
  name text,
  emoji text,
  coin_cost int,
  unlocked boolean,
  stickers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.id,
    sp.name,
    sp.emoji,
    sp.coin_cost,
    (sp.coin_cost = 0 or exists (
      select 1 from public.sticker_unlocks su
      where su.user_id = auth.uid() and su.pack_id = sp.id
    )) as unlocked,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', s.id, 'name', s.name, 'emoji', s.emoji)
        order by s.sort
      )
      from public.stickers s
      where s.pack_id = sp.id
    ), '[]'::jsonb) as stickers
  from public.sticker_packs sp
  where sp.active
  order by sp.sort;
$$;

-- ---------------------------------------------------------------------------
-- RPC: spesa monete (atomiche)
-- ---------------------------------------------------------------------------

create or replace function public.send_gift(p_match uuid, p_gift text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_gift public.gifts;
  v_balance bigint;
  v_message public.messages;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_message(p_match) then
    raise exception 'Conversazione non disponibile';
  end if;

  select * into v_gift from public.gifts where id = p_gift and active;
  if not found then
    raise exception 'Regalo non disponibile';
  end if;

  perform public.ensure_coin_wallet(v_uid);
  select balance into v_balance
  from public.coin_wallets
  where user_id = v_uid
  for update;

  if v_balance < v_gift.coin_cost then
    raise exception 'Monete insufficienti';
  end if;

  update public.coin_wallets
  set balance = balance - v_gift.coin_cost, updated_at = now()
  where user_id = v_uid;

  insert into public.coin_ledger (user_id, delta, balance_after, reason, ref)
  values (
    v_uid,
    -v_gift.coin_cost,
    v_balance - v_gift.coin_cost,
    'gift_sent',
    v_gift.id || ':' || gen_random_uuid()::text
  );

  insert into public.messages (match_id, sender_id, kind, gift_id)
  values (p_match, v_uid, 'gift', v_gift.id)
  returning * into v_message;

  update public.profiles set last_active_at = now() where id = v_uid;
  return v_message;
end;
$$;

create or replace function public.send_sticker(p_match uuid, p_sticker text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sticker public.stickers;
  v_pack_cost int;
  v_message public.messages;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_message(p_match) then
    raise exception 'Conversazione non disponibile';
  end if;

  select * into v_sticker from public.stickers where id = p_sticker;
  if not found then
    raise exception 'Sticker non disponibile';
  end if;

  select coin_cost into v_pack_cost
  from public.sticker_packs
  where id = v_sticker.pack_id and active;
  if v_pack_cost is null then
    raise exception 'Pacchetto sticker non disponibile';
  end if;

  if v_pack_cost > 0 and not exists (
    select 1 from public.sticker_unlocks
    where user_id = v_uid and pack_id = v_sticker.pack_id
  ) then
    raise exception 'Sticker non sbloccato';
  end if;

  insert into public.messages (match_id, sender_id, kind, sticker_id)
  values (p_match, v_uid, 'sticker', v_sticker.id)
  returning * into v_message;

  update public.profiles set last_active_at = now() where id = v_uid;
  return v_message;
end;
$$;

create or replace function public.purchase_sticker_pack(p_pack text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pack public.sticker_packs;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_pack from public.sticker_packs where id = p_pack and active;
  if not found then
    raise exception 'Pacchetto non disponibile';
  end if;

  v_balance := public.ensure_coin_wallet(v_uid);
  select balance into v_balance
  from public.coin_wallets
  where user_id = v_uid
  for update;

  insert into public.sticker_unlocks (user_id, pack_id)
  values (v_uid, p_pack)
  on conflict do nothing;

  if not found then
    return v_balance;
  end if;

  if v_pack.coin_cost = 0 then
    return v_balance;
  end if;

  if v_balance < v_pack.coin_cost then
    raise exception 'Monete insufficienti';
  end if;

  update public.coin_wallets
  set balance = balance - v_pack.coin_cost, updated_at = now()
  where user_id = v_uid;

  insert into public.coin_ledger (user_id, delta, balance_after, reason, ref)
  values (v_uid, -v_pack.coin_cost, v_balance - v_pack.coin_cost, 'sticker_pack', v_pack.id)
  on conflict (user_id, reason, ref) do nothing;

  return v_balance - v_pack.coin_cost;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: accredito acquisto (solo service role / webhook)
-- ---------------------------------------------------------------------------

create or replace function public.credit_coin_purchase(
  p_user uuid,
  p_provider public.coin_provider,
  p_provider_ref text,
  p_pack text,
  p_amount_cents int,
  p_currency text default 'eur'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.coin_packs;
  v_balance bigint;
begin
  if p_user is null then
    raise exception 'Utente mancante';
  end if;
  if p_provider_ref is null or char_length(trim(p_provider_ref)) = 0 then
    raise exception 'Riferimento pagamento mancante';
  end if;
  if p_amount_cents < 0 then
    raise exception 'Importo non valido';
  end if;

  select * into v_pack from public.coin_packs where id = p_pack and active;
  if not found then
    raise exception 'Pacchetto non valido';
  end if;

  insert into public.coin_purchases (
    user_id, provider, provider_ref, pack_id, coins, amount_cents, currency, status
  )
  values (
    p_user, p_provider, trim(p_provider_ref), v_pack.id,
    v_pack.coins + v_pack.bonus_coins, p_amount_cents,
    lower(coalesce(p_currency, 'eur')), 'pending'
  )
  on conflict (provider, provider_ref) do nothing;

  if not found then
    -- Webhook duplicato: nessun doppio accredito.
    select balance into v_balance from public.coin_wallets where user_id = p_user;
    return coalesce(v_balance, 0);
  end if;

  v_balance := public.ensure_coin_wallet(p_user);
  select balance into v_balance
  from public.coin_wallets
  where user_id = p_user
  for update;

  update public.coin_wallets
  set balance = balance + v_pack.coins + v_pack.bonus_coins, updated_at = now()
  where user_id = p_user;

  insert into public.coin_ledger (user_id, delta, balance_after, reason, ref)
  values (
    p_user,
    v_pack.coins + v_pack.bonus_coins,
    v_balance + v_pack.coins + v_pack.bonus_coins,
    'purchase',
    p_provider::text || ':' || trim(p_provider_ref)
  );

  update public.coin_purchases
  set status = 'credited', credited_at = now()
  where provider = p_provider and provider_ref = trim(p_provider_ref);

  return v_balance + v_pack.coins + v_pack.bonus_coins;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anteprima chat: i regali/sticker hanno un'etichetta leggibile
-- ---------------------------------------------------------------------------

create or replace function public.get_matches()
returns table (
  match_id uuid,
  partner_id uuid,
  display_name text,
  birthdate date,
  photo_key text,
  last_message_at timestamptz,
  last_message text,
  unread_count bigint,
  matched_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    p.id,
    p.display_name,
    p.birthdate,
    (
      select ph.storage_key
      from public.profile_photos ph
      where ph.user_id = p.id and ph.moderation_status <> 'rejected'
      order by ph.position
      limit 1
    ) as photo_key,
    m.last_message_at,
    (
      select case msg.kind
        when 'gift' then '🎁 ' || coalesce(g.name, 'Regalo')
        when 'sticker' then coalesce(s.emoji, '✨') || ' Sticker'
        else msg.body
      end
      from public.messages msg
      left join public.gifts g on g.id = msg.gift_id
      left join public.stickers s on s.id = msg.sticker_id
      where msg.match_id = m.id
      order by msg.created_at desc
      limit 1
    ) as last_message,
    (
      select count(*)
      from public.messages msg
      where msg.match_id = m.id and msg.sender_id <> auth.uid() and msg.read_at is null
    ) as unread_count,
    m.created_at
  from public.matches m
  join public.profiles p
    on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  where (m.user_a = auth.uid() or m.user_b = auth.uid())
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by coalesce(m.last_message_at, m.created_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.coin_wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.coin_purchases enable row level security;
alter table public.coin_packs enable row level security;
alter table public.gifts enable row level security;
alter table public.sticker_packs enable row level security;
alter table public.stickers enable row level security;
alter table public.sticker_unlocks enable row level security;

create policy coin_wallets_select_own on public.coin_wallets
  for select to authenticated
  using (user_id = auth.uid());

create policy coin_ledger_select_own on public.coin_ledger
  for select to authenticated
  using (user_id = auth.uid());

create policy coin_purchases_select_own on public.coin_purchases
  for select to authenticated
  using (user_id = auth.uid());

create policy coin_packs_select_all on public.coin_packs
  for select to authenticated
  using (true);

create policy gifts_select_all on public.gifts
  for select to authenticated
  using (true);

create policy sticker_packs_select_all on public.sticker_packs
  for select to authenticated
  using (true);

create policy stickers_select_all on public.stickers
  for select to authenticated
  using (true);

create policy sticker_unlocks_select_own on public.sticker_unlocks
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.coin_wallets, public.coin_ledger, public.coin_purchases,
  public.coin_packs, public.gifts, public.sticker_packs, public.stickers,
  public.sticker_unlocks
  to authenticated;

revoke insert, update, delete on public.coin_wallets from anon, authenticated;
revoke insert, update, delete on public.coin_ledger from anon, authenticated;
revoke insert, update, delete on public.coin_purchases from anon, authenticated;
revoke insert, update, delete on public.coin_packs from anon, authenticated;
revoke insert, update, delete on public.gifts from anon, authenticated;
revoke insert, update, delete on public.sticker_packs from anon, authenticated;
revoke insert, update, delete on public.stickers from anon, authenticated;
revoke insert, update, delete on public.sticker_unlocks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permessi RPC
-- ---------------------------------------------------------------------------

revoke execute on function public.ensure_coin_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.get_wallet() from public, anon;
revoke execute on function public.get_coin_shop() from public, anon;
revoke execute on function public.get_gift_catalog() from public, anon;
revoke execute on function public.get_sticker_catalog() from public, anon;
revoke execute on function public.send_gift(uuid, text) from public, anon;
revoke execute on function public.send_sticker(uuid, text) from public, anon;
revoke execute on function public.purchase_sticker_pack(text) from public, anon;
revoke execute on function public.credit_coin_purchase(uuid, public.coin_provider, text, text, int, text)
  from public, anon, authenticated;

grant execute on function public.get_wallet() to authenticated;
grant execute on function public.get_coin_shop() to authenticated;
grant execute on function public.get_gift_catalog() to authenticated;
grant execute on function public.get_sticker_catalog() to authenticated;
grant execute on function public.send_gift(uuid, text) to authenticated;
grant execute on function public.send_sticker(uuid, text) to authenticated;
grant execute on function public.purchase_sticker_pack(text) to authenticated;
grant execute on function public.credit_coin_purchase(uuid, public.coin_provider, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Seed catalogo
-- ---------------------------------------------------------------------------

insert into public.coin_packs (id, name, description, coins, bonus_coins, price_cents, currency, sort) values
  ('starter', 'Starter', '200 monete per iniziare', 200, 0, 199, 'eur', 1),
  ('popular', 'Popolare', '500 monete + 50 in regalo', 500, 50, 399, 'eur', 2),
  ('value', 'Convenienza', '1000 monete + 200 in regalo', 1000, 200, 749, 'eur', 3),
  ('pro', 'Pro', '2000 monete + 400 in regalo', 2000, 400, 999, 'eur', 4)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  coins = excluded.coins,
  bonus_coins = excluded.bonus_coins,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  sort = excluded.sort;

insert into public.gifts (id, name, emoji, coin_cost, sort) values
  ('rose', 'Rosa', '🌹', 5, 1),
  ('coffee', 'Caffè', '☕', 10, 2),
  ('chocolate', 'Cioccolatini', '🍫', 15, 3),
  ('teddy', 'Orsetto', '🧸', 25, 4),
  ('champagne', 'Champagne', '🥂', 50, 5),
  ('gift_box', 'Regalo', '🎁', 100, 6),
  ('diamond', 'Diamante', '💎', 250, 7),
  ('crown', 'Corona', '👑', 300, 8)
on conflict (id) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  coin_cost = excluded.coin_cost,
  sort = excluded.sort;

insert into public.sticker_packs (id, name, emoji, coin_cost, sort) values
  ('base', 'Essenziali', '😊', 0, 1),
  ('amore', 'Amore', '💘', 40, 2),
  ('party', 'Festa', '🎉', 40, 3),
  ('animali', 'Animali', '🦊', 60, 4)
on conflict (id) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  coin_cost = excluded.coin_cost,
  sort = excluded.sort;

insert into public.stickers (id, pack_id, name, emoji, sort) values
  ('base_cuore', 'base', 'Cuore', '❤️', 1),
  ('base_sorriso', 'base', 'Sorriso', '😄', 2),
  ('base_occhiolino', 'base', 'Occhiolino', '😉', 3),
  ('base_fuoco', 'base', 'Fuoco', '🔥', 4),
  ('base_stella', 'base', 'Stella', '⭐', 5),
  ('base_bacio', 'base', 'Bacio', '😘', 6),
  ('amore_rosa', 'amore', 'Rosa', '🌹', 1),
  ('amore_cuori', 'amore', 'Cuori', '💕', 2),
  ('amore_innamorati', 'amore', 'Innamorati', '🥰', 3),
  ('amore_fiamma', 'amore', 'Fiamma', '❤️‍🔥', 4),
  ('amore_lettera', 'amore', 'Lettera', '💌', 5),
  ('amore_anello', 'amore', 'Anello', '💍', 6),
  ('party_coriandoli', 'party', 'Coriandoli', '🎉', 1),
  ('party_disco', 'party', 'Disco', '🪩', 2),
  ('party_microfono', 'party', 'Microfono', '🎤', 3),
  ('party_rock', 'party', 'Rock', '🤘', 4),
  ('party_fuochi', 'party', 'Fuochi', '🎆', 5),
  ('party_torta', 'party', 'Torta', '🎂', 6),
  ('animali_gatto', 'animali', 'Gatto', '🐱', 1),
  ('animali_cane', 'animali', 'Cane', '🐶', 2),
  ('animali_volpe', 'animali', 'Volpe', '🦊', 3),
  ('animali_panda', 'animali', 'Panda', '🐼', 4),
  ('animali_coniglio', 'animali', 'Coniglio', '🐰', 5),
  ('animali_pinguino', 'animali', 'Pinguino', '🐧', 6)
on conflict (id) do update set
  pack_id = excluded.pack_id,
  name = excluded.name,
  emoji = excluded.emoji,
  sort = excluded.sort;
