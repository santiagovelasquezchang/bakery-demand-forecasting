-- Supabase grants EXECUTE to anon/authenticated by default; these helpers are only used inside other functions.
revoke execute on function public.catalog_item_price(jsonb) from anon, authenticated;
revoke execute on function public.deposit_percent() from anon, authenticated;
revoke execute on function public.lead_days(boolean) from anon, authenticated;
revoke execute on function public.is_admin_account() from anon;
