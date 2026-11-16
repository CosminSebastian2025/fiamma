-- Fiamma — schema iniziale
-- Tutte le scritture sensibili passano da RPC SECURITY DEFINER:
-- il client non può modificare direttamente like, match o posizione.

create extension if not exists postgis with schema extensions;

create type public.swipe_decision as enum ('like', 'pass');
create type public.report_reason as enum ('harassment', 'fake_profile', 'underage', 'nudity', 'spam', 'other');

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 40),
  birthdate date not null,
  gender text not null check (gender in ('woman', 'man', 'nonbinary')),
  seeking text[] not null default '{woman,man,nonbinary}',
  bio text not null default '' check (char_length(bio) <= 500),
  city text,
  job_title text check (char_length(job_title) <= 60),
  is_onboarded boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_key text not null unique,
  position int not null default 0 check (position between 0 and 5),
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index profile_photos_user_idx on public.profile_photos (user_id, position);

create table public.interests (
  id int generated always as identity primary key,
  label text not null unique
);

create table public.profile_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest_id int not null references public.interests (id) on delete cascade,
  primary key (user_id, interest_id)
);

create table public.user_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  geom extensions.geography not null,
  updated_at timestamptz not null default now()
);

create index user_locations_geom_idx on public.user_locations using gist (geom);

create table public.swipes (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  decision public.swipe_decision not null,
  created_at timestamptz not null default now(),
  unique (actor_id, target_id),
  check (actor_id <> target_id)
);

create index swipes_likes_idx on public.swipes (target_id, actor_id) where decision = 'like';
create index swipes_daily_idx on public.swipes (actor_id, created_at) where decision = 'like';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (user_a, user_b),
  check (user_a < user_b)
);

create index matches_user_a_idx on public.matches (user_a);
create index matches_user_b_idx on public.matches (user_b);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_match_idx on public.messages (match_id, created_at);
create index messages_unread_idx on public.messages (match_id) where read_at is null;

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> target_id)
);

create index reports_open_idx on public.reports (status, created_at) where status = 'open';

create table public.devices (
  user_id uuid not null references public.profiles (id) on delete cascade,
  push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, push_token)
);

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_adult()
returns trigger
language plpgsql
as $$
begin
  if new.birthdate > current_date - interval '18 years' then
    raise exception 'È necessario avere almeno 18 anni' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_adult
  before insert or update of birthdate on public.profiles
  for each row execute function public.enforce_adult();

create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches set last_message_at = new.created_at where id = new.match_id;
  update public.profiles set last_active_at = now() where id = new.sender_id;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- Helper per le policy (SECURITY DEFINER: evitano ricorsione RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_match_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where (m.user_a = auth.uid() and m.user_b = p_other)
       or (m.user_b = auth.uid() and m.user_a = p_other)
  );
$$;

create or replace function public.is_participant(p_match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
  );
$$;

create or replace function public.can_message(p_match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
           or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC di scrittura
-- ---------------------------------------------------------------------------

create or replace function public.save_profile(
  p_display_name text,
  p_birthdate date,
  p_gender text,
  p_seeking text[] default '{woman,man,nonbinary}',
  p_bio text default '',
  p_city text default null,
  p_job_title text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_birthdate is null or p_birthdate > current_date - interval '18 years' then
    raise exception 'Devi avere almeno 18 anni';
  end if;
  if p_gender not in ('woman', 'man', 'nonbinary') then
    raise exception 'Genere non valido';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 2 and 40 then
    raise exception 'Il nome deve avere tra 2 e 40 caratteri';
  end if;
  if coalesce(array_length(p_seeking, 1), 0) = 0 then
    p_seeking := '{woman,man,nonbinary}';
  end if;
  if exists (select 1 from unnest(p_seeking) s where s not in ('woman', 'man', 'nonbinary')) then
    raise exception 'Preferenze non valide';
  end if;

  insert into public.profiles (id, display_name, birthdate, gender, seeking, bio, city, job_title)
  values (
    v_uid,
    trim(p_display_name),
    p_birthdate,
    p_gender,
    p_seeking,
    trim(coalesce(p_bio, '')),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_job_title, '')), '')
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    birthdate = excluded.birthdate,
    gender = excluded.gender,
    seeking = excluded.seeking,
    bio = excluded.bio,
    city = excluded.city,
    job_title = excluded.job_title;

  select * into v_profile from public.profiles where id = v_uid;
  return v_profile;
