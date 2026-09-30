-- =====================================================================
-- OmniScope Sales – database schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it drops and recreates functions/policies/triggers.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILES (one row per login, linked to Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'member' check (role in ('admin','member')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helper functions (security definer so policies don't recurse)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Every new auth user gets a profile. Role is ALWAYS 'member' here;
-- admins are promoted only by an existing admin (or by SQL for the first admin).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. LEADS
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  company             text default '',
  brand               text not null,
  owner_id            uuid not null references public.profiles(id),
  lead_date           date not null default current_date,
  lead_source         text not null,
  lead_stage          text not null default 'Discovery'
                      check (lead_stage in ('Discovery','Qualified','Opportunity','Pilot/POC','Proposal','Value Negotiation','Closed Lost','Closed Won','Client','New','Contacted','Meeting Scheduled','Proposal Sent','Negotiation','Won','Lost')),
  connect_date        date,
  comments            text,
  followup2_date      date,
  followup2_comments  text,
  lead_status         text not null default 'New'
                      check (lead_status in ('New','Attempted to Contact','Contacted','Demo Scheduled','Prospect (Meeting/Demo done)','Junk Lead','Closed Lost','Nurture','Opportunity','Hot','Warm','Cold','Converted','Dropped')),
  created_by          uuid references public.profiles(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint email_format check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint brand_not_blank check (length(trim(brand)) > 0)
);

-- Ensure company column exists on existing installations
alter table public.leads add column if not exists company text default '';

-- Remove restrictive check constraints so custom stages and statuses never fail
alter table public.leads drop constraint if exists leads_lead_stage_check;
alter table public.leads drop constraint if exists leads_lead_status_check;

create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_stage_idx on public.leads (lead_stage);
create index if not exists leads_date_idx  on public.leads (lead_date desc);

-- Keep updated_at fresh + keep status consistent with Closed Won / Closed Lost
create or replace function public.leads_before_write()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  new.brand := trim(new.brand);
  if new.lead_stage = 'Closed Won' or new.lead_stage = 'Client' then new.lead_status := 'Opportunity'; end if;
  if new.lead_stage = 'Closed Lost' then new.lead_status := 'Closed Lost'; end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;

drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write
  before insert or update on public.leads
  for each row execute function public.leads_before_write();

-- ---------------------------------------------------------------------
-- 3. ACTIVITY LOG (written only by trigger, never by the app directly)
-- ---------------------------------------------------------------------
create table if not exists public.lead_activity (
  id             bigint generated always as identity primary key,
  lead_id        uuid,             -- no FK: history survives deletes
  lead_owner_id  uuid,
  actor_id       uuid,
  actor_name     text,
  action         text not null check (action in ('created','updated','deleted')),
  brand          text,
  changes        jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists activity_lead_idx  on public.lead_activity (lead_id);
create index if not exists activity_owner_idx on public.lead_activity (lead_owner_id);
create index if not exists activity_time_idx  on public.lead_activity (created_at desc);

create or replace function public.log_lead_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_name text;
  v_changes    jsonb;
begin
  select full_name into v_actor_name from public.profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.lead_activity (lead_id, lead_owner_id, actor_id, actor_name, action, brand, changes)
    values (new.id, new.owner_id, auth.uid(), v_actor_name, 'created', new.brand, null);
    return new;

  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changes
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('updated_at');
    if v_changes is null then return new; end if;
    insert into public.lead_activity (lead_id, lead_owner_id, actor_id, actor_name, action, brand, changes)
    values (new.id, new.owner_id, auth.uid(), v_actor_name, 'updated', new.brand, v_changes);
    return new;

  else -- DELETE
    insert into public.lead_activity (lead_id, lead_owner_id, actor_id, actor_name, action, brand, changes)
    values (old.id, old.owner_id, auth.uid(), v_actor_name, 'deleted', old.brand,
            jsonb_build_object('email', jsonb_build_object('from', old.email, 'to', null)));
    return old;
  end if;
end $$;

drop trigger if exists leads_activity on public.leads;
create trigger leads_activity
  after insert or update or delete on public.leads
  for each row execute function public.log_lead_activity();

-- ---------------------------------------------------------------------
-- 4. DUPLICATE CHECK (searches ALL leads, returns only what's needed)
-- ---------------------------------------------------------------------
create or replace function public.find_duplicate_lead(p_email text, p_exclude uuid default null)
returns table (brand text, owner_name text, lead_stage text)
language sql stable security definer set search_path = public as $$
  select l.brand, p.full_name, l.lead_stage
    from public.leads l
    join public.profiles p on p.id = l.owner_id
   where public.is_active_user()
     and lower(l.email) = lower(trim(p_email))
     and (p_exclude is null or l.id <> p_exclude)
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY  (this is what keeps each member's data private)
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_activity enable row level security;

-- profiles
drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- (no insert/update/delete policies: changes go through trigger or server-side admin actions)

-- leads
drop policy if exists "leads: read own or admin" on public.leads;
create policy "leads: read own or admin" on public.leads
  for select to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()));

drop policy if exists "leads: insert own or admin" on public.leads;
create policy "leads: insert own or admin" on public.leads
  for insert to authenticated
  with check (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()));

drop policy if exists "leads: update own or admin" on public.leads;
create policy "leads: update own or admin" on public.leads
  for update to authenticated
  using      (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()))
  with check (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()));

drop policy if exists "leads: admin delete" on public.leads;
create policy "leads: admin delete" on public.leads
  for delete to authenticated
  using (public.is_admin());

-- activity
drop policy if exists "activity: read own leads or admin" on public.lead_activity;
create policy "activity: read own leads or admin" on public.lead_activity
  for select to authenticated
  using (public.is_active_user() and (lead_owner_id = auth.uid() or public.is_admin()));

-- Anonymous (logged-out) users get nothing
revoke all on public.profiles, public.leads, public.lead_activity from anon;
revoke execute on function public.find_duplicate_lead(text, uuid) from anon, public;
grant  execute on function public.find_duplicate_lead(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. REALTIME (admin dashboard updates live when a member edits a lead)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

-- =====================================================================
-- AFTER RUNNING: make yourself the first admin (replace the email):
--
--   update public.profiles set role = 'admin', full_name = 'Your Name'
--   where email = 'you@tecnoprism.com';
-- =====================================================================
