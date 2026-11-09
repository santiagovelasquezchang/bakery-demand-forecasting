// Fill these in from your Supabase project (Settings → API). The publishable key is safe to expose;
// table access is locked down by Row Level Security. With the placeholders left in, the public site
// runs against js/demo-backend.js instead.
const SITE_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseKey: 'YOUR-PUBLISHABLE-KEY',
};

const SUPABASE_READY = !SITE_CONFIG.supabaseUrl.includes('YOUR-PROJECT-REF') && Boolean(window.supabase);

const sb = SUPABASE_READY
  ? window.supabase.createClient(SITE_CONFIG.supabaseUrl, SITE_CONFIG.supabaseKey)
  : (typeof DemoBackend !== 'undefined' ? DemoBackend : null);