end;
$$;

create or replace function public.set_interests(p_labels text[])
returns void
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
  if coalesce(array_length(p_labels, 1), 0) > 15 then
    raise exception 'Massimo 15 interessi';
  end if;

  delete from public.profile_interests where user_id = v_uid;

  insert into public.profile_interests (user_id, interest_id)
  select v_uid, i.id
  from public.interests i
  where i.label = any (coalesce(p_labels, '{}'))
  on conflict do nothing;
end;
$$;

create or replace function public.add_photo(p_storage_key text, p_position int default null)
returns public.profile_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_photo public.profile_photos;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_storage_key not like v_uid::text || '/%' then
    raise exception 'Chiave foto non valida';
  end if;

  select count(*) into v_count from public.profile_photos where user_id = v_uid;
  if v_count >= 6 then
    raise exception 'Massimo 6 foto';
  end if;

  insert into public.profile_photos (user_id, storage_key, position)
  values (v_uid, p_storage_key, least(coalesce(p_position, v_count), 5))
  on conflict (storage_key) do update set position = excluded.position
  returning * into v_photo;

  return v_photo;
end;
$$;

create or replace function public.remove_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profile_photos
  where id = p_photo_id and user_id = auth.uid();
end;
$$;

create or replace function public.complete_onboarding()
returns void
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
  if not exists (select 1 from public.profile_photos where user_id = v_uid) then
    raise exception 'Aggiungi almeno una foto';
  end if;
  update public.profiles set is_onboarded = true where id = v_uid;
end;
$$;

create or replace function public.update_location(
  p_lat double precision,
  p_lng double precision,
  p_city text default null
)
returns void
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
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'Coordinate non valide';
  end if;

  insert into public.user_locations (user_id, geom)
  values (
    v_uid,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  )
  on conflict (user_id) do update
    set geom = excluded.geom, updated_at = now();

  if p_city is not null and char_length(trim(p_city)) between 1 and 80 then
    update public.profiles set city = trim(p_city) where id = v_uid;
  end if;
end;
$$;

create or replace function public.swipe(p_target uuid, p_decision public.swipe_decision)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_likes_today int;
  v_final public.swipe_decision;
  v_match uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_target = v_uid then
    raise exception 'Non puoi fare swipe su te stesso';
  end if;
  if not exists (select 1 from public.profiles where id = p_target and is_onboarded) then
    raise exception 'Profilo non disponibile';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_uid)
  ) then
    raise exception 'Utente non disponibile';
  end if;

  if p_decision = 'like' then
    select count(*) into v_likes_today
    from public.swipes
    where actor_id = v_uid and decision = 'like' and created_at >= date_trunc('day', now());
    if v_likes_today >= 100 then
      raise exception 'Limite giornaliero di like raggiunto';
    end if;
  end if;

  insert into public.swipes (actor_id, target_id, decision)
  values (v_uid, p_target, p_decision)
  on conflict (actor_id, target_id) do nothing;

  select decision into v_final
  from public.swipes
  where actor_id = v_uid and target_id = p_target;

  if v_final = 'like' and exists (
    select 1 from public.swipes
    where actor_id = p_target and target_id = v_uid and decision = 'like'
  ) then
    insert into public.matches (user_a, user_b)
    values (least(v_uid, p_target), greatest(v_uid, p_target))
    on conflict (user_a, user_b) do nothing;

    select id into v_match
    from public.matches
    where user_a = least(v_uid, p_target) and user_b = greatest(v_uid, p_target);
  end if;

  update public.profiles set last_active_at = now() where id = v_uid;
  return v_match;
