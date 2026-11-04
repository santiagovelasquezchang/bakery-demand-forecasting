// Local stand-in for Supabase so the public site runs end to end with no account or keys.
// Used only when js/config.js still has placeholder values. Orders are kept in this browser's
// localStorage; photos are not stored. The admin portal always needs a real Supabase project.

const DemoBackend = (() => {
  const KEY = 'demo-backend-requests';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = (rows) => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* storage blocked */ } };
  const ymd = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');

  // Synthetic calendar: closed on Mondays, plus every 9th day of the year to show "booked" dates.
  const blockedDays = (from, to) => {
    const days = [];
    for (const d = new Date(`${from}T12:00`); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
      const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
      if (d.getDay() === 1 || doy % 9 === 0) days.push(ymd(d));
    }
    return days;
  };

  const record = (kind, prefix, start, args) => {
    const rows = load();
    if (blockedDays(args.p_pickup_date || args.p_event_date, args.p_pickup_date || args.p_event_date).length) {
      return { data: null, error: { message: 'DATE_UNAVAILABLE' } };
    }
    const number = `${prefix}${start + rows.filter((r) => r.kind === kind).length}`;
    rows.push({ kind, number, created_at: new Date().toISOString(), ...args });
    save(rows);
    console.info(`[demo] saved ${kind} ${number}`, args);
    return { data: number, error: null };
  };

  const rpc = async (name, args = {}) => {
    switch (name) {
      case 'public_catalog': return { data: null, error: { message: 'Demo mode: using the built-in sample catalog' } };
      case 'public_blocked_days': return { data: blockedDays(args.p_from, args.p_to), error: null };
      case 'submit_order': return record('order', 'ORD-', 1001, args);
      case 'submit_quote': return record('quote', 'Q-', 501, args);
      case 'submit_catering': return record('catering', 'Q-', 501, args);
      default: return { data: null, error: { message: `Demo mode does not support ${name}` } };
    }
  };

  return {
    isDemo: true,
    rpc,
    storage: { from: () => ({ upload: async () => ({ data: {}, error: null }) }) },
    requests: load,
  };
})();
