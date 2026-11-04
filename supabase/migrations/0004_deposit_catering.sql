-- 50% deposit (percent editable in site_settings 'deposit') on every order and quote,
-- and catering requests, which arrive as quotes of kind 'catering'.

alter table public.orders
  add column deposit_amount numeric(10, 2),
  add column deposit_paid boolean not null default false,
  add column deposit_paid_at timestamptz;

alter table public.quotes
  add column kind text not null default 'cake' check (kind in ('cake', 'catering')),
  add column package text check (length(package) <= 80),
  add column deposit_paid boolean not null default false,
  add column deposit_paid_at timestamptz;

create or replace function public.deposit_percent()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value ->> 'percent')::numeric from public.site_settings where key = 'deposit'), 50);
$$;
revoke all on function public.deposit_percent() from public;

create or replace function public.submit_order(
  p_name text, p_email text, p_phone text, p_pickup_date date, p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_price numeric;
  v_qty int;
  v_total numeric := 0;
  v_custom boolean := false;
  v_number text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'BAD_ITEMS' using errcode = 'P0001';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_price := public.catalog_item_price(v_item);
    if v_price is null then raise exception 'ITEM_UNAVAILABLE' using errcode = 'P0001'; end if;
    v_qty := case when v_item ->> 'qty' ~ '^\d{1,2}$' then (v_item ->> 'qty')::int end;
    if v_qty is null or v_qty not between 1 and 20 or (v_item ->> 'type' = 'custom' and v_qty <> 1) then
      raise exception 'BAD_QTY' using errcode = 'P0001';
    end if;
    if v_item ->> 'unitPrice' !~ '^\d+(\.\d+)?$' or abs(v_price - (v_item ->> 'unitPrice')::numeric) > 0.009 then
      raise exception 'PRICE_CHANGED' using errcode = 'P0001';
    end if;
    v_custom := v_custom or v_item ->> 'type' = 'custom';
    v_total := v_total + v_price * v_qty;
  end loop;

  if not public.date_available(p_pickup_date, public.lead_days(v_custom)) then
    raise exception 'DATE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.orders (customer_name, email, phone, pickup_date, items, total, has_custom, deposit_amount)
  values (trim(p_name), lower(trim(p_email)), trim(p_phone), p_pickup_date, p_items, v_total, v_custom,
          round(v_total * public.deposit_percent() / 100, 2))
  returning number into v_number;
  return v_number;
end;
$$;
revoke all on function public.submit_order(text, text, text, date, jsonb) from public;
grant execute on function public.submit_order(text, text, text, date, jsonb) to anon, authenticated;

create or replace function public.submit_catering(
  p_package text, p_guests int, p_description text, p_event_date date, p_budget text,
  p_name text, p_email text, p_phone text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if not public.date_available(p_event_date, public.lead_days(true)) then
    raise exception 'DATE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.quotes (kind, package, occasion, servings, description, event_date, budget, customer_name, email, phone)
  values ('catering', nullif(trim(p_package), ''), 'Catering', p_guests, trim(p_description), p_event_date,
          nullif(p_budget, ''), trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''))
  returning number into v_number;
  return v_number;
end;
$$;
revoke all on function public.submit_catering(text, int, text, date, text, text, text, text) from public;
grant execute on function public.submit_catering(text, int, text, date, text, text, text, text) to anon, authenticated;