end;
$$;

create or replace function public.mark_read(p_match uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_participant(p_match) then
    raise exception 'Conversazione non trovata';
  end if;

  update public.messages
  set read_at = now()
  where match_id = p_match and sender_id <> v_uid and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.block_user(p_target uuid)
returns void
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
  if p_target = v_uid then
    raise exception 'Non puoi bloccare te stesso';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_uid, p_target)
  on conflict do nothing;
end;
$$;

create or replace function public.report_user(
  p_target uuid,
  p_reason public.report_reason,
  p_details text default null,
  p_block boolean default true
)
returns void
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
  if p_target = v_uid then
    raise exception 'Non puoi segnalare te stesso';
  end if;

  insert into public.reports (reporter_id, target_id, reason, details)
  values (v_uid, p_target, p_reason, nullif(trim(coalesce(p_details, '')), ''));

  if p_block then
    insert into public.blocks (blocker_id, blocked_id)
    values (v_uid, p_target)
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC di lettura
-- ---------------------------------------------------------------------------

create or replace function public.get_deck(
  p_limit int default 20,
  p_max_km int default 50
)
returns table (
  id uuid,
  display_name text,
  birthdate date,
  bio text,
  city text,
  job_title text,
  interests text[],
  photos jsonb,
  distance_km int
)
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

  update public.profiles set last_active_at = now() where id = v_uid;

  return query
  select
    p.id,
    p.display_name,
    p.birthdate,
    p.bio,
    p.city,
    p.job_title,
    coalesce((
      select array_agg(i.label order by i.label)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.user_id = p.id
    ), '{}') as interests,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', ph.id, 'key', ph.storage_key)
        order by ph.position
      )
      from public.profile_photos ph
      where ph.user_id = p.id and ph.moderation_status <> 'rejected'
    ), '[]'::jsonb) as photos,
    case
      when me.geom is null or l.geom is null then null
      else round(extensions.st_distance(l.geom, me.geom) / 1000.0)::int
    end as distance_km
  from public.profiles p
  join public.profiles my on my.id = v_uid
  left join public.user_locations me on me.user_id = v_uid
  left join public.user_locations l on l.user_id = p.id
  where p.id <> v_uid
    and p.is_onboarded
    and p.birthdate <= current_date - interval '18 years'
    and p.gender = any (my.seeking)
    and my.gender = any (p.seeking)
    and exists (
      select 1 from public.profile_photos ph
      where ph.user_id = p.id and ph.moderation_status <> 'rejected'
    )
    and not exists (
      select 1 from public.swipes s
      where s.actor_id = v_uid and s.target_id = p.id
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = v_uid)
    )
    and (
      me.geom is null or l.geom is null
      or extensions.st_dwithin(l.geom, me.geom, greatest(p_max_km, 1) * 1000)
    )
  order by
    (case when me.geom is null or l.geom is null then 1 else 0 end),
    (case when me.geom is null or l.geom is null then null
          else extensions.st_distance(l.geom, me.geom) end),
    p.last_active_at desc
  limit greatest(1, least(p_limit, 50));
end;
$$;

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
      select msg.body
      from public.messages msg
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

alter table public.profiles enable row level security;
alter table public.profile_photos enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.user_locations enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.devices enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_match_with(id));

create policy profile_photos_select on public.profile_photos
  for select to authenticated
  using (user_id = auth.uid() or public.is_match_with(user_id));

create policy interests_select on public.interests
  for select to authenticated
  using (true);

create policy profile_interests_select on public.profile_interests
  for select to authenticated
  using (user_id = auth.uid() or public.is_match_with(user_id));

create policy user_locations_select_own on public.user_locations
  for select to authenticated
  using (user_id = auth.uid());

create policy swipes_select_own on public.swipes
  for select to authenticated
  using (actor_id = auth.uid());

