const A = {
  orders: [],
  quotes: [],
  blocked: new Map(),
  filters: { orders: 'pending', quotes: 'pending' },
  search: { orders: '', quotes: '' },
  summary: null,
  month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  day: null,
  tab: 'calendar',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ymd = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const todayStr = () => ymd(new Date());
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const dateEs = (day, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  cap(new Date(day + 'T12:00').toLocaleDateString('es-US', opts));

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

const STATUS_ES = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'Rechazada', conversation: 'Conversación' };

// Suggested explanations prefill the message in English (the customer-facing language); the baker edits them freely.
const REASONS_ES = [
  { id: 'calendar_full', label: 'Mi agenda está llena ese día',
    text: "My calendar is already full for that day. I make every cake by hand, so I only take as many orders as I can give my full care to, and that day has reached its limit." },
  { id: 'not_enough_time', label: 'No alcanzo con el tiempo de preparación',
    text: "There isn't enough time before your date for me to make this with the care and detail it deserves, and I'd rather be honest with you than rush it." },
  { id: 'unavailable', label: 'No horneo ese día',
    text: "I'm not baking on that day, so I wouldn't be able to have it ready for you." },
  { id: 'other', label: 'Otro motivo', text: '' },
];

const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const depositFor = (amount) => Math.round(Number(amount) * SITE.depositPct) / 100;

function safeCakeSvg(config) {
  try {
    const c = validConfig(config);
    return c ? cakeSvg(c) : '';
  } catch {
    return '';
  }
}

/* ---------- Data ---------- */

async function loadAll() {
  const [o, q, b] = await Promise.all([
    sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000),
    sb.from('quotes').select('*').order('created_at', { ascending: false }).limit(1000),
    sb.from('blocked_dates').select('*'),
  ]);
  const err = o.error || q.error || b.error;
  if (err) { toast('No se pudieron cargar los datos. Revisa tu conexión.'); return; }
  A.orders = o.data;
  A.quotes = q.data;
  A.blocked = new Map(b.data.map((r) => [r.day, r.note || '']));
  renderAll();
}

function eventsOn(day) {
  const ev = [];
  A.orders.filter((r) => r.pickup_date === day && r.status !== 'declined').forEach((r) =>
    ev.push({ kind: 'order', row: r, cls: r.status === 'accepted' ? 'accepted' : 'pending', label: `${r.number} · ${r.customer_name}` }));
  A.quotes.filter((r) => r.event_date === day && r.status !== 'declined').forEach((r) =>
    ev.push({ kind: 'quote', row: r, cls: r.status === 'accepted' ? 'quote' : 'pending', label: `${r.number} · ${r.occasion}` }));
  return ev;
}

const confirmedOn = (day, exceptId) => eventsOn(day).filter((e) => (e.cls === 'accepted' || e.cls === 'quote') && e.row.id !== exceptId);

/* ---------- Render ---------- */

function renderAll() {
  const pO = A.orders.filter((r) => r.status === 'pending').length;
  const pQ = A.quotes.filter((r) => r.status === 'pending').length;
  $('[data-count="orders"]').textContent = pO || '';
  $('[data-count="quotes"]').textContent = pQ || '';
  document.title = `${pO + pQ ? `(${pO + pQ}) ` : ''}Portal de administración`;
  renderCalendar();
  renderDay();
  renderList('orders');
  renderList('quotes');
  if (A.tab === 'summary') renderSummary();
}

function renderCalendar() {
  const m = A.month;
  $('[data-month-label]').textContent = cap(m.toLocaleDateString('es-US', { month: 'long', year: 'numeric' }));
  const start = new Date(m);
  start.setDate(1 - start.getDay());
  const today = todayStr();
  let html = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const day = ymd(d);
    const ev = eventsOn(day);
    const cls = [
      'cal-day',
      d.getMonth() !== m.getMonth() && 'other',
      day < today && 'past',
      day === today && 'today',
      day === A.day && 'selected',
      A.blocked.has(day) && 'blocked',
    ].filter(Boolean).join(' ');
    html += `<button type="button" class="${cls}" data-day="${day}" aria-label="${escapeHtml(dateEs(day))}${ev.length ? `, ${ev.length} pedidos` : ''}">
      <span class="num">${d.getDate()}</span>
      ${ev.slice(0, 3).map((e) => `<span class="ev ${e.cls}">${escapeHtml(e.label)}</span>`).join('')}
      ${ev.length > 3 ? `<span class="ev more">+${ev.length - 3} más</span>` : ''}
    </button>`;
    if (i === 34 && d.getMonth() !== m.getMonth()) break;
  }
  $('[data-calendar]').innerHTML = html;
}

