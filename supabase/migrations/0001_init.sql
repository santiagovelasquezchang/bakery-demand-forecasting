-- Sample Bakery: orders, quotes, blocked days, admin access.
-- Customers never read tables directly; they submit through the submit_* functions.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create sequence public.order_number_seq start 1001;
create sequence public.quote_number_seq start 501;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('ORD-' || nextval('public.order_number_seq')),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  customer_name text not null check (length(customer_name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null check (length(phone) <= 40),
  pickup_date date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  total numeric(10, 2) not null check (total >= 0 and total < 100000),
  has_custom boolean not null default false,
  decline_reason text,
  response_message text,
  suggested_date date,
  responded_at timestamptz,
  email_sent boolean not null default false
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('Q-' || nextval('public.quote_number_seq')),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'conversation')),
  occasion text not null check (length(occasion) <= 60),
  servings int not null check (servings between 1 and 1000),
  description text not null check (length(description) between 1 and 1500),
  event_date date not null,
  budget text check (length(budget) <= 40),
  customer_name text not null check (length(customer_name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (length(phone) <= 40),
  ref_image text check (ref_image ~ '^assets/img/[a-z0-9-]+\.jpg$'),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  quoted_price numeric(10, 2),
  decline_reason text,
  response_message text,
  suggested_date date,
  responded_at timestamptz,
  email_sent boolean not null default false
);

create table public.blocked_dates (
  day date primary key,
  note text check (length(note) <= 120),
  created_at timestamptz not null default now()
);

create index orders_pickup_date_idx on public.orders (pickup_date);
create index orders_status_idx on public.orders (status);
create index quotes_event_date_idx on public.quotes (event_date);
create index quotes_status_idx on public.quotes (status);

alter table public.admins enable row level security;
alter table public.orders enable row level security;
alter table public.quotes enable row level security;
alter table public.blocked_dates enable row level security;

create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "admin full access orders" on public.orders
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin full access quotes" on public.quotes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin full access blocked" on public.blocked_dates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Public: is a date open? (blocked day, or too soon)
create or replace function public.date_available(p_day date, p_min_days int default 3)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_day >= (now() at time zone 'America/New_York')::date + greatest(p_min_days, 3)
     and not exists (select 1 from public.blocked_dates where day = p_day);
$$;

create or replace function public.submit_order(
  p_name text, p_email text, p_phone text, p_pickup_date date, p_items jsonb, p_total numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_custom boolean := exists (select 1 from jsonb_array_elements(p_items) i where i ->> 'type' = 'custom');
  v_number text;
begin
  if not public.date_available(p_pickup_date, case when v_custom then 7 else 3 end) then
    raise exception 'DATE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.orders (customer_name, email, phone, pickup_date, items, total, has_custom)
  values (trim(p_name), lower(trim(p_email)), trim(p_phone), p_pickup_date, p_items, p_total, v_custom)
  returning number into v_number;
  return v_number;
end;
$$;

create or replace function public.submit_quote(
  p_occasion text, p_servings int, p_description text, p_event_date date, p_budget text,
  p_name text, p_email text, p_phone text, p_ref_image text, p_photo_paths text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if not public.date_available(p_event_date, 7) then
    raise exception 'DATE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_photo_paths, '{}')) p where p !~ '^incoming/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$') then
    raise exception 'BAD_PHOTO_PATH' using errcode = 'P0001';
  end if;
  insert into public.quotes (occasion, servings, description, event_date, budget, customer_name, email, phone, ref_image, photo_paths)
  values (p_occasion, p_servings, trim(p_description), p_event_date, nullif(p_budget, ''), trim(p_name),
          lower(trim(p_email)), nullif(trim(p_phone), ''), nullif(p_ref_image, ''), coalesce(p_photo_paths, '{}'))
  returning number into v_number;
  return v_number;
end;
$$;

revoke all on function public.submit_order(text, text, text, date, jsonb, numeric) from public;
revoke all on function public.submit_quote(text, int, text, date, text, text, text, text, text, text[]) from public;
revoke all on function public.date_available(date, int) from public;
grant execute on function public.submit_order(text, text, text, date, jsonb, numeric) to anon, authenticated;
grant execute on function public.submit_quote(text, int, text, date, text, text, text, text, text, text[]) to anon, authenticated;
grant execute on function public.date_available(date, int) to anon, authenticated;

-- Reference photos: customers can upload (not read) into incoming/, only admin can read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-photos', 'quote-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

create policy "anyone uploads quote photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'quote-photos' and (storage.foldername(name))[1] = 'incoming');

create policy "admin reads quote photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-photos' and (select public.is_admin()));