create policy matches_select_participant on public.matches
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

create policy messages_select_participant on public.messages
  for select to authenticated
  using (public.is_participant(match_id));

create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_message(match_id));

create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

create policy devices_select_own on public.devices
  for select to authenticated
  using (user_id = auth.uid());

create policy devices_insert_own on public.devices
  for insert to authenticated
  with check (user_id = auth.uid());

create policy devices_update_own on public.devices
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy devices_delete_own on public.devices
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Permessi: il client scrive solo messaggi e device token.
-- Tutto il resto passa dalle RPC.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.profile_photos, public.interests,
  public.profile_interests, public.user_locations, public.swipes, public.matches,
  public.messages, public.blocks, public.reports, public.devices
  to authenticated;

grant insert on public.messages to authenticated;
grant select, insert, update, delete on public.devices to authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.profile_photos from anon, authenticated;
revoke insert, update, delete on public.interests from anon, authenticated;
revoke insert, update, delete on public.profile_interests from anon, authenticated;
revoke insert, update, delete on public.user_locations from anon, authenticated;
revoke insert, update, delete on public.swipes from anon, authenticated;
revoke insert, update, delete on public.matches from anon, authenticated;
revoke update, delete on public.messages from anon, authenticated;
revoke insert, update, delete on public.blocks from anon, authenticated;
revoke insert, update, delete on public.reports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime per la chat
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed interessi
-- ---------------------------------------------------------------------------

insert into public.interests (label) values
  ('Viaggi'), ('Cucina'), ('Musica'), ('Cinema'), ('Sport'),
  ('Lettura'), ('Arte'), ('Fotografia'), ('Tecnologia'), ('Natura'),
  ('Animali'), ('Yoga'), ('Danza'), ('Videogiochi'), ('Moda'),
  ('Caffè'), ('Vino'), ('Teatro'), ('Escursionismo'), ('Pilates'),
  ('Podcast'), ('Design'), ('Volontariato'), ('Astronomia')
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Esecuzione funzioni: solo utenti autenticati.
-- I helper servono anche alle policy RLS, quindi devono essere eseguibili.
-- ---------------------------------------------------------------------------

revoke execute on function public.is_match_with(uuid) from public, anon;
revoke execute on function public.is_participant(uuid) from public, anon;
revoke execute on function public.can_message(uuid) from public, anon;
revoke execute on function public.save_profile(text, date, text, text[], text, text, text) from public, anon;
revoke execute on function public.set_interests(text[]) from public, anon;
revoke execute on function public.add_photo(text, int) from public, anon;
revoke execute on function public.remove_photo(uuid) from public, anon;
revoke execute on function public.complete_onboarding() from public, anon;
revoke execute on function public.update_location(double precision, double precision, text) from public, anon;
revoke execute on function public.swipe(uuid, public.swipe_decision) from public, anon;
revoke execute on function public.mark_read(uuid) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.report_user(uuid, public.report_reason, text, boolean) from public, anon;
revoke execute on function public.get_deck(int, int) from public, anon;
revoke execute on function public.get_matches() from public, anon;

grant execute on function public.is_match_with(uuid) to authenticated;
grant execute on function public.is_participant(uuid) to authenticated;
grant execute on function public.can_message(uuid) to authenticated;
grant execute on function public.save_profile(text, date, text, text[], text, text, text) to authenticated;
grant execute on function public.set_interests(text[]) to authenticated;
grant execute on function public.add_photo(text, int) to authenticated;
grant execute on function public.remove_photo(uuid) to authenticated;
grant execute on function public.complete_onboarding() to authenticated;
grant execute on function public.update_location(double precision, double precision, text) to authenticated;
grant execute on function public.swipe(uuid, public.swipe_decision) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.report_user(uuid, public.report_reason, text, boolean) to authenticated;
grant execute on function public.get_deck(int, int) to authenticated;
grant execute on function public.get_matches() to authenticated;