function renderDay() {
  const panel = $('[data-day-panel]');
  const day = A.day || todayStr();
  const ev = eventsOn(day);
  const confirmed = ev.filter((e) => e.cls !== 'pending').length;
  const pending = ev.length - confirmed;
  const blocked = A.blocked.has(day);
  const run = blocked ? blockedRun(day) : [];
  panel.innerHTML = `
    <h2>${escapeHtml(dateEs(day))}</h2>
    <p class="load">${confirmed} confirmado${confirmed === 1 ? '' : 's'}${pending ? ` · ${pending} por responder` : ''}${blocked ? ' · <strong>día bloqueado</strong>' : ''}</p>
    ${ev.length ? ev.map((e) => `
      <button type="button" class="day-item" data-open="${e.kind}:${e.row.id}">
        <span class="badge ${e.row.status}">${STATUS_ES[e.row.status]}</span>
        <strong style="display:block;margin-top:6px">${escapeHtml(e.label)}</strong>
        <small>${e.kind === 'order' ? `${money(e.row.total)} · ${e.row.items.length} producto${e.row.items.length === 1 ? '' : 's'}` : `${e.row.servings} personas${e.row.quoted_price ? ` · ${money(e.row.quoted_price)}` : ''}`}</small>
      </button>`).join('') : '<p class="muted" style="font-size:14px">Nada agendado para este día.</p>'}
    <div class="block-box">
      ${blocked
        ? `<p style="font-size:14px;margin-bottom:10px">Los clientes ven este día como <strong>no disponible</strong> en la página.${A.blocked.get(day) ? `<br><span class="muted">Nota: ${escapeHtml(A.blocked.get(day))}</span>` : ''}</p>
           <button class="btn btn-outline btn-sm" type="button" data-unblock="${day}:${day}">Desbloquear este día</button>
           ${run.length > 1 ? `<button class="btn btn-outline btn-sm" type="button" data-unblock="${run[0]}:${run[run.length - 1]}" style="margin-top:8px">Desbloquear los ${run.length} días (${escapeHtml(dateEs(run[0], { day: 'numeric', month: 'short' }))} – ${escapeHtml(dateEs(run[run.length - 1], { day: 'numeric', month: 'short' }))})</button>` : ''}`
        : `<p style="font-size:14px;font-weight:600;margin-bottom:8px">¿No puedes trabajar?</p>
           <div class="block-range">
             <label>Desde <input class="input" type="date" data-block-from value="${day}"></label>
             <label>Hasta <input class="input" type="date" data-block-to value="${day}" min="${day}"></label>
           </div>
           <input class="input" id="block-note" maxlength="120" placeholder="Nota privada (opcional, ej. vacaciones)" style="margin:8px 0 10px;min-height:42px">
           <button class="btn btn-outline btn-sm" type="button" data-block>Bloquear</button>
           <p class="hint">Para una semana entera, elige el primer y el último día. Los clientes verán esos días como no disponibles.</p>`}
    </div>`;
}

function conflictWarning(day, id) {
  if (A.blocked.has(day)) return `<div class="warn red">⚠ Bloqueaste este día${A.blocked.get(day) ? ` (${escapeHtml(A.blocked.get(day))})` : ''}.</div>`;
  const conf = confirmedOn(day, id);
  if (conf.length) return `<div class="warn amber">Ese día ya tienes ${conf.length} confirmado${conf.length === 1 ? '' : 's'}: ${conf.map((e) => escapeHtml(e.label)).join(', ')}.</div>`;
  return '<div class="warn green">Tienes ese día libre.</div>';
}

function responseBlock(r, kind) {
  if (r.status === 'pending') return '';
  const reason = REASONS_ES.find((x) => x.id === r.decline_reason);
  return `<div class="response">
    <strong>${STATUS_ES[r.status]} ${r.responded_at ? ago(r.responded_at) : ''}</strong>
    ${kind === 'quote' && r.quoted_price ? `Precio: ${money(r.quoted_price)}<br>` : ''}
    ${reason ? `Motivo: ${escapeHtml(reason.label)}<br>` : ''}
    ${r.suggested_date ? `Fecha sugerida: ${escapeHtml(dateEs(r.suggested_date))}<br>` : ''}
    ${r.response_message ? `Mensaje: “${escapeHtml(r.response_message)}”<br>` : ''}
    <span class="meta">${r.email_sent ? '✓ Correo enviado' : 'Correo no enviado automáticamente'}</span>
  </div>`;
}

function depositBlock(kind, r) {
  const amount = kind === 'order' ? Number(r.deposit_amount ?? depositFor(r.total)) : depositFor(r.quoted_price || 0);
  if (r.status === 'declined' || (kind === 'quote' && !r.quoted_price)) return '';
  if (r.status !== 'accepted') return `<div class="deposit-line"><span>Anticipo al aceptar (${SITE.depositPct}%): <strong>${money(amount)}</strong></span></div>`;
  return `<div class="deposit-line${r.deposit_paid ? ' paid' : ''}">
    <span>Anticipo (${SITE.depositPct}%): <strong>${money(amount)}</strong>${r.deposit_paid && r.deposit_paid_at ? `<br><small>Pagado ${ago(r.deposit_paid_at)}</small>` : ''}</span>
    <label class="switch"><input type="checkbox" data-deposit="${kind}:${r.id}"${r.deposit_paid ? ' checked' : ''}><span></span><em>${r.deposit_paid ? 'Pagado' : 'Pendiente'}</em></label>
  </div>`;
}

