-- =============================================================================
-- Bristol FSAI Board: database schema (Supabase, Postgres 15+)
--
-- Safe to re-run: everything uses IF NOT EXISTS, CREATE OR REPLACE or DROP ... IF EXISTS.
-- Apply with `node scripts/apply-schema.mjs` (Supabase Management API), or paste the whole file into
-- Supabase > SQL Editor and run it. Then run `node scripts/seed-and-import.mjs` to seed the Status,
-- Subteam and other dropdown options.
--
-- Security model
-- * The browser signs in to Supabase (anonymously in "trust" mode, or with an emailed code in
--   "email_code" mode) and links that session to a member with claim_member(). Every write is then
--   attributed to that member by triggers, never by anything the browser sends.
-- * Only sessions linked to a member can read or change the board.
-- * Board-admin powers (hard delete, dropdown options, members) need a verified-email session, unless
--   board_settings.trust_mode_admins is switched on. In trust mode anyone can sign in as any username,
--   so turning that on means anyone can use the admins' powers too.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------

-- University usernames, e.g. xy12345. Keep in sync with VITE_USERNAME_PATTERN in the app.
create or replace function public.username_pattern()
returns text
language sql
immutable
set search_path = ''
as $$ select '^[a-z]{2}[0-9]{5}$'::text $$;

-- One row of board-wide settings. Change it in the SQL Editor (there is no API access to it).
create table if not exists public.board_settings (
  id                boolean primary key default true check (id),
  -- 'trust': username only. 'email_code': only sessions that verified username@bristol.ac.uk count.
  -- Keep in sync with VITE_AUTH_MODE in the app.
  auth_mode         text not null default 'trust' check (auth_mode in ('trust', 'email_code')),
  -- Let board admins use their powers from an anonymous (username-only) session.
  trust_mode_admins boolean not null default false,
  -- Safety net against mass sign-ups.
  member_limit      integer not null default 300 check (member_limit between 1 and 100000),
  updated_at        timestamptz not null default now()
);
comment on table public.board_settings is 'Board-wide settings (single row). Edit in the SQL Editor.';
insert into public.board_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.members (
  username       text primary key
                 check (username = lower(username) and username ~ '^[a-z0-9._-]{2,64}$'),
  full_name      text not null check (char_length(btrim(full_name)) between 1 and 100),
  email          text generated always as (username || '@bristol.ac.uk') stored,
  github_login   text unique,
  -- Permission to manage the board (options, members, hard deletes). Not the "Admin" subteam.
  is_board_admin boolean not null default false,
  created_at     timestamptz not null default now()
);
-- Retired members are hidden from the pickers but kept for history.
alter table public.members add column if not exists active boolean not null default true;
comment on table public.members is 'Bristol FSAI members, keyed by university username.';
comment on column public.members.is_board_admin is 'Can manage options, members and hard-delete items. Unrelated to the Admin subteam.';

