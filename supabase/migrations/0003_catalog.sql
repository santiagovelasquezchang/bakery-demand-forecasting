-- Catalog the baker edits from the portal: ready-made cakes, Custom Cake Builder options, site settings.
-- Everyone can read what's active; only the admin (2FA session) can change it.
-- Order totals are recomputed here from the catalog, so the browser can't set its own prices.

create table public.catalog_products (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (length(name) between 1 and 80),
  tag text check (length(tag) <= 40),
  description text check (length(description) <= 600),
  image_url text check (length(image_url) <= 500),
  sizes jsonb not null check (jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) between 1 and 10),
  flavors text[] check (cardinality(flavors) <= 30),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.builder_options (
  id uuid primary key default gen_random_uuid(),
  grp text not null check (grp in ('size', 'shape', 'flavor', 'filling', 'style', 'color', 'accent', 'topper')),
  key text not null check (key ~ '^[a-z0-9-]{1,40}$'),
  label text not null check (length(label) between 1 and 80),
  detail text check (length(detail) <= 120),
  price numeric(10, 2) not null default 0 check (price >= 0 and price < 10000),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  unique (grp, key)
);

create table public.site_settings (
  key text primary key check (key in ('lead_days', 'cafe', 'portions', 'deposit')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.catalog_products enable row level security;
alter table public.builder_options enable row level security;
alter table public.site_settings enable row level security;

create policy "public reads active products" on public.catalog_products for select to anon, authenticated using (active);
create policy "public reads active options" on public.builder_options for select to anon, authenticated using (active);
create policy "public reads settings" on public.site_settings for select to anon, authenticated using (true);

create policy "admin manages products" on public.catalog_products
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages options" on public.builder_options
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages settings" on public.site_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Product photos: public to view, only admin uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "admin uploads catalog photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'catalog' and (select public.is_admin()));
create policy "admin updates catalog photos" on storage.objects
  for update to authenticated using (bucket_id = 'catalog' and (select public.is_admin()));
create policy "admin deletes catalog photos" on storage.objects
  for delete to authenticated using (bucket_id = 'catalog' and (select public.is_admin()));

-- What the website loads: one call, active items only.
create or replace function public.public_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'tag', tag, 'description', description, 'image_url', image_url,
        'sizes', sizes, 'flavors', flavors) order by sort, name)
      from public.catalog_products where active), '[]'::jsonb),
    'options', coalesce((select jsonb_agg(jsonb_build_object(
        'grp', grp, 'key', key, 'label', label, 'detail', detail, 'price', price, 'meta', meta) order by grp, sort, label)
      from public.builder_options where active), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(key, value) from public.site_settings), '{}'::jsonb)
  );
$$;
grant execute on function public.public_catalog() to anon, authenticated;

-- Price of one cart line from the current catalog; null if anything in it is no longer offered.
create or replace function public.catalog_item_price(p_item jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := p_item -> 'config';
  v_total numeric;
  v_tiers int;
  v_p numeric;
  v_grp text;
begin
  if p_item ->> 'type' = 'product' then
    select (s ->> 'price')::numeric into v_p
    from public.catalog_products p cross join lateral jsonb_array_elements(p.sizes) s
    where p.id = p_item ->> 'productId' and p.active and s ->> 'id' = p_item ->> 'sizeId';
    return v_p;
  end if;

  if p_item ->> 'type' is distinct from 'custom' or jsonb_typeof(v_cfg) is distinct from 'object' then
    return null;
  end if;

  select price, coalesce((meta ->> 'tiers')::int, 1) into v_total, v_tiers
  from public.builder_options where grp = 'size' and key = v_cfg ->> 'size' and active;
  if not found then return null; end if;

  foreach v_grp in array array['shape', 'accent', 'topper', 'color'] loop
    select price into v_p from public.builder_options where grp = v_grp and key = v_cfg ->> v_grp and active;
    if not found then return null; end if;
    v_total := v_total + v_p;
  end loop;

  foreach v_grp in array array['filling', 'style'] loop
    select price into v_p from public.builder_options where grp = v_grp and key = v_cfg ->> v_grp and active;
    if not found then return null; end if;
    v_total := v_total + v_p * v_tiers;
  end loop;

  for i in 0 .. v_tiers - 1 loop
    select price into v_p from public.builder_options where grp = 'flavor' and key = v_cfg -> 'flavors' ->> i and active;
    if not found then return null; end if;
    v_total := v_total + v_p;
  end loop;

  return v_total;
end;
$$;
revoke all on function public.catalog_item_price(jsonb) from public;

create or replace function public.lead_days(p_custom boolean)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value ->> case when p_custom then 'custom' else 'ready' end)::int
                   from public.site_settings where key = 'lead_days'), case when p_custom then 7 else 3 end);