function orderCard(r) {
  return `<article class="card-item" id="order-${r.id}">
    <div>
      <div class="card-top"><h3>${escapeHtml(r.number)}</h3><span class="badge ${r.status}">${STATUS_ES[r.status]}</span><span class="meta">${ago(r.created_at)}</span></div>
      <dl class="kv">
        <dt>Cliente</dt><dd>${escapeHtml(r.customer_name)}</dd>
        <dt>Correo</dt><dd><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></dd>
        <dt>Teléfono</dt><dd><a href="tel:${escapeHtml(r.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(r.phone)}</a></dd>
        <dt>Recoge</dt><dd><strong>${escapeHtml(dateEs(r.pickup_date))}</strong></dd>
      </dl>
      ${r.status === 'pending' ? conflictWarning(r.pickup_date, r.id) : ''}
      <ul class="items">${r.items.map((it) => `
        <li>
          ${it.type === 'custom' ? `<div class="mini">${safeCakeSvg(it.config)}</div>` : ''}
          <div><strong>${escapeHtml(it.name)}${Number(it.qty) > 1 ? ` × ${Number(it.qty)}` : ''}</strong>
            ${(Array.isArray(it.details) ? it.details : []).map((d) => `<small>${escapeHtml(d)}</small>`).join('')}</div>
          <span class="line">${money(Number(it.unitPrice) * Number(it.qty))}</span>
        </li>`).join('')}</ul>
    </div>
    <div class="side">
      <span class="meta">Total</span>
      <div class="total">${money(r.total)}</div>
      ${depositBlock('order', r)}
      ${r.status === 'pending' ? `
        <button class="btn btn-primary" type="button" data-act="accept" data-kind="order" data-id="${r.id}">Aceptar orden</button>
        <button class="btn btn-outline" type="button" data-act="decline" data-kind="order" data-id="${r.id}">No puedo esta vez</button>` : responseBlock(r, 'order')}
    </div>
  </article>`;
}

function quoteCard(r, photoUrls) {
  const open = r.status === 'pending' || r.status === 'conversation';
  return `<article class="card-item" id="quote-${r.id}">
    <div>
      <div class="card-top"><h3>${escapeHtml(r.number)} · ${escapeHtml(r.kind === 'catering' ? `Catering${r.package ? ` · ${r.package}` : ''}` : r.occasion)}</h3>${r.kind === 'catering' ? '<span class="badge catering">Catering</span>' : ''}<span class="badge ${r.status}">${STATUS_ES[r.status]}</span><span class="meta">${ago(r.created_at)}</span></div>
      <dl class="kv">
        <dt>Cliente</dt><dd>${escapeHtml(r.customer_name)}</dd>
        <dt>Correo</dt><dd><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></dd>
        ${r.phone ? `<dt>Teléfono</dt><dd><a href="tel:${escapeHtml(r.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(r.phone)}</a></dd>` : ''}
        <dt>Fecha</dt><dd><strong>${escapeHtml(dateEs(r.event_date))}</strong></dd>
        <dt>${r.kind === 'catering' ? 'Invitados' : 'Personas'}</dt><dd>${Number(r.servings)}</dd>
        <dt>Presupuesto</dt><dd>${escapeHtml(r.budget || 'No indicó')}</dd>
      </dl>
      ${open ? conflictWarning(r.event_date, r.id) : ''}
      <div class="desc">${escapeHtml(r.description)}</div>
      <div class="photos">
        ${r.ref_image && /^assets\/img\/[a-z0-9-]+\.jpg$/.test(r.ref_image) ? `<a href="${r.ref_image}" target="_blank" rel="noopener" title="Inspiración de la galería"><img src="${r.ref_image}" alt="Foto de la galería que eligió"></a>` : ''}
        ${(photoUrls || []).map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="Foto de referencia del cliente"></a>`).join('')}
      </div>
    </div>
    <div class="side">
      ${depositBlock('quote', r)}
      ${open ? `
        ${r.status === 'conversation' ? responseBlock(r, 'quote') : ''}
        <button class="btn btn-primary" type="button" data-act="accept" data-kind="quote" data-id="${r.id}">Enviar precio y aceptar</button>
        ${r.status === 'pending' ? `<button class="btn btn-outline" type="button" data-act="conversation" data-kind="quote" data-id="${r.id}">Pedir una conversación</button>` : ''}
        <button class="btn btn-outline" type="button" data-act="decline" data-kind="quote" data-id="${r.id}">No puedo esta vez</button>` : responseBlock(r, 'quote')}
    </div>
  </article>`;
}

const FILTERS = {
  orders: [['pending', 'Por responder'], ['accepted', 'Aceptadas'], ['declined', 'Rechazadas'], ['all', 'Todas']],
  quotes: [['pending', 'Por responder'], ['conversation', 'En conversación'], ['accepted', 'Aceptadas'], ['declined', 'Rechazadas'], ['catering', 'Catering'], ['all', 'Todas']],
};

const photoCache = new Map();

async function renderList(kind) {
  const f = A.filters[kind];
  $(`[data-filter-group="${kind}"]`).innerHTML = FILTERS[kind].map(([id, label]) =>
    `<button class="filter" type="button" data-filter="${kind}:${id}" aria-pressed="${f === id}">${label}</button>`).join('');
  const q = norm(A.search[kind]).trim();
  const rows = A[kind]
    .filter((r) => (q ? `${norm(r.customer_name)} ${norm(r.number)} ${norm(r.email)}`.includes(q)
      : f === 'all' || (f === 'catering' ? r.kind === 'catering' : r.status === f)))
    .sort((a, b) => (f === 'pending' || f === 'conversation'
      ? (kind === 'orders' ? a.pickup_date.localeCompare(b.pickup_date) : a.event_date.localeCompare(b.event_date))
      : b.created_at.localeCompare(a.created_at)));
  const list = $(`[data-list="${kind}"]`);
  if (!rows.length) {
    list.innerHTML = `<div class="empty-list">${q ? `No encontré nada con "${escapeHtml(A.search[kind])}".` : f === 'pending' ? '¡Todo al día! No hay nada por responder.' : 'No hay nada aquí todavía.'}</div>`;
    return;
  }
  if (kind === 'orders') { list.innerHTML = rows.map(orderCard).join(''); return; }

  const need = rows.flatMap((r) => r.photo_paths).filter((p) => !photoCache.has(p));
  if (need.length) {
    const { data } = await sb.storage.from('quote-photos').createSignedUrls(need, 3600);
    (data || []).forEach((d) => d.signedUrl && photoCache.set(d.path, d.signedUrl));
  }
  list.innerHTML = rows.map((r) => quoteCard(r, r.photo_paths.map((p) => photoCache.get(p)).filter(Boolean))).join('');
}

/* ---------- Resumen (printable) ---------- */

function weekRange(offset = 0) {
  const d = new Date();
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 7 * offset);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return [ymd(mon), ymd(sun)];
}