create table if not exists public.member_sessions (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  username     text not null references public.members (username) on update cascade on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
comment on table public.member_sessions is 'Links a Supabase auth session (one per device) to a member.';
create index if not exists member_sessions_username_idx on public.member_sessions (username);

-- Which auth session registered which member: each session may register only one.
create table if not exists public.member_registrations (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  username     text not null references public.members (username) on update cascade on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists public.field_options (
  id          uuid primary key default gen_random_uuid(),
  field       text not null check (field ~ '^[a-z][a-z0-9_]*$'),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  color       text not null default 'GRAY'
              check (color in ('GRAY', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE')),
  description text,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  unique (field, name)
);
comment on table public.field_options is
  'Dropdown options per field (status, subteam, priority, ...). Drives board columns and dropdowns.';
create unique index if not exists field_options_field_lower_name on public.field_options (field, lower(name));

create sequence if not exists public.item_number_seq as bigint start with 1;

create table if not exists public.items (
  id               uuid primary key default gen_random_uuid(),
  number           bigint not null unique,            -- set by trigger from item_number_seq
  title            text not null check (char_length(btrim(title)) between 1 and 300),
  description      text not null default '' check (char_length(description) <= 50000),
  status           text not null,                     -- a field_options name where field = 'status'
  subteam          text,                              -- a field_options name where field = 'subteam'
  assignees        text[] not null default '{}',      -- member usernames
  legacy_assignees text[] not null default '{}',      -- unmapped GitHub logins (imports only)
  labels           text[] not null default '{}',
  start_date       date,                              -- Timeline bar start
  due_date         date,                              -- Timeline bar end, shown on cards
  blocked_reason   text check (char_length(blocked_reason) <= 2000),
  blocked_by       bigint[] not null default '{}',    -- numbers of items this one waits on
  extra            jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  position         double precision not null default extract(epoch from clock_timestamp()),
  archived         boolean not null default false,
  github_item_id   text unique,
  github_url       text,
  created_by       text references public.members (username) on update cascade on delete set null,
  updated_by       text references public.members (username) on update cascade on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint items_dates_in_order check (start_date is null or due_date is null or start_date <= due_date)
);
comment on table public.items is 'Board items (tasks). Blocked = status "Blocked".';
comment on column public.items.extra is
  'Other fields, all text: priority, domain, difficulty, size, task_force, safety_related (field_options names), work_package, reviewer and team_lead (usernames).';
alter sequence public.item_number_seq owned by public.items.number;
alter table public.items drop constraint if exists items_limits;
alter table public.items add constraint items_limits check (
  octet_length(extra::text) <= 8000
  and cardinality(assignees) <= 30
  and cardinality(legacy_assignees) <= 50
  and cardinality(labels) <= 30
  and cardinality(blocked_by) <= 50
  and (github_url is null or (char_length(github_url) <= 300 and github_url ~ '^https://github\.com/'))
);
-- Realtime then sends complete rows on UPDATE (long descriptions are otherwise left out).
alter table public.items replica identity full;
create index if not exists items_status_idx on public.items (status);
create index if not exists items_subteam_idx on public.items (subteam);

create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  item_id     uuid not null,                  -- no foreign key: history outlives deleted items
  item_number bigint,
  username    text,                           -- null when changed by a script or the SQL editor
  action      text not null check (action in ('created', 'updated', 'archived', 'restored', 'deleted')),
  changes     jsonb not null default '{}'::jsonb,  -- { field: { "old": ..., "new": ... } }
  created_at  timestamptz not null default now()
);
comment on table public.activity is 'Who changed what on each item. Written only by the items trigger.';
create index if not exists activity_item_idx on public.activity (item_id, created_at desc);
create index if not exists activity_username_idx on public.activity (username, created_at desc);

-- -----------------------------------------------------------------------------
-- Session helpers
-- -----------------------------------------------------------------------------

create or replace function public.session_is_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) $$;

create or replace function public.board_auth_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select b.auth_mode from public.board_settings b where b.id), 'trust') $$;

-- The member linked to the caller's session, or null. In email_code mode anonymous sessions don't count.
create or replace function public.current_member()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.username
  from public.member_sessions s
  where s.auth_user_id = auth.uid()
    and (not public.session_is_anonymous() or public.board_auth_mode() = 'trust')
$$;

-- Board-admin powers: the member is a board admin AND the session verified their email
-- (or board_settings.trust_mode_admins allows anonymous sessions).
create or replace function public.is_board_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.is_board_admin
       and m.active
       and (not public.session_is_anonymous()
            or coalesce((select b.trust_mode_admins from public.board_settings b where b.id), false))
    from public.members m
    where m.username = public.current_member()
  ), false)
$$;

