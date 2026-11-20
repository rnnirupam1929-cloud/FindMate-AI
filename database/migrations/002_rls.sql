-- Row Level Security.
-- The FastAPI backend connects with a privileged role (service role / postgres) and enforces
-- authorisation in code. RLS is defence in depth: it protects data if the Supabase anon/authenticated
-- keys are ever used directly against PostgREST. Anything not granted below is denied.

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(current_role_name() in ('admin','verification_agent'), false) $$;

alter table institutions          enable row level security;
alter table profiles              enable row level security;
alter table reports               enable row level security;
alter table report_images         enable row level security;
alter table matches               enable row level security;
alter table verification_requests enable row level security;
alter table verification_answers  enable row level security;
alter table notifications         enable row level security;
alter table activity_logs         enable row level security;
alter table recoveries            enable row level security;
alter table agent_logs            enable row level security;

-- institutions: readable by everyone signed in; writes go through the API (admin only)
create policy inst_read  on institutions for select to authenticated using (is_active or current_role_name() = 'admin');

-- profiles: a user sees and edits only their own row (cannot change role/suspension); admins see all
create policy prof_self_read   on profiles for select to authenticated using (id = auth.uid() or current_role_name() = 'admin');
create policy prof_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Column-level grants below make role / is_suspended / email impossible to change from the client.
-- (A policy-only check is not enough: tested, a student could self-promote.) Admin changes go via the API.

-- reports: owners and staff can read; all writes go through the API (it validates, sanitises and runs matching). Other users never read reports
-- directly: the API returns a sanitised public view (no private_clues, rounded coordinates) for matches.
create policy rep_owner_read on reports for select to authenticated using (user_id = auth.uid());
create policy rep_staff_read on reports for select to authenticated using (is_staff());

create policy img_owner on report_images for select to authenticated
  using (exists (select 1 from reports r where r.id = report_id and r.user_id = auth.uid()));
create policy img_staff on report_images for select to authenticated using (is_staff());

-- matches: only the two owners (and staff)
create policy match_party on matches for select to authenticated using (
  exists (select 1 from reports r where r.id in (lost_report_id, found_report_id) and r.user_id = auth.uid()) or is_staff());

-- verification: claimant, the finder, and staff only. Answers are the most sensitive table.
create policy ver_party on verification_requests for select to authenticated using (
  claimant_id = auth.uid()
  or exists (select 1 from matches m join reports f on f.id = m.found_report_id where m.id = match_id and f.user_id = auth.uid())
  or is_staff());
create policy ans_party on verification_answers for select to authenticated using (
  exists (select 1 from verification_requests v where v.id = request_id and (
    v.claimant_id = auth.uid()
    or exists (select 1 from matches m join reports f on f.id = m.found_report_id where m.id = v.match_id and f.user_id = auth.uid())
    or is_staff())));

-- notifications: own only; may mark own as read
create policy notif_read   on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- activity: own entries; admins everything
create policy act_read on activity_logs for select to authenticated using (user_id = auth.uid() or current_role_name() = 'admin');

-- recoveries: parties and staff
create policy rec_read on recoveries for select to authenticated using (
  exists (select 1 from reports r where r.id in (lost_report_id, found_report_id) and r.user_id = auth.uid()) or is_staff());

-- agent_logs: admins only
create policy agent_admin on agent_logs for select to authenticated using (current_role_name() = 'admin');

-- No insert/delete policies for verification, matches, notifications, logs or recoveries: only the backend
-- (service role, which bypasses RLS) may create them.

-- Privileges: start from nothing, then grant the minimum. Supabase grants broad defaults to anon/authenticated.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;
grant select on institutions, reports, report_images, matches, verification_requests, verification_answers,
                notifications, activity_logs, recoveries, agent_logs, profiles to authenticated;
grant update (full_name, institution_id) on profiles to authenticated;   -- NOT role, email, is_suspended
grant update (is_read) on notifications to authenticated;