function renderSummary() {
  if (!A.summary) { const [from, to] = weekRange(0); A.summary = { from, to, pending: false }; }
  const { from, to, pending } = A.summary;
  const inRange = (d) => d >= from && d <= to;
  const entries = [
    ...A.orders.filter((r) => inRange(r.pickup_date) && (r.status === 'accepted' || (pending && r.status === 'pending')))
      .map((r) => ({ kind: 'order', day: r.pickup_date, r })),
    ...A.quotes.filter((r) => inRange(r.event_date) && (r.status === 'accepted' || (pending && (r.status === 'pending' || r.status === 'conversation'))))
      .map((r) => ({ kind: 'quote', day: r.event_date, r })),
  ].sort((a, b) => a.day.localeCompare(b.day) || a.r.number.localeCompare(b.r.number));

  const amountOf = (e) => Number(e.kind === 'order' ? e.r.total : e.r.quoted_price || 0);
  const depositOf = (e) => (e.kind === 'order' ? Number(e.r.deposit_amount ?? depositFor(e.r.total)) : depositFor(e.r.quoted_price || 0));
  const total = entries.reduce((n, e) => n + amountOf(e), 0);
  const owed = entries.filter((e) => e.r.status === 'accepted' && !e.r.deposit_paid).reduce((n, e) => n + depositOf(e), 0);
  const days = [...new Set(entries.map((e) => e.day))];
  const what = (e) => (e.kind === 'order'
    ? e.r.items.map((it) => `<div><strong>${escapeHtml(it.name)}${Number(it.qty) > 1 ? ` × ${Number(it.qty)}` : ''}</strong><small>${(Array.isArray(it.details) ? it.details : []).map(escapeHtml).join(' · ')}</small></div>`).join('')
    : `<div><strong>${escapeHtml(e.r.kind === 'catering' ? `Catering${e.r.package ? ` · ${e.r.package}` : ''}` : `Pastel personalizado · ${e.r.occasion}`)}</strong><small>${Number(e.r.servings)} personas · ${escapeHtml(e.r.description)}</small></div>`);

  $('[data-summary-body]').innerHTML = `
    <div class="summary-controls no-print">
      <label>Desde <input class="input" type="date" data-sum="from" value="${from}"></label>
      <label>Hasta <input class="input" type="date" data-sum="to" value="${to}" min="${from}"></label>
      <button class="filter" type="button" data-sum-week="0">Esta semana</button>
      <button class="filter" type="button" data-sum-week="1">Próxima semana</button>
      <label class="check-line"><input type="checkbox" data-sum="pending"${pending ? ' checked' : ''}> Incluir pendientes</label>
      <button class="btn btn-primary btn-sm" type="button" data-print>Descargar PDF / imprimir</button>
    </div>
    <div class="print-head">
      <div class="script">Sample Bakery</div>
      <h2>Resumen del ${escapeHtml(dateEs(from, { day: 'numeric', month: 'long' }))} al ${escapeHtml(dateEs(to, { day: 'numeric', month: 'long', year: 'numeric' }))}</h2>
      <p class="muted">${entries.length} pedido${entries.length === 1 ? '' : 's'} · Total ${money(total)} · Anticipos por cobrar ${money(owed)}</p>
    </div>
    ${days.length ? days.map((day) => `
      <section class="sum-day">
        <h3>${escapeHtml(dateEs(day))}</h3>
        <table class="data-table sum-table">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Qué hay que preparar</th><th class="r">Total</th><th class="r">Anticipo</th></tr></thead>
          <tbody>${entries.filter((e) => e.day === day).map((e) => `<tr>
            <td><strong>${escapeHtml(e.r.number)}</strong>${e.r.status !== 'accepted' ? '<br><span class="badge pending">Pendiente</span>' : ''}</td>
            <td>${escapeHtml(e.r.customer_name)}<br><small>${escapeHtml(e.r.phone || e.r.email)}</small></td>
            <td class="sum-what">${what(e)}</td>
            <td class="r">${amountOf(e) ? money(amountOf(e)) : '—'}</td>
            <td class="r">${e.r.status !== 'accepted' ? '—' : e.r.deposit_paid ? 'Pagado' : `<strong>${money(depositOf(e))}</strong><br><small>por cobrar</small>`}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>`).join('') : '<div class="empty-list">No hay pedidos confirmados en estas fechas.</div>'}`;
}

/* ---------- Actions ---------- */

const modal = () => $('[data-modal]');
const modalForm = () => $('[data-modal-form]');

function openModal(html, onSubmit) {
  const form = modalForm();
  form.innerHTML = html;
  form.onchange = null;
  form.onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    if (!form.reportValidity()) return;
    await onSubmit(form, e.submitter);
  };
  if (!modal().open) modal().showModal();
  form.querySelector('input, textarea, select')?.focus();
}

const cancelBtn = '<button class="btn btn-outline" value="cancel" formnovalidate>Cancelar</button>';

function findRow(kind, id) { return A[kind === 'order' ? 'orders' : 'quotes'].find((r) => r.id === id); }

function openAccept(kind, row) {
  const day = kind === 'order' ? row.pickup_date : row.event_date;
  openModal(`
    <h2>${kind === 'order' ? 'Aceptar orden' : 'Enviar precio'} ${escapeHtml(row.number)}</h2>
    <p class="muted">Para ${escapeHtml(dateEs(day).toLowerCase())} · ${escapeHtml(row.customer_name)}</p>
    ${conflictWarning(day, row.id)}
    ${kind === 'quote' ? `<div class="field" style="margin-top:18px"><label for="m-price">Precio total (USD)</label>
      <input class="input" id="m-price" name="price" type="number" min="1" step="0.01" required placeholder="Ej. 180"></div>` : ''}
    <div class="field" style="margin-top:${kind === 'quote' ? '0' : '18px'}"><label for="m-msg">Mensaje para el cliente <span class="muted" style="font-weight:400">(opcional)</span></label>
      <textarea class="textarea" id="m-msg" name="message" maxlength="1000" style="min-height:100px" placeholder="${kind === 'order' ? 'Ej. Te espero a las 3pm, la dirección es…' : 'Ej. Incluye 3 pisos, flores naturales y topper dorado.'}"></textarea></div>
    <div class="modal-actions">${cancelBtn}<button class="btn btn-primary" type="submit">${kind === 'order' ? 'Aceptar y avisar' : 'Enviar precio'}</button></div>`,
  (form, btn) => respond(btn, { kind, id: row.id, action: 'accept', price: form.price?.value, message: form.message.value }));
}

function openDecline(kind, row) {
  const day = kind === 'order' ? row.pickup_date : row.event_date;
  openModal(`
    <h2>No puedo esta vez — ${escapeHtml(row.number)}</h2>
    <p class="muted">Para ${escapeHtml(dateEs(day).toLowerCase())} · ${escapeHtml(row.customer_name)}</p>
    <div class="reasons" role="radiogroup" aria-label="Motivo">
      ${REASONS_ES.map((r, i) => `<label><input type="radio" name="reason" value="${r.id}"${i === 0 ? ' checked' : ''}><span><strong>${r.label}</strong></span></label>`).join('')}
    </div>
    <div class="field"><label for="m-msg">Explícale al cliente por qué <span class="muted" style="font-weight:400">(lo lee en su correo, firmado por ti)</span></label>
      <textarea class="textarea" id="m-msg" name="message" maxlength="1000" minlength="10" required style="min-height:120px">${escapeHtml(REASONS_ES[0].text)}</textarea>
      <div class="hint">Te dejamos una sugerencia en inglés; cámbiala como quieras.</div></div>
    <div class="field"><label for="m-date">¿Le sugieres otra fecha? <span class="muted" style="font-weight:400">(opcional)</span></label>
      <input class="input" id="m-date" name="suggested" type="date" min="${todayStr()}"></div>
    <div class="customer-sees">El correo le agradece, incluye tu explicación, le dice que te encantaría hornear para él/ella en otra ocasión y le deja tu WhatsApp y correo.${kind === 'order' ? ' También le confirma que no se le cobró nada.' : ''}</div>
    <div class="modal-actions">${cancelBtn}<button class="btn btn-primary" type="submit">Enviar respuesta</button></div>`,
  (form, btn) => respond(btn, { kind, id: row.id, action: 'decline', reason: form.reason.value, message: form.message.value, suggestedDate: form.suggested.value || null }));
  const form = modalForm();
  let suggestion = REASONS_ES[0].text;
  form.onchange = (e) => {
    if (e.target.name !== 'reason') return;
    const next = REASONS_ES.find((r) => r.id === e.target.value).text;
    if (form.message.value.trim() === suggestion.trim() || !form.message.value.trim()) form.message.value = next;
    suggestion = next;
    if (!next) form.message.focus();
  };
}

function openConversation(row) {
  openModal(`
    <h2>Pedir una conversación — ${escapeHtml(row.number)}</h2>
    <p class="muted">${escapeHtml(row.customer_name)} recibirá un correo con un botón para escribirte por WhatsApp y otro para responderte por correo.</p>
    <div class="field" style="margin-top:18px"><label for="m-msg">¿Qué quieres preguntarle? <span class="muted" style="font-weight:400">(opcional)</span></label>
      <textarea class="textarea" id="m-msg" name="message" maxlength="1000" style="min-height:110px" placeholder="Ej. ¿Me compartes los colores exactos de la decoración y si quieres flores naturales o de azúcar?"></textarea></div>
    <div class="modal-actions">${cancelBtn}<button class="btn btn-primary" type="submit">Enviar</button></div>`,
  (form, btn) => respond(btn, { kind: 'quote', id: row.id, action: 'conversation', message: form.message.value }));
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h1|tr)>/gi, '\n'), 'text/html');
  $$('a', doc).forEach((a) => { if (a.href.startsWith('https://wa.me')) a.textContent = `WhatsApp: ${a.href}`; });
  return doc.body.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

async function respond(btn, payload) {
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Enviando…';
  const { data, error } = await sb.functions.invoke('respond', { body: payload });
  btn.disabled = false;
  btn.textContent = label;
  if (error || !data?.ok) {
    let msg = 'No se pudo guardar. Intenta de nuevo.';
    try { msg = (await error?.context?.json())?.error || msg; } catch { /* keep default */ }
    toast(msg);
    return;
  }
  modal().close();
  await loadAll();
  if (data.emailSent) { toast('Listo. El cliente ya recibió el correo.'); return; }

  const row = findRow(payload.kind, payload.id);
  const text = htmlToText(data.preview.html);
  openModal(`
    <h2>Respuesta guardada</h2>
    <p class="muted" style="margin-bottom:14px">El envío automático de correos aún no está activado. Envíale este mensaje a <strong>${escapeHtml(row.email)}</strong>:</p>
    <iframe class="email-preview" sandbox title="Vista previa del correo"></iframe>
    <div class="modal-actions">
      <button class="btn btn-outline" type="button" data-copy>Copiar texto</button>
      <a class="btn btn-primary" href="mailto:${escapeHtml(row.email)}?subject=${encodeURIComponent(data.preview.subject)}&body=${encodeURIComponent(text.slice(0, 1800))}">Abrir en mi correo</a>
      <button class="btn btn-outline" value="cancel">Cerrar</button>
    </div>`, () => {});
  $('.email-preview').srcdoc = data.preview.html;
  $('[data-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(`${data.preview.subject}\n\n${text}`); toast('Texto copiado'); } catch { toast('No se pudo copiar'); }
  };
}

// Consecutive blocked days around `day` (e.g. a blocked week).
function blockedRun(day) {
  const run = [day];
  for (let d = addDays(day, -1); A.blocked.has(d); d = addDays(d, -1)) run.unshift(d);
  for (let d = addDays(day, 1); A.blocked.has(d); d = addDays(d, 1)) run.push(d);
  return run;
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function daysBetween(from, to) {
  const days = [];
  for (let d = from; d <= to && days.length < 92; d = addDays(d, 1)) days.push(d);
  return days;
}

async function blockRange(from, to, note) {
  if (!from || !to || to < from) { toast('Revisa las fechas: "Hasta" debe ser igual o después de "Desde".'); return; }
  const days = daysBetween(from, to).filter((d) => !A.blocked.has(d));
  if (!days.length) { toast('Esos días ya están bloqueados.'); return; }
  const busy = days.flatMap((d) => eventsOn(d).map((e) => `${dateEs(d, { day: 'numeric', month: 'short' })}: ${e.label}`));
  if (busy.length && !confirm(`Ya tienes pedidos en esos días:\n\n${busy.join('\n')}\n\nBloquear no los cancela (respóndelos tú en Órdenes / Cotizaciones). Solo evita pedidos nuevos.\n\n¿Bloquear de todas formas?`)) return;
  if (A.saving) return;
  A.saving = true;
  const { error } = await sb.from('blocked_dates').insert(days.map((day) => ({ day, note: note || null })));
  A.saving = false;
  if (error) { toast('No se pudo guardar el cambio.'); return; }
  await loadAll();
  toast(days.length === 1 ? 'Día bloqueado' : `${days.length} días bloqueados`);
}

async function unblockRange(from, to) {
  if (A.saving) return;
  A.saving = true;
  const days = daysBetween(from, to);
  const { error } = await sb.from('blocked_dates').delete().in('day', days);
  A.saving = false;
  if (error) { toast('No se pudo guardar el cambio.'); return; }
  await loadAll();
  toast(days.length === 1 ? 'Día desbloqueado' : `${days.length} días desbloqueados`);
}

function showTab(tab) {
  A.tab = tab;
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  if (tab === 'summary') renderSummary();
  if (tab === 'catalog') renderCatalog();
}

function openRecord(kind, id) {
  const row = findRow(kind, id);
  const listKind = kind === 'order' ? 'orders' : 'quotes';
  if (A.filters[listKind] !== 'all' && A.filters[listKind] !== row.status) {
    A.filters[listKind] = row.status;
  }
  showTab(listKind);
  renderList(listKind).then(() => {
    const el = document.getElementById(`${kind}-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  });
}