-- Log in as a member. Links the caller's session to the member, creating the member the first time
-- (that needs a full name). Returns {status: 'ok', member, board_admin_active} or {status: 'needs_name'}.
create or replace function public.claim_member(p_username text, p_full_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_claims   jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_name     text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
  v_member   public.members;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_username !~ public.username_pattern() then
    raise exception 'Invalid university username: %', v_username using errcode = '22023';
  end if;

  if public.session_is_anonymous() then
    if public.board_auth_mode() <> 'trust' then
      raise exception 'Sign in with the code emailed to your university address' using errcode = '42501';
    end if;
  elsif lower(coalesce(v_claims ->> 'email', '')) <> v_username || '@bristol.ac.uk'
        or not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    -- An email session belongs to one verified address, so it may only claim that username.
    raise exception 'This session is signed in with a different or unverified email address' using errcode = '42501';
  end if;

  select * into v_member from public.members where username = v_username;
  if not found then
    if v_name is null then
      return jsonb_build_object('status', 'needs_name', 'username', v_username);
    end if;
    if char_length(v_name) > 100 then
      raise exception 'Full name is too long' using errcode = '22001';
    end if;
    if exists (select 1 from public.member_registrations r where r.auth_user_id = v_uid) then
      raise exception 'This device has already registered a member. Use "Switch user" to register someone else.'
        using errcode = '42501';
    end if;
    if (select count(*) from public.members) >= (select b.member_limit from public.board_settings b where b.id) then
      raise exception 'The board has reached its member limit. Ask a board admin.' using errcode = '54000';
    end if;
    insert into public.members (username, full_name) values (v_username, v_name)
    on conflict (username) do nothing;
    insert into public.member_registrations (auth_user_id, username) values (v_uid, v_username)
    on conflict (auth_user_id) do nothing;
    select * into v_member from public.members where username = v_username;
  end if;

  insert into public.member_sessions (auth_user_id, username)
  values (v_uid, v_username)
  on conflict (auth_user_id) do update set username = excluded.username, last_seen = now();

  return jsonb_build_object('status', 'ok', 'member', to_jsonb(v_member), 'board_admin_active', public.is_board_admin());
end;
$$;

-- The member linked to this session as {member, board_admin_active} (and bump last_seen), or null.
create or replace function public.whoami()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  select m.* into v_member from public.members m where m.username = public.current_member();
  if not found then
    return null;
  end if;
  update public.member_sessions set last_seen = now() where auth_user_id = auth.uid();
  return jsonb_build_object('member', to_jsonb(v_member), 'board_admin_active', public.is_board_admin());
end;
$$;

-- "Switch user": unlink this session from its member.
create or replace function public.release_member()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.member_sessions where auth_user_id = auth.uid()
$$;

-- Members can correct their own full name.
create or replace function public.set_my_name(p_full_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_username text := public.current_member();
  v_name     text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
  v_member   public.members;
begin
  if v_username is null then
    raise exception 'Log in first' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 100 then
    raise exception 'Enter your full name (up to 100 characters)' using errcode = '22023';
  end if;
  update public.members set full_name = v_name where username = v_username returning * into v_member;
  return to_jsonb(v_member);
end;
$$;

-- -----------------------------------------------------------------------------
-- Members: tidy names, keep at least one board admin
-- -----------------------------------------------------------------------------

create or replace function public.members_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  if tg_op = 'INSERT' then
    new.username := lower(btrim(new.username));
    if auth.uid() is not null and new.username !~ public.username_pattern() then
      raise exception 'Invalid university username: %', new.username using errcode = '22023';
    end if;
    return new;
  end if;
  if new.username is distinct from old.username and auth.uid() is not null then
    raise exception 'Usernames cannot be changed' using errcode = '22023';
  end if;
  if old.is_board_admin and not new.is_board_admin
     and not exists (select 1 from public.members m where m.is_board_admin and m.username <> old.username) then
    raise exception 'Keep at least one board admin' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists members_before_write on public.members;
create trigger members_before_write
  before insert or update on public.members
  for each row execute function public.members_before_write();

-- -----------------------------------------------------------------------------
-- Items: attribution, numbering and validation (BEFORE INSERT/UPDATE)
-- -----------------------------------------------------------------------------

create or replace function public.items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_script  boolean := auth.uid() is null;  -- seed/import scripts (secret key) and the SQL editor
  v_member  text := public.current_member();
  v_row     jsonb;
  v_key     text;
  v_value   jsonb;
  v_text    text;
  v_missing text;
begin
  -- Browser sessions must be logged in as a member. Checked first, so a refused write never uses
  -- up an item number.
  if not v_script and v_member is null then
    raise exception 'This device is not logged in as a board member' using errcode = '42501';
  end if;

  -- Who and when, and the import-only columns: never taken from the browser.
  if tg_op = 'INSERT' then
    if v_script then
      new.created_at := coalesce(new.created_at, now());
    else
      if exists (select 1 from public.activity a where a.item_id = new.id) then
        raise exception 'That item id has been used before' using errcode = '23505';
      end if;
      new.created_at := now();
      new.created_by := v_member;
      new.updated_by := v_member;
      new.github_item_id := null;
      new.github_url := null;
      new.legacy_assignees := '{}';
    end if;
  else
    new.id := old.id;
    new.created_at := old.created_at;
    if v_script then
      if new.updated_by is not distinct from old.updated_by then
        new.updated_by := null;  -- changed by a script, the SQL editor or the dashboard
      end if;
    else
      new.number := old.number;
      new.created_by := old.created_by;
      new.updated_by := v_member;
      new.github_item_id := old.github_item_id;
      new.github_url := old.github_url;
      -- Legacy (GitHub) assignees can be removed, not added.
      new.legacy_assignees := array(
        select x from unnest(new.legacy_assignees) x where x = any (old.legacy_assignees)
      );
    end if;
  end if;
  new.updated_at := now();

  -- Tidy values, keeping the order people chose.
  new.title := btrim(new.title);
  if new.title is null or new.title = '' then
    raise exception 'Title is required' using errcode = '23514';
  end if;
  new.status := nullif(btrim(new.status), '');
  new.subteam := nullif(btrim(new.subteam), '');
  new.blocked_reason := nullif(btrim(new.blocked_reason), '');
  new.labels := array(
    select s.label from (
      select btrim(x) as label, min(n) as n
      from unnest(new.labels) with ordinality as u(x, n)
      where btrim(x) <> ''
      group by btrim(x)
    ) s order by s.n
  );
  new.assignees := array(
    select s.username from (
      select lower(btrim(x)) as username, min(n) as n
      from unnest(new.assignees) with ordinality as u(x, n)
      where btrim(x) <> ''
      group by lower(btrim(x))
    ) s order by s.n
  );
  new.position := coalesce(new.position, extract(epoch from clock_timestamp()));
  if exists (select 1 from unnest(new.labels) l where char_length(l) > 50) then
    raise exception 'Labels can be at most 50 characters' using errcode = '23514';
  end if;
  if new.start_date is not null and new.due_date is not null and new.start_date > new.due_date then
    raise exception 'The start date must be on or before the due date' using errcode = '23514';
  end if;

  -- Newly added assignees must be members.
  select string_agg(a, ', ') into v_missing
  from unnest(new.assignees) a
  where not exists (select 1 from public.members m where m.username = a)
    and (tg_op = 'INSERT' or not (a = any (old.assignees)));
  if v_missing is not null then
    raise exception 'Unknown member(s): %', v_missing using errcode = '23503';
  end if;

  -- Status: default to the first option; otherwise it must be an existing option.
  if new.status is null then
    select o.name into new.status
    from public.field_options o
    where o.field = 'status'
    order by o.sort_order, o.name
    limit 1;
    if new.status is null then
      raise exception 'No Status options exist yet: run scripts/seed-and-import.mjs' using errcode = '23502';
    end if;
  elsif (tg_op = 'INSERT' or new.status is distinct from old.status)
        and not exists (select 1 from public.field_options o where o.field = 'status' and o.name = new.status) then
    raise exception 'Unknown Status: %', new.status using errcode = '23503';
  end if;

  -- Subteam: empty, or an existing option.
  if new.subteam is not null
     and (tg_op = 'INSERT' or new.subteam is distinct from old.subteam)
     and not exists (select 1 from public.field_options o where o.field = 'subteam' and o.name = new.subteam) then
    raise exception 'Unknown Subteam: %', new.subteam using errcode = '23503';
  end if;

  -- Custom fields in extra: text only, never named like a real column, options and members checked.
  v_row := to_jsonb(new);
  for v_key, v_value in select e.key, e.value from jsonb_each(new.extra) e loop
    if v_row ? v_key then
      raise exception 'Use the % column, not extra.%', v_key, v_key using errcode = '22023';
    end if;
    if v_key !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'Invalid field name: %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(v_value) = 'null' then
      new.extra := new.extra - v_key;
      continue;
    end if;
    if jsonb_typeof(v_value) <> 'string' then
      raise exception '% must be text', v_key using errcode = '22023';
    end if;
    v_text := btrim(v_value #>> '{}');
    if v_key in ('reviewer', 'team_lead') then
      v_text := lower(v_text);
    end if;
    if v_text = '' then
      new.extra := new.extra - v_key;
      continue;
    end if;
    if char_length(v_text) > 500 then
      raise exception '% is too long', v_key using errcode = '22001';
    end if;
    new.extra := jsonb_set(new.extra, array[v_key], to_jsonb(v_text));
    continue when tg_op = 'UPDATE' and (old.extra ->> v_key) is not distinct from v_text;
    if v_key in ('reviewer', 'team_lead')
       and not exists (select 1 from public.members m where m.username = v_text) then
      raise exception 'Unknown member: %', v_text using errcode = '23503';
    end if;
    if exists (select 1 from public.field_options o where o.field = v_key)
       and not exists (select 1 from public.field_options o where o.field = v_key and o.name = v_text) then
      raise exception 'Unknown % option: %', v_key, v_text using errcode = '23503';
    end if;
  end loop;

  -- The number comes last, once everything is valid. Scripts may set numbers (imports keep GitHub's);
  -- the sequence then moves past them so browser-created items never collide.
  if tg_op = 'INSERT' then
    if v_script and new.number is not null then
      perform setval('public.item_number_seq',
                     greatest(new.number, (select s.last_value from public.item_number_seq s)));
    else
      new.number := nextval('public.item_number_seq');
    end if;
  elsif v_script and new.number is distinct from old.number then
    perform setval('public.item_number_seq',
                   greatest(new.number, (select s.last_value from public.item_number_seq s)));
  end if;

  new.blocked_by := array(
    select distinct b from unnest(new.blocked_by) b where b > 0 and b is distinct from new.number order by 1
  );
  return new;
end;
$$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();

-- Hard deletes (board admins only, by RLS): one item per statement, at most 20 per 10 minutes.
create or replace function public.items_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member text := public.current_member();
begin
  if auth.uid() is not null then
    if v_member is null then
      raise exception 'This device is not logged in as a board member' using errcode = '42501';
    end if;
    if (select count(*) from public.activity a
        where a.username = v_member and a.action = 'deleted' and a.created_at > now() - interval '10 minutes') >= 20 then
      raise exception 'Too many deletions in a short time. Archive items instead, or try again later.'
        using errcode = '54000';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists items_before_delete on public.items;
create trigger items_before_delete
  before delete on public.items
  for each row execute function public.items_before_delete();

create or replace function public.items_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (select count(*) from deleted_rows) > 1 then
    raise exception 'Delete items one at a time' using errcode = '42501';
  end if;
  return null;
end;
$$;

drop trigger if exists items_delete_guard on public.items;
create trigger items_delete_guard
  after delete on public.items
  referencing old table as deleted_rows
  for each statement execute function public.items_delete_guard();

-- -----------------------------------------------------------------------------
-- Items: activity log (AFTER INSERT/UPDATE/DELETE)
-- -----------------------------------------------------------------------------

create or replace function public.items_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Custom fields in extra are diffed one by one next to the real columns (the columns win on a clash).
  v_old     jsonb := case when tg_op = 'INSERT' then '{}'::jsonb
                          else coalesce(old.extra, '{}'::jsonb) || (to_jsonb(old) - 'extra') end;
  v_new     jsonb := case when tg_op = 'DELETE' then '{}'::jsonb
                          else coalesce(new.extra, '{}'::jsonb) || (to_jsonb(new) - 'extra') end;
  v_skip    constant text[] := array['id', 'number', 'position', 'created_at', 'created_by', 'updated_at', 'updated_by'];
  v_empty   constant jsonb[] := array['null', '""', '[]', '{}', 'false']::jsonb[];
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_o       jsonb;
  v_n       jsonb;
  v_action  text;
begin
  for v_key in select k from jsonb_object_keys(v_old || v_new) k order by 1 loop
    continue when v_key = any (v_skip);
    v_o := v_old -> v_key;
    v_n := v_new -> v_key;
    continue when v_o is not distinct from v_n;
    continue when tg_op = 'INSERT' and (v_n is null or v_n = any (v_empty));
    continue when tg_op = 'DELETE' and (v_o is null or v_o = any (v_empty));
    v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_o, 'new', v_n));
  end loop;

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  elsif v_changes = '{}'::jsonb then
    return null;  -- only position (drag to reorder) or nothing changed
  elsif v_changes ? 'archived' then
    v_action := case when new.archived then 'archived' else 'restored' end;
  else
    v_action := 'updated';
  end if;

  insert into public.activity (item_id, item_number, username, action, changes)
  values (coalesce(new.id, old.id), coalesce(new.number, old.number), public.current_member(), v_action, v_changes);
  return null;
end;
$$;

drop trigger if exists items_log_activity on public.items;
create trigger items_log_activity
  after insert or update or delete on public.items
  for each row execute function public.items_log_activity();

-- -----------------------------------------------------------------------------
-- Items: field-level edits, so two people editing different parts of an item at the same time don't
-- overwrite each other. Run with the caller's rights: RLS and the triggers above still apply.
-- -----------------------------------------------------------------------------

-- Set or clear (null or '') some custom fields in extra, leaving the others alone.
create or replace function public.patch_item_extra(p_id uuid, p_changes jsonb)
returns public.items
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row public.items;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'p_changes must be a JSON object' using errcode = '22023';
  end if;
  update public.items i
  set extra = (
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(i.extra || p_changes) e
    where jsonb_typeof(e.value) <> 'null' and e.value <> '""'::jsonb
  )
  where i.id = p_id
  returning i.* into v_row;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- Add and/or remove assignees or labels, leaving everyone else's additions alone.
create or replace function public.patch_item_list(
  p_id uuid, p_field text, p_add text[] default '{}', p_remove text[] default '{}'
)
returns public.items
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row    public.items;
  v_remove text[] := array(select lower(btrim(r)) from unnest(coalesce(p_remove, '{}')) r);
begin
  if p_field = 'assignees' then
    update public.items i
    set assignees = array(
      select x from unnest(i.assignees || coalesce(p_add, '{}')) with ordinality as u(x, n)
      where not (lower(btrim(x)) = any (v_remove)) order by n
    )
    where i.id = p_id
    returning i.* into v_row;
  elsif p_field = 'labels' then
    update public.items i
    set labels = array(
      select x from unnest(i.labels || coalesce(p_add, '{}')) with ordinality as u(x, n)
      where not (lower(btrim(x)) = any (v_remove)) order by n
    )
    where i.id = p_id
    returning i.* into v_row;
  else
    raise exception 'Only assignees and labels can be patched' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Field options: tidy names, protect Blocked, renames update items, options in use can't be deleted
-- -----------------------------------------------------------------------------

drop trigger if exists field_options_before_update on public.field_options;
drop function if exists public.field_options_before_update();

create or replace function public.field_options_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if new.sort_order is null or new.sort_order = 0 then
      new.sort_order := coalesce((select max(o.sort_order) from public.field_options o where o.field = new.field), 0) + 1;
    end if;
    return new;
  end if;
  if new.field is distinct from old.field then
    raise exception 'An option cannot move to another field' using errcode = '22023';
  end if;
  if new.name is distinct from old.name then
    if old.field = 'status' and old.name = 'Blocked' then
      raise exception 'The Blocked status is used by the Blocked view and cannot be renamed' using errcode = '23514';
    end if;
    -- Wait for item edits in progress, and hold new ones, so no item is left on the old name.
    lock table public.items in share row exclusive mode;
  end if;
  return new;
end;
$$;

create or replace function public.field_options_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    if old.field = 'status' then
      update public.items set status = new.name where status = old.name;
    elsif old.field = 'subteam' then
      update public.items set subteam = new.name where subteam = old.name;
    else
      update public.items
      set extra = jsonb_set(extra, array[old.field], to_jsonb(new.name))
      where extra ->> old.field = old.name;
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.field_options_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count    bigint;
  v_archived bigint;
begin
  if old.field = 'status' and old.name = 'Blocked' then
    raise exception 'The Blocked status is used by the Blocked view and cannot be deleted' using errcode = '23514';
  end if;
  if old.field = 'status'
     and not exists (select 1 from public.field_options o where o.field = 'status' and o.id <> old.id) then
    raise exception 'Keep at least one Status option' using errcode = '23514';
  end if;
  lock table public.items in share row exclusive mode;
  if old.field = 'status' then
    select count(*), count(*) filter (where archived) into v_count, v_archived from public.items where status = old.name;
  elsif old.field = 'subteam' then
    select count(*), count(*) filter (where archived) into v_count, v_archived from public.items where subteam = old.name;
  else
    select count(*), count(*) filter (where archived) into v_count, v_archived
    from public.items where extra ->> old.field = old.name;
  end if;
  if v_count > 0 then
    raise exception '% "%" is used by % item(s) (% archived). Move them to another option first.',
      old.field, old.name, v_count, v_archived using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists field_options_before_write on public.field_options;
create trigger field_options_before_write
  before insert or update on public.field_options
  for each row execute function public.field_options_before_write();

drop trigger if exists field_options_after_update on public.field_options;
create trigger field_options_after_update
  after update on public.field_options
  for each row execute function public.field_options_after_update();

drop trigger if exists field_options_before_delete on public.field_options;
create trigger field_options_before_delete
  before delete on public.field_options
  for each row execute function public.field_options_before_delete();

-- -----------------------------------------------------------------------------
-- Row Level Security
--   Only sessions linked to a member can read or change the board. Board-admin powers (hard delete,
--   options, members) go through is_board_admin().
-- -----------------------------------------------------------------------------

alter table public.board_settings       enable row level security;
alter table public.members              enable row level security;
alter table public.member_sessions      enable row level security;
alter table public.member_registrations enable row level security;
alter table public.field_options        enable row level security;
alter table public.items                enable row level security;
alter table public.activity             enable row level security;

drop policy if exists settings_read on public.board_settings;
create policy settings_read on public.board_settings
  for select to authenticated using (true);
-- No write policies: edit board_settings in the SQL Editor.

drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select to authenticated using ((select public.current_member()) is not null);

drop policy if exists members_insert_by_board_admin on public.members;
create policy members_insert_by_board_admin on public.members
  for insert to authenticated with check ((select public.is_board_admin()));

drop policy if exists members_update_by_board_admin on public.members;
create policy members_update_by_board_admin on public.members
  for update to authenticated
  using ((select public.is_board_admin()))
  with check ((select public.is_board_admin()));
-- No delete policy: retire members (active = false) instead; delete in the dashboard if you must.

drop policy if exists sessions_read_own on public.member_sessions;
create policy sessions_read_own on public.member_sessions
  for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_board_admin()));