$$;
revoke all on function public.lead_days(boolean) from public;

create or replace function public.date_available(p_day date, p_min_days int default 3)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_day >= (now() at time zone 'America/New_York')::date + greatest(p_min_days, 1)
     and not exists (select 1 from public.blocked_dates where day = p_day);
$$;

-- The earlier submit_order (which trusted the browser's total) is kept but no longer callable.
revoke execute on function public.submit_order(text, text, text, date, jsonb, numeric) from anon, authenticated;

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

  insert into public.orders (customer_name, email, phone, pickup_date, items, total, has_custom)
  values (trim(p_name), lower(trim(p_email)), trim(p_phone), p_pickup_date, p_items, v_total, v_custom)
  returning number into v_number;
  return v_number;
end;
$$;
revoke all on function public.submit_order(text, text, text, date, jsonb) from public;
grant execute on function public.submit_order(text, text, text, date, jsonb) to anon, authenticated;

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
  if not public.date_available(p_event_date, public.lead_days(true)) then
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

-- Seed: the catalog the site launched with (same as js/data.js DEFAULT_CATALOG).
insert into public.catalog_products (id, name, tag, description, image_url, sizes, flavors, sort) values
('strawberry-daisy', 'Strawberry & Daisy Cake', 'Fresh & Floral',
 'Silky white buttercream crowned with fresh strawberries, raspberries, lemon slices and little daisies. Light, bright and made for spring birthdays and brunches.',
 'assets/img/strawberry.svg', '[{"id":"6","label":"6\" · serves 10–12","price":48},{"id":"8","label":"8\" · serves 20–24","price":68}]',
 array['Vanilla', 'Strawberry', 'Lemon', 'Lemon Raspberry'], 1),
('signature-red', 'Signature Red Vintage Cake', 'Vintage Piping',
 'Our most-loved look: deep red buttercream with layered vintage shell piping and a hand-piped monogram. Bold, romantic and totally photo-ready.',
 'assets/img/hero-red.svg', '[{"id":"6","label":"6\" · serves 10–12","price":58},{"id":"8","label":"8\" · serves 20–24","price":78}]',
 array['Red Velvet', 'Vanilla', 'Chocolate', 'Marble (Chocolate & Vanilla)'], 2),
('character-birthday', 'Character Birthday Cake', 'Sculpted · Kids',
 'A hand-sculpted character of your choice with a sprinkle party hat and a birthday plaque. Every face comes out a little different.',
 'assets/img/character.svg', '[{"id":"6","label":"6\" · serves 10–12","price":72}]',
 array['Vanilla', 'Chocolate', 'Marble (Chocolate & Vanilla)', 'Strawberry'], 3),
('tres-leches', 'Tres Leches', 'House Classic',
 'Sponge cake soaked in three milks and topped with whipped cream. Sold by the portion or by the tray.',
 null, '[{"id":"portion","label":"Single portion","price":6},{"id":"8x8","label":"8×8 tray · 8 portions","price":40},{"id":"9x12","label":"9×12 tray · 12 portions","price":55}]',
 array['Vanilla', 'Chocolate', 'Marble', 'Strawberry'], 4),
('pound-cake', 'Butter Pound Cake', 'Bakery Treat', 'A tender, buttery loaf cake sold by the slice. Perfect with coffee.',
 null, '[{"id":"each","label":"Slice","price":3}]', null, 5);

insert into public.builder_options (grp, key, label, detail, price, meta, sort) values
('size', '6-1', '1 tier · 6"', null, 45, '{"tiers":1,"diameters":[6],"height":4}', 1),
('size', '8-1', '1 tier · 8"', null, 65, '{"tiers":1,"diameters":[8],"height":4}', 2),
('size', '2t', '2 tiers · 6" + 8"', null, 120, '{"tiers":2,"diameters":[8,6],"height":4}', 3),
('size', '3t', '3 tiers · 6" + 8" + 10"', null, 220, '{"tiers":3,"diameters":[10,8,6],"height":4}', 4),
('shape', 'round', 'Round', null, 0, '{}', 1),
('shape', 'square', 'Square', null, 10, '{}', 2),
('flavor', 'vanilla', 'Vanilla', null, 0, '{}', 1),
('flavor', 'chocolate', 'Chocolate', null, 0, '{}', 2),
('flavor', 'orange', 'Orange', null, 0, '{}', 3),
('flavor', 'lemon', 'Lemon', null, 0, '{}', 4),
('flavor', 'strawberry', 'Strawberry', null, 0, '{}', 5),
('flavor', 'red-velvet', 'Red Velvet', null, 0, '{}', 6),
('flavor', 'marble', 'Marble (Chocolate & Vanilla)', null, 0, '{}', 7),
('flavor', 'lemon-blueberry', 'Lemon Blueberry', null, 0, '{}', 8),
('flavor', 'lemon-raspberry', 'Lemon Raspberry', null, 0, '{}', 9),
('flavor', 'carrot', 'Carrot Cake', null, 0, '{}', 10),
('flavor', 'apple-walnut', 'Apple & Walnut', null, 0, '{}', 11),
('flavor', 'tl-vanilla', 'Tres Leches Vanilla', null, 10, '{}', 12),
('flavor', 'tl-chocolate', 'Tres Leches Chocolate', null, 10, '{}', 13),
('flavor', 'tl-marble', 'Tres Leches Marble', null, 10, '{}', 14),
('flavor', 'tl-strawberry', 'Tres Leches Strawberry', null, 10, '{}', 15),
('filling', 'buttercream', 'Vanilla buttercream', 'Classic & light', 0, '{}', 1),
('filling', 'jam', 'Strawberry jam', 'House-made', 0, '{}', 2),
('filling', 'dulce', 'Dulce de leche', 'Rich caramel', 5, '{}', 3),
('filling', 'creamcheese', 'Cream cheese', 'Tangy & smooth', 5, '{}', 4),
('filling', 'ganache', 'Chocolate ganache', 'Dark & silky', 5, '{}', 5),
('filling', 'lemoncurd', 'Lemon curd', 'Bright & zesty', 5, '{}', 6),
('filling', 'strawberries', 'Fresh strawberries & cream', 'Seasonal', 8, '{}', 7),
('style', 'smooth', 'Smooth Buttercream', 'Clean, classic finish', 0, '{"look":"smooth"}', 1),
('style', 'naked', 'Semi-Naked', 'Rustic, layers peek through', 0, '{"look":"naked"}', 2),
('style', 'vintage', 'Vintage Piping', 'Our signature shells & ruffles', 20, '{"look":"vintage"}', 3),
('style', 'drip', 'Chocolate Drip', 'Glossy ganache drip', 12, '{"look":"drip"}', 4),
('style', 'fruit', 'Fresh Fruit & Flowers', 'Berries, citrus & edible blooms', 18, '{"look":"fruit"}', 5),
('style', 'floral', 'Buttercream Florals', 'Hand-piped roses', 25, '{"look":"floral"}', 6),
('color', 'white', 'Classic White', null, 0, '{"hex":"#FFFBF3"}', 1),
('color', 'blush', 'Blush Pink', null, 0, '{"hex":"#F4C6CF"}', 2),
('color', 'red', 'Signature Red', null, 0, '{"hex":"#A31B3B"}', 3),
('color', 'lavender', 'Lavender', null, 0, '{"hex":"#CDB9E3"}', 4),
('color', 'sky', 'Sky Blue', null, 0, '{"hex":"#BFD9EE"}', 5),
('color', 'butter', 'Buttercup', null, 0, '{"hex":"#F6E08F"}', 6),
('color', 'sage', 'Sage', null, 0, '{"hex":"#C5D4B5"}', 7),
('color', 'cocoa', 'Cocoa', null, 0, '{"hex":"#8A5A44"}', 8),
('accent', 'none', 'No metallic accent', null, 0, '{}', 1),
('accent', 'gold', 'Gold accents', null, 8, '{"hex":"#C9A24B"}', 2),
('accent', 'silver', 'Silver accents', null, 8, '{"hex":"#B8BCC4"}', 3),
('topper', 'none', 'No topper', null, 0, '{"look":"none"}', 1),
('topper', 'hbd', '"Happy Birthday" script topper', 'Gold acrylic', 8, '{"look":"hbd"}', 2),
('topper', 'numbers', 'Number candles', 'Tell us the number in the message', 4, '{"look":"numbers"}', 3),
('topper', 'name', 'Custom name topper', 'Acrylic, your text', 18, '{"look":"name"}', 4),
('topper', 'flowers', 'Fresh flower crown', 'Seasonal blooms', 15, '{"look":"flowers"}', 5);

insert into public.site_settings (key, value) values
('lead_days', '{"ready":3,"custom":7}'),
('cafe', '{"name":"Sample Bakery & Café","address":"","hours":"","note":"Fresh coffee, treats and cake by the slice."}'),
('portions', '{"party":14,"wedding":8}'),
('deposit', '{"percent":50}');