/* ---------- Auth & boot ---------- */

function showView(name) {
  $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; });
}

function loginMessage(msg) {
  const el = $('[data-login-msg]');
  el.hidden = !msg;
  el.textContent = msg || '';
}

let refreshTimer;

// Data is only readable with a 2FA session (aal2): enforced by is_admin() in the database.
async function secureEnter() {
  const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) { showView('login'); loginMessage('No se pudo verificar la sesión. Vuelve a entrar.'); return; }
  if (aal.currentLevel === 'aal2') { enterApp(); return; }
  const { data: isAccount } = await sb.rpc('is_admin_account');
  if (!isAccount) {
    await sb.auth.signOut();
    showView('login');
    loginMessage('Esta cuenta no tiene acceso al portal.');
    return;
  }
  const { data: factors } = await sb.auth.mfa.listFactors();
  const verified = (factors?.totp || []).filter((f) => f.status === 'verified');
  if (verified.length) mfaVerify(verified[0].id);
  else mfaEnroll(factors?.all || []);
}

const signOutBtn = '<button class="link-btn" type="button" data-mfa-out>Salir</button>';

function mfaCodeForm(button) {
  return `<form data-mfa-form novalidate style="margin-top:18px;text-align:left">
    <div class="field"><label for="mfa-code">Código de 6 números</label>
      <input class="input" id="mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required
        style="font-size:24px;letter-spacing:.3em;text-align:center"></div>
    <button class="btn btn-primary btn-block" type="submit">${button}</button>
    <div class="notice" data-mfa-msg hidden role="alert" style="margin-top:14px"></div>
  </form>`;
}