-- No write policies: claim_member(), whoami() and release_member() manage session links.
-- member_registrations has no policies at all: only claim_member() uses it.

drop policy if exists options_read on public.field_options;
create policy options_read on public.field_options
  for select to authenticated using ((select public.current_member()) is not null);

drop policy if exists options_insert_by_board_admin on public.field_options;
create policy options_insert_by_board_admin on public.field_options
  for insert to authenticated with check ((select public.is_board_admin()));

drop policy if exists options_update_by_board_admin on public.field_options;
create policy options_update_by_board_admin on public.field_options
  for update to authenticated
  using ((select public.is_board_admin()))
  with check ((select public.is_board_admin()));

drop policy if exists options_delete_by_board_admin on public.field_options;
create policy options_delete_by_board_admin on public.field_options
  for delete to authenticated using ((select public.is_board_admin()));

drop policy if exists items_read on public.items;
create policy items_read on public.items
  for select to authenticated using ((select public.current_member()) is not null);

drop policy if exists items_insert_by_member on public.items;
create policy items_insert_by_member on public.items
  for insert to authenticated with check ((select public.current_member()) is not null);

-- An update from an unlinked session matches no rows (items_read hides them), so the app treats
-- "no row returned" as a failed save and rolls back.
drop policy if exists items_update_by_member on public.items;
create policy items_update_by_member on public.items
  for update to authenticated
  using ((select public.current_member()) is not null)
  with check ((select public.current_member()) is not null);

