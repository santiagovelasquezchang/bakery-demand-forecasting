-- Admin access now requires a second factor (authenticator app): session must be aal2.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
     and exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- Lets the portal tell "not an admin" apart from "admin who still needs the 2FA code".
create or replace function public.is_admin_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin_account() from public;
grant execute on function public.is_admin_account() to authenticated;