function wireMfaForm(factorId) {
  const form = $('[data-mfa-form]');
  form.code.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-mfa-msg]');
    const code = form.code.value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) { msg.hidden = false; msg.textContent = 'Escribe los 6 números que aparecen en la app.'; return; }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
    btn.disabled = false;
    if (error) { msg.hidden = false; msg.textContent = 'Código incorrecto o vencido. Espera el siguiente código e inténtalo otra vez.'; form.code.select(); return; }
    enterApp();
  });
}

async function mfaEnroll(existing) {
  for (const f of existing) {
    if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Admin portal' });
  showView('mfa');
  if (error) { $('[data-mfa]').innerHTML = `<p>No se pudo iniciar la configuración. Recarga la página.</p>${signOutBtn}`; return; }
  $('[data-mfa]').innerHTML = `
    <img src="assets/img/logo.svg" alt="" class="login-logo">
    <h2 style="font-size:24px;margin:8px 0">Protege tu portal</h2>
    <p class="muted" style="font-size:15px">Además de tu contraseña, pediremos un código de tu celular. Así nadie más puede entrar.</p>
    <ol class="howto" style="text-align:left;margin-top:16px">
      <li>Instala <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> en tu celular.</li>
      <li>En la app toca <strong>+</strong> y escanea este código:</li>
    </ol>
    <img src="${escapeHtml(data.totp.qr_code)}" alt="Código QR para la app de verificación" style="width:200px;height:200px;margin:8px auto;background:#fff;border-radius:12px;padding:8px">
    <details style="font-size:13px;margin-bottom:6px"><summary class="muted">¿No puedes escanear? Escribe esta clave</summary>
      <code style="display:block;word-break:break-all;margin-top:8px;font-size:14px">${escapeHtml(data.totp.secret)}</code></details>
    <ol class="howto" start="3" style="text-align:left"><li>Escribe el código que muestra la app.</li></ol>
    ${mfaCodeForm('Activar y entrar')}
    ${signOutBtn}`;
  wireMfaForm(data.id);
}

function mfaVerify(factorId) {
  showView('mfa');
  $('[data-mfa]').innerHTML = `
    <img src="assets/img/logo.svg" alt="" class="login-logo">
    <h2 style="font-size:24px;margin:8px 0">Código de verificación</h2>
    <p class="muted" style="font-size:15px">Abre tu app de verificación y escribe el código de <strong>Sample Bakery</strong>.</p>
    ${mfaCodeForm('Entrar')}
    <p class="hint" style="margin-top:14px">¿Perdiste tu celular? Pide a quien te ayudó a configurar el portal que restablezca tu verificación.</p>
    ${signOutBtn}`;
  wireMfaForm(factorId);
}

async function enterApp() {
  const { data: ok } = await sb.rpc('is_admin');
  if (!ok) {
    await sb.auth.signOut();
    showView('login');
    loginMessage('Esta cuenta no tiene acceso al portal.');
    return;
  }
  showView('app');
  await loadCatalog();
  await loadAll();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') loadAll(); }, 60000);
}

function wireApp() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-day]');
    if (!t) return;
    if (t.dataset.tab) showTab(t.dataset.tab);
    if (t.dataset.month) { A.month = new Date(A.month.getFullYear(), A.month.getMonth() + Number(t.dataset.month), 1); renderCalendar(); }
    if ('today' in t.dataset) { const d = new Date(); A.month = new Date(d.getFullYear(), d.getMonth(), 1); A.day = todayStr(); renderCalendar(); renderDay(); }
    if (t.dataset.day) { A.day = t.dataset.day; renderCalendar(); renderDay(); }
    if (t.dataset.open) { const [k, id] = t.dataset.open.split(':'); openRecord(k, id); }
    if ('block' in t.dataset) blockRange($('[data-block-from]').value, $('[data-block-to]').value, $('#block-note').value.trim());
    if (t.dataset.unblock) { const [from, to] = t.dataset.unblock.split(':'); unblockRange(from, to); }
    if (t.dataset.filter) { const [k, f] = t.dataset.filter.split(':'); A.filters[k] = f; renderList(k); }
    if (t.dataset.act) {
      const row = findRow(t.dataset.kind, t.dataset.id);
      if (t.dataset.act === 'accept') openAccept(t.dataset.kind, row);
      if (t.dataset.act === 'decline') openDecline(t.dataset.kind, row);
      if (t.dataset.act === 'conversation') openConversation(row);
    }
    if ('refresh' in t.dataset) loadAll().then(() => toast('Actualizado'));
    if (t.dataset.sumWeek) { const [from, to] = weekRange(Number(t.dataset.sumWeek)); A.summary = { ...A.summary, from, to }; renderSummary(); }
    if ('print' in t.dataset) {
      // The saved PDF takes its file name from the page title.
      const title = document.title;
      document.title = `Resumen Sample Bakery ${A.summary.from} a ${A.summary.to}`;
      window.print();
      document.title = title;
    }
    if ('logout' in t.dataset || 'mfaOut' in t.dataset) {
      sb.auth.signOut().then(() => { clearInterval(refreshTimer); showView('login'); });
    }
  });
  document.addEventListener('input', (e) => {
    const k = e.target.dataset.search;
    if (k) { A.search[k] = e.target.value; renderList(k); }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if ('blockFrom' in t.dataset) {
      const to = $('[data-block-to]');
      to.min = t.value;
      if (to.value < t.value) to.value = t.value;
    }
    if (t.dataset.sum) {
      if (t.dataset.sum === 'pending') A.summary.pending = t.checked;
      else if (t.value) A.summary[t.dataset.sum] = t.value;
      if (A.summary.to < A.summary.from) A.summary.to = A.summary.from;
      renderSummary();
    }
    if (t.dataset.deposit) {
      const [kind, id] = t.dataset.deposit.split(':');
      const row = findRow(kind, id);
      const patch = { deposit_paid: t.checked, deposit_paid_at: t.checked ? new Date().toISOString() : null };
      const { error } = await sb.from(kind === 'order' ? 'orders' : 'quotes').update(patch).eq('id', id);
      if (error) { t.checked = !t.checked; toast('No se pudo guardar.'); return; }
      Object.assign(row, patch);
      renderAll();
      toast(t.checked ? 'Anticipo marcado como pagado' : 'Anticipo marcado como pendiente');
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('[data-view="app"]').hidden) loadAll(); });
}