drop policy if exists items_delete_by_board_admin on public.items;
create policy items_delete_by_board_admin on public.items
  for delete to authenticated using ((select public.is_board_admin()));

drop policy if exists activity_read on public.activity;
create policy activity_read on public.activity
  for select to authenticated using ((select public.current_member()) is not null);
-- No write policies: only the items trigger writes activity.

-- -----------------------------------------------------------------------------
-- Privileges (RLS applies on top). The app always signs in first, so the anon role gets nothing.
-- -----------------------------------------------------------------------------

revoke all on table public.board_settings, public.members, public.member_sessions, public.member_registrations,
  public.field_options, public.items, public.activity
  from anon, authenticated;
grant select on table public.board_settings, public.members, public.member_sessions, public.field_options,
  public.items, public.activity
  to authenticated;
grant insert (username, full_name, github_login, active) on table public.members to authenticated;
grant update (full_name, github_login, is_board_admin, active) on table public.members to authenticated;
grant insert, update, delete on table public.field_options to authenticated;
grant insert, update, delete on table public.items to authenticated;
revoke all on sequence public.item_number_seq from anon, authenticated;
grant usage on sequence public.item_number_seq to authenticated;
do $$
begin
  execute format('revoke all on sequence %s from anon, authenticated', pg_get_serial_sequence('public.activity', 'id'));
end;
$$;

revoke execute on function
  public.username_pattern(), public.session_is_anonymous(), public.board_auth_mode(), public.current_member(),
  public.is_board_admin(), public.claim_member(text, text), public.whoami(), public.release_member(),
  public.set_my_name(text), public.patch_item_extra(uuid, jsonb), public.patch_item_list(uuid, text, text[], text[])
  from public, anon;
grant execute on function
  public.username_pattern(), public.session_is_anonymous(), public.board_auth_mode(), public.current_member(),
  public.is_board_admin(), public.claim_member(text, text), public.whoami(), public.release_member(),
  public.set_my_name(text), public.patch_item_extra(uuid, jsonb), public.patch_item_list(uuid, text, text[], text[])
  to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: broadcast row changes on these tables to signed-in members
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['items', 'members', 'field_options', 'activity'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
