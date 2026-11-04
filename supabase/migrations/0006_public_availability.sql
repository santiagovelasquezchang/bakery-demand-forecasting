-- Customers see which days the baker has blocked (dates only — private notes stay private).
create or replace function public.public_blocked_days(p_from date, p_to date)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select day from public.blocked_dates
  where day between p_from and least(p_to, p_from + 400)
  order by day;
$$;
revoke all on function public.public_blocked_days(date, date) from public;
grant execute on function public.public_blocked_days(date, date) to anon, authenticated;

-- One week's notice for every order for now (the baker can change it in "Precios y menú").
update public.site_settings set value = '{"ready":7,"custom":7}'::jsonb where key = 'lead_days';