function wireLogin() {
  const form = $('[data-login]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    loginMessage('');
    const { error } = await sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
    btn.disabled = false;
    if (error) { loginMessage('Correo o contraseña incorrectos.'); return; }
    form.password.value = '';
    secureEnter();
  });
  $('[data-forgot]').addEventListener('click', async () => {
    const email = form.email.value.trim().toLowerCase();
    if (!email) { loginMessage('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".'); return; }
    if (!form.email.checkValidity() || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) { loginMessage('Revisa el correo: parece que tiene un error.'); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) {
      loginMessage(/rate|security purposes/i.test(error.message)
        ? 'Se pidieron demasiados correos seguidos. Espera unos minutos y vuelve a intentar.'
        : `No se pudo enviar el correo: ${error.message}`);
      return;
    }
    loginMessage(`Listo. Revisa ${email} (también la carpeta de Spam) y abre el enlace para crear tu contraseña.`);
  });
}

let askedPassword = false;
function askNewPassword() {
  if (askedPassword) return;
  askedPassword = true;
  openModal(`
    <h2>Crea tu contraseña</h2>
    <p class="muted">Mínimo 8 caracteres.</p>
    <div class="field" style="margin-top:16px"><label for="m-pass">Nueva contraseña</label>
      <input class="input" id="m-pass" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
    <div class="modal-actions"><button class="btn btn-primary" type="submit">Guardar</button></div>`,
  async (form, btn) => {
    if (!form.reportValidity()) return;
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: form.password.value });
    btn.disabled = false;
    if (error) { toast('No se pudo guardar la contraseña.'); return; }
    modal().close();
    history.replaceState(null, '', location.pathname);
    toast('Contraseña guardada');
    secureEnter();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!sb) { showView('setup'); return; }
  wireLogin();
  wireApp();
  wireCatalog();
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(askNewPassword, 0);
  });
  const isInviteOrRecovery = /type=(recovery|invite)/.test(location.hash);
  const { data } = await sb.auth.getSession();
  if (isInviteOrRecovery && data.session) { showView('login'); askNewPassword(); return; }
  if (data.session) secureEnter();
  else showView('login');
});
