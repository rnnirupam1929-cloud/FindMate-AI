-- FindMate AI: core schema (PostgreSQL / Supabase). Mirrors backend/app/models.
-- Run in the Supabase SQL editor, or: psql "$DATABASE_URL" -f 001_schema.sql
create extension if not exists "pgcrypto";

create table if not exists institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  city text,
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per Supabase Auth user. id = auth.users.id
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student','admin','verification_agent')),
  institution_id uuid references institutions(id),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lost','found')),
  user_id uuid not null references profiles(id),
  institution_id uuid references institutions(id),
  title varchar(160) not null default '',
  category varchar(40) not null default 'other',
  description text not null default '',
  color varchar(40),
  brand varchar(80),
  location_name varchar(200),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  event_date timestamptz,
  approx_time varchar(40),
  additional_details text,
  private_clues text,                 -- found items only; never exposed to other users
  verification_questions jsonb,
  status varchar(20) not null default 'draft' check (status in ('draft','open','matched','recovered','closed')),
  is_flagged boolean not null default false,
  flag_reason varchar(300),
  is_hidden boolean not null default false,
  visual_features jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_reports_user on reports(user_id);
create index if not exists ix_reports_search on reports(institution_id, kind, status, category);
create index if not exists ix_reports_created on reports(created_at desc);

create table if not exists report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  storage_path varchar(300) not null,
  mime_type varchar(50) not null,
  size_bytes integer not null,
  width integer,
  height integer,
  sha256 varchar(64) not null,
  exif_stripped boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_report_images_report on report_images(report_id);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid not null references reports(id) on delete cascade,
  found_report_id uuid not null references reports(id) on delete cascade,
  score double precision not null check (score >= 0 and score <= 100),
  breakdown jsonb not null default '{}',
  reasons jsonb not null default '[]',
  status varchar(20) not null default 'suggested' check (status in ('suggested','dismissed','verifying','confirmed','flagged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_match_pair unique (lost_report_id, found_report_id)
);
create index if not exists ix_matches_lost on matches(lost_report_id);
create index if not exists ix_matches_found on matches(found_report_id);

create table if not exists verification_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  claimant_id uuid not null references profiles(id),
  reviewer_id uuid references profiles(id),
  status varchar(20) not null default 'pending' check (status in ('pending','under_review','approved','rejected','completed')),
  reviewer_note text,
  handover_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_verif_match on verification_requests(match_id);
create index if not exists ix_verif_claimant on verification_requests(claimant_id);

create table if not exists verification_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  question varchar(300) not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_vanswers_request on verification_answers(request_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type varchar(40) not null,
  title varchar(200) not null,
  body varchar(500) not null default '',
  link varchar(200),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_notifications_user on notifications(user_id, is_read, created_at desc);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  action varchar(60) not null,
  entity_type varchar(40),
  entity_id varchar(40),
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_activity_user on activity_logs(user_id, created_at desc);

create table if not exists recoveries (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique references verification_requests(id),
  lost_report_id uuid not null references reports(id),
  found_report_id uuid not null references reports(id),
  institution_id uuid references institutions(id),
  location_name varchar(200),
  latitude double precision,
  longitude double precision,
  handover_note text,
  recovered_at timestamptz not null default now()
);

create table if not exists agent_logs (
  id uuid primary key default gen_random_uuid(),
  run_id varchar(40) not null,
  agent varchar(40) not null,
  status varchar(20) not null,
  input_summary varchar(500),
  output_summary varchar(500),
  duration_ms integer not null default 0,
  attempts integer not null default 1,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ix_agent_logs_run on agent_logs(run_id);
create index if not exists ix_agent_logs_agent on agent_logs(agent, created_at desc);

-- updated_at maintenance
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
do $$
declare t text;
begin
  foreach t in array array['institutions','profiles','reports','matches','verification_requests'] loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s; create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at();', t);
  end loop;
end $$;

insert into institutions (name, slug, city, latitude, longitude)
values ('Dayananda Sagar University', 'dsu', 'Bengaluru', 12.6614291, 77.4508298)
on conflict (slug) do nothing;

update institutions
set latitude = 12.6614291, longitude = 77.4508298
where slug = 'dsu' and latitude = 12.8625 and longitude = 77.4375;
