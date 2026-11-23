-- HomeTown — schéma de la base, version 1
-- À exécuter une seule fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- Principe : l'historique (events) est en ajout seul ; points, niveaux et cagnotte en sont recalculés par l'app.
-- Chaque ligne appartient à un foyer (household) ; seuls ses membres connectés peuvent la lire ou l'écrire.

-- Version du schéma : l'app la lit au démarrage pour savoir si elle est compatible.
create table if not exists public.app_meta (
  k text primary key,
  v text not null
);
insert into public.app_meta (k, v) values ('schema_version', '1')
  on conflict (k) do nothing;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Notre maison' check (length(name) between 1 and 60),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

-- Les personnes du foyer (clé « cel », « ant »…). user_id = le compte connecté qui incarne cette personne.
create table if not exists public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,20}$'),
  name text not null check (length(name) between 1 and 40),
  color text not null default '#f7a8b8',
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, key),
  unique (household_id, user_id)
);

-- La liste des tâches, modifiable dans l'app. Une tâche supprimée est seulement archivée (l'historique la garde).
-- base_at = date de « dernière fois » utilisée tant que la tâche n'a jamais été cochée.
create table if not exists public.tasks (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  target text not null,
  name text not null check (length(name) between 1 and 80),
  freq int not null check (freq between 1 and 365),
  effort int not null check (effort between 1 and 3),
  minutes int not null check (minutes between 1 and 240),
  base_at timestamptz not null default now(),
  archived boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (household_id, id)
);

-- L'historique : une ligne par tâche cochée. Jamais modifié ni supprimé.
create table if not exists public.events (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null default 'done' check (kind in ('done')),
  member text not null,
  task_id text,
  task_name text,
  target text,
  points int not null default 0 check (points between 0 and 10000),
  at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  payload jsonb
);
create index if not exists events_household_at on public.events (household_id, at);

-- Les récompenses offertes avec la cagnotte (points dépensés pour de bon ; seule la date peut changer).
create table if not exists public.rewards (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  emoji text,
  name text not null check (length(name) between 1 and 80),
  price int not null check (price between 1 and 100000),
  planned_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Règles d'accès ----------
create or replace function public.is_member(h uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = h and user_id = auth.uid())
$$;

alter table public.app_meta   enable row level security;
alter table public.households enable row level security;
alter table public.members    enable row level security;
alter table public.tasks      enable row level security;
alter table public.events     enable row level security;
alter table public.rewards    enable row level security;

drop policy if exists meta_read on public.app_meta;
create policy meta_read on public.app_meta for select to authenticated using (true);

drop policy if exists hh_read on public.households;
create policy hh_read on public.households for select to authenticated using (public.is_member(id));
drop policy if exists hh_rename on public.households;
create policy hh_rename on public.households for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select to authenticated using (public.is_member(household_id));

drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select to authenticated using (public.is_member(household_id));
drop policy if exists task_add on public.tasks;
create policy task_add on public.tasks for insert to authenticated with check (public.is_member(household_id));
drop policy if exists task_edit on public.tasks;
create policy task_edit on public.tasks for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists ev_read on public.events;
create policy ev_read on public.events for select to authenticated using (public.is_member(household_id));
drop policy if exists ev_add on public.events;
create policy ev_add on public.events for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

drop policy if exists rw_read on public.rewards;
create policy rw_read on public.rewards for select to authenticated using (public.is_member(household_id));
drop policy if exists rw_add on public.rewards;
create policy rw_add on public.rewards for insert to authenticated with check (public.is_member(household_id));
drop policy if exists rw_edit on public.rewards;
create policy rw_edit on public.rewards for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------- Créer un foyer / le rejoindre ----------
-- p_members : [{"key":"cel","name":"Céline","color":"#f7a8b8"}, …] ; p_member : la personne que l'on incarne.
create or replace function public.create_household(p_name text, p_member text, p_members jsonb)
  returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'already_member'; end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Notre maison')) returning * into h;
  insert into public.members (household_id, key, name, color)
    select h.id, m->>'key', m->>'name', coalesce(m->>'color', '#f7a8b8') from jsonb_array_elements(p_members) m;
  update public.members set user_id = auth.uid() where household_id = h.id and key = p_member;
  if not found then raise exception 'unknown_member'; end if;
  return h;
end $$;

-- Aperçu avant de rejoindre : qui est déjà pris dans le foyer de ce code.
create or replace function public.household_preview(p_code text)
  returns table (household_name text, key text, name text, color text, taken boolean)
  language sql security definer set search_path = public as $$
  select h.name, m.key, m.name, m.color, m.user_id is not null
  from public.households h join public.members m on m.household_id = h.id
  where h.invite_code = upper(trim(p_code)) and auth.uid() is not null
  order by m.created_at, m.key
$$;

create or replace function public.join_household(p_code text, p_member text)
  returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'already_member'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if not found then raise exception 'bad_code'; end if;
  update public.members set user_id = auth.uid()
    where household_id = h.id and key = p_member and user_id is null;
  if not found then raise exception 'member_taken'; end if;
  return h;
end $$;

revoke all on function public.create_household(text, text, jsonb) from public, anon;
revoke all on function public.household_preview(text) from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
grant execute on function public.create_household(text, text, jsonb) to authenticated;
grant execute on function public.household_preview(text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ---------- Mises à jour en direct entre les deux téléphones ----------
do $$ begin
  alter publication supabase_realtime add table public.events, public.tasks, public.rewards, public.members;
exception when duplicate_object then null; end $$;
