const ICONS = {
  cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
  menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  check: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  heart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  calendar: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  pin: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  sparkle: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  cake: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16M5 20v-6h14v6M7 14v-3h10v3M12 11V8"/><path d="M12 8c-1 0-1.5-.8-1.5-1.6S12 4 12 4s1.5 1.6 1.5 2.4S13 8 12 8z"/></svg>',
  upload: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
};

const money = (n) => '$' + Number(n).toFixed(2).replace(/\.00$/, '');
const depositOf = (total) => Math.round(total * SITE.depositPct) / 100;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const Cart = {
  key: 'mc_cart',
  items() { return store.read(this.key, []); },
  save(items) { store.write(this.key, items); updateCartCount(); },
  add(item) {
    const items = this.items();
    const match = item.type === 'product' && items.find((i) => i.type === 'product' && i.sku === item.sku);
    if (match) match.qty += item.qty;
    else items.push({ ...item, uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
    this.save(items);
  },
  remove(uid) { this.save(this.items().filter((i) => i.uid !== uid)); },
  setQty(uid, qty) {
    const items = this.items();
    const it = items.find((i) => i.uid === uid);
    if (it) it.qty = Math.max(1, qty);
    this.save(items);
  },
  count() { return this.items().reduce((n, i) => n + i.qty, 0); },
  subtotal() { return this.items().reduce((n, i) => n + i.unitPrice * i.qty, 0); },
  clear() { this.save([]); },
};

function updateCartCount() {
  const el = document.querySelector('.cart-count');
  if (!el) return;
  const n = Cart.count();
  el.textContent = n;
  el.dataset.empty = n === 0;
}

function renderChrome() {
  const page = document.body.dataset.page;
  const links = [
    ['index.html', 'Home', 'home'],
    ['gallery.html', 'Gallery', 'gallery'],
    ['shop.html', 'Shop', 'shop'],
    ['builder.html', 'Custom Cake Builder', 'builder'],
    ['quote.html', 'Request a Quote', 'quote'],
    ['catering.html', 'Catering', 'catering'],
  ];
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container">
      <a class="brand" href="index.html" aria-label="Sample Bakery home">
        <img src="assets/img/logo.svg" alt="">
        <span>Sample Bakery</span>
      </a>
      <nav class="nav" id="site-nav" aria-label="Main">
        ${links.map(([href, label, id]) => `<a href="${href}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <div class="header-actions">
        <a class="cart-btn" href="cart.html" aria-label="Cart">${ICONS.cart}<span class="cart-count" data-empty="true">0</span></a>
        <button class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">${ICONS.menu}</button>
      </div>
    </div>`;
  document.body.prepend(header);

  const toggle = header.querySelector('.menu-toggle');
  const nav = header.querySelector('.nav');
  toggle.addEventListener('click', () => {
    const open = nav.dataset.open !== 'true';
    nav.dataset.open = open;
    toggle.setAttribute('aria-expanded', open);
  });

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          <div class="script">Sample Bakery</div>
          <p>You dream it, we bake it. Custom cakes and sweets for your most special occasions.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li><a href="shop.html">Ready-made cakes</a></li>
            <li><a href="builder.html">Custom Cake Builder</a></li>
            <li><a href="quote.html">Request a quote</a></li>
            <li><a href="catering.html">Catering</a></li>
            <li><a href="gallery.html">Gallery</a></li>
          </ul>
        </div>
        <div>
          <h4>Visit</h4>
          <ul>
            <li><a href="index.html#cafe">Visit our coffee shop</a></li>
            <li>Pickup by appointment</li>
          </ul>
        </div>
        <div>
          <h4>Sweet news</h4>
          <p style="font-size:15px;opacity:.85;margin-bottom:12px">New designs, seasonal flavors and pop-up dates.</p>
          <form class="newsletter" data-newsletter>
            <label class="sr-only" for="nl-email">Email</label>
            <input id="nl-email" type="email" placeholder="Your email" required>
            <button class="btn btn-gold" type="submit" style="min-height:46px;padding:0 20px">Join</button>
          </form>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Sample Bakery. All rights reserved.</span>
        <span>Made with love, butter and a lot of sprinkles.</span>
      </div>
    </div>`;
  document.body.append(footer);

  footer.querySelector('[data-newsletter]').addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.reset();
    toast('Thanks! You\'re on the list.');
  });

  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  document.body.append(t);

  updateCartCount();
}

let toastTimer;
function toast(message, link) {
  const t = document.querySelector('.toast');
  t.innerHTML = `<span>${escapeHtml(message)}</span>${link ? `<a href="${link.href}">${escapeHtml(link.label)}</a>` : ''}`;
  t.dataset.show = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.dataset.show = 'false'; }, 3800);
}

function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

function productArt(id) {
  if (id === 'pound-cake') {
    return `<svg viewBox="0 0 200 200" width="62%" aria-hidden="true">
      <ellipse cx="100" cy="162" rx="70" ry="10" fill="#EBD9BE"/>
      <path d="M50 110 L62 158 H138 L150 110 Z" fill="#C9A24B"/>
      <path d="M50 110 L62 158 H138 L150 110 Z" fill="url(#m-stripes)" opacity=".35"/>
      <defs><pattern id="m-stripes" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="12" fill="#fff"/></pattern></defs>
      <path d="M44 112 C44 70 70 52 100 52 C130 52 156 70 156 112 Z" fill="#E7B865"/>
      <path d="M62 92 C74 80 90 76 100 76" stroke="#F6D79A" stroke-width="6" stroke-linecap="round" fill="none"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 200 200" width="72%" aria-hidden="true">
    <ellipse cx="100" cy="150" rx="84" ry="14" fill="#EBD9BE"/>
    <rect x="26" y="84" width="148" height="62" rx="8" fill="#F5E9D6" stroke="#C9A24B" stroke-width="2"/>
    <rect x="32" y="96" width="136" height="44" rx="4" fill="#F1D9A8"/>
    <path d="M32 96 q17 -14 34 0 t34 0 t34 0 t34 0" fill="#FFFBF3"/>
    <circle cx="66" cy="92" r="5" fill="#A31B3B"/><circle cx="100" cy="90" r="5" fill="#A31B3B"/><circle cx="134" cy="92" r="5" fill="#A31B3B"/>
    <path d="M32 118 H168" stroke="#E7C98C" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
  </svg>`;
}

function productMedia(p) {
  return p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    : `<div class="art-placeholder">${productArt(p.id)}</div>`;
}

function productCard(p) {
  const from = Math.min(...p.sizes.map((s) => s.price));
  return `<article class="product-card reveal">
    <a class="product-media" href="product.html?id=${p.id}">${productMedia(p)}</a>
    <div class="product-body">
      <span class="tag">${escapeHtml(p.tag)}</span>
      <h3><a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
      <div class="price">${p.sizes.length > 1 ? 'From ' : ''}${money(from)}</div>
      <p>${escapeHtml(p.description)}</p>
      <a class="btn btn-outline" href="product.html?id=${p.id}">View options</a>
    </div>
  </article>`;
}

/* ---------- Pages ---------- */

function initHome() {
  const grid = document.querySelector('[data-featured]');
  if (grid) grid.innerHTML = PRODUCTS.slice(0, 3).map(productCard).join('');
  const count = document.querySelector('[data-flavor-count]');
  if (count) count.textContent = `${BUILDER.flavors.length} cake flavors to choose from`;
  const chips = document.querySelector('[data-flavors]');
  if (chips) {
    chips.innerHTML = BUILDER.flavors.map((f) => `<span class="chip${f.price ? ' special' : ''}">${escapeHtml(f.label)}</span>`).join('');
  }
  const cafe = document.querySelector('[data-cafe]');
  if (cafe) {
    const c = SITE.cafe;
    cafe.querySelector('[data-cafe-name]').textContent = c.name || "Sample Bakery & Café";
    cafe.querySelector('[data-cafe-note]').textContent = c.note || '';
    const info = [c.address && ['Address', c.address], c.hours && ['Hours', c.hours]].filter(Boolean);
    cafe.querySelector('[data-cafe-info]').innerHTML = info.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
    if (c.address) {
      const map = cafe.querySelector('[data-cafe-map]');
      map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`;
      map.hidden = false;
    }
  }
}

function initShop() {
  document.querySelector('[data-products]').innerHTML = PRODUCTS.map(productCard).join('');
}

function initProduct() {
  const id = new URLSearchParams(location.search).get('id');
  const p = PRODUCTS.find((x) => x.id === id) || PRODUCTS[0];
  document.title = `${p.name} — Sample Bakery`;
  const root = document.querySelector('[data-product]');
  let qty = 1;

  root.innerHTML = `
    <div class="product-photo">${productMedia(p)}</div>
    <form class="product-info" novalidate>
      <a class="link-arrow" href="shop.html">← Back to shop</a>
      <div class="tag" style="margin-top:22px">${escapeHtml(p.tag)}</div>
      <h1>${escapeHtml(p.name)}</h1>
      <div class="price-lg" data-price>${money(p.sizes[0].price)}</div>
      <p class="desc">${escapeHtml(p.description)}</p>
      <fieldset class="opt-group">
        <legend>Size</legend>
        <div class="pills">
          ${p.sizes.map((s, i) => `<label class="pill"><input type="radio" name="size" value="${s.id}"${i === 0 ? ' checked' : ''}><span>${escapeHtml(s.label)} · ${money(s.price)}</span></label>`).join('')}
        </div>
      </fieldset>
      ${p.flavors ? `<fieldset class="opt-group">
        <legend>Flavor</legend>
        <div class="pills">
          ${p.flavors.map((f, i) => `<label class="pill"><input type="radio" name="flavor" value="${escapeHtml(f)}"${i === 0 ? ' checked' : ''}><span>${escapeHtml(f)}</span></label>`).join('')}
        </div>
      </fieldset>` : ''}
      <div class="field">
        <label for="msg">Message on cake <span class="muted" style="font-weight:400">(optional)</span></label>
        <input class="input" id="msg" name="message" maxlength="40" placeholder='e.g. "Happy Birthday Ana"'>
      </div>
      <div class="buy-row">
        <div class="qty" aria-label="Quantity">
          <button type="button" data-dec aria-label="Decrease quantity">−</button>
          <output data-qty>1</output>
          <button type="button" data-inc aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn-primary" type="submit" data-add>Add to cart · ${money(p.sizes[0].price)}</button>
      </div>
      <div class="info-list">
        <details open><summary>How ordering works</summary><p>Ready-made cakes need at least ${SITE.leadReady} days' notice. Pick your pickup date at checkout and the baker will confirm by email. A ${SITE.depositPct}% deposit reserves your date.</p></details>
        <details><summary>Want to change the design?</summary><p>Build your own in the <a class="link-arrow" href="builder.html">Custom Cake Builder</a>, or <a class="link-arrow" href="quote.html">request a quote</a> for something one-of-a-kind.</p></details>
        <details><summary>Allergens</summary><p>Our kitchen handles wheat, dairy, eggs, soy and nuts. Ask us about dietary needs before ordering.</p></details>
      </div>
    </form>`;

  const form = root.querySelector('form');
  const priceEl = root.querySelector('[data-price]');
  const addBtn = root.querySelector('[data-add]');
  const qtyEl = root.querySelector('[data-qty]');
  const size = () => p.sizes.find((s) => s.id === form.size.value);
  const refresh = () => {
    priceEl.textContent = money(size().price);
    addBtn.textContent = `Add to cart · ${money(size().price * qty)}`;
    qtyEl.textContent = qty;
  };
  form.addEventListener('change', refresh);
  root.querySelector('[data-inc]').addEventListener('click', () => { qty = Math.min(20, qty + 1); refresh(); });
  root.querySelector('[data-dec]').addEventListener('click', () => { qty = Math.max(1, qty - 1); refresh(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = size();
    const flavor = p.flavors ? form.flavor.value : null;
    const message = form.message.value.trim();
    Cart.add({
      type: 'product',
      sku: [p.id, s.id, flavor, message].join('|'),
      name: p.name,
      image: p.image,
      productId: p.id,
      sizeId: s.id,
      details: [s.label, flavor, message && `Message: "${message}"`].filter(Boolean),
      unitPrice: s.price,
      qty,
    });
    toast(`${p.name} added to your cart`, { href: 'cart.html', label: 'View cart' });
  });
}

function initGallery() {
  const filtersEl = document.querySelector('[data-filters]');
  const grid = document.querySelector('[data-gallery]');
  filtersEl.innerHTML = GALLERY_FILTERS.map((f, i) => `<button class="filter" type="button" data-filter="${f.id}" aria-pressed="${i === 0}">${escapeHtml(f.label)}</button>`).join('');
  grid.innerHTML = GALLERY.map((g, i) => `
    <button class="gallery-item" type="button" data-i="${i}" data-cats="${g.cats.join(' ')}">
      <img src="${g.src}" alt="${escapeHtml(g.title)}" loading="lazy">
      <figcaption>${escapeHtml(g.title)}</figcaption>
    </button>`).join('');

  const applyFilter = (btn) => {
    const f = btn.dataset.filter;
    filtersEl.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', b === btn));
    grid.querySelectorAll('.gallery-item').forEach((it) => {
      it.hidden = f !== 'all' && !it.dataset.cats.split(' ').includes(f);
    });
  };
  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (btn) applyFilter(btn);
  });
  const initial = filtersEl.querySelector(`[data-filter="${CSS.escape(new URLSearchParams(location.search).get('filter') || 'all')}"]`);
  if (initial) applyFilter(initial);

  const lb = document.querySelector('.lightbox');
  const lbImg = lb.querySelector('img');
  const lbTitle = lb.querySelector('h3');
  const lbLink = lb.querySelector('[data-request]');
  let lastFocus;
  const close = () => { lb.dataset.open = 'false'; lastFocus?.focus(); };
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    const g = GALLERY[item.dataset.i];
    lastFocus = item;
    lbImg.src = g.src;
    lbImg.alt = g.title;
    lbTitle.textContent = g.title;
    lbLink.href = `quote.html?ref=${encodeURIComponent(g.src)}&title=${encodeURIComponent(g.title)}`;
    lb.dataset.open = 'true';
    lb.querySelector('.lightbox-close').focus();
  });
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('.lightbox-close')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lb.dataset.open === 'true') close(); });
}

function minDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

const NOT_CONNECTED = "Online ordering isn't connected yet. Run the Supabase setup in the README, or open the demo with ?demo=1.";

function friendlyError(error) {
  const msg = error?.message || '';
  if (msg.includes('PRICE_CHANGED')) return 'Some prices were just updated. We refreshed your cart — please review it and place your order again.';
  if (msg.includes('ITEM_UNAVAILABLE')) return 'Something in your cart is no longer available. Please review your cart.';
  if (msg.includes('DATE_UNAVAILABLE')) {
    if (typeof Availability !== 'undefined') Availability.load(true);
    return "The baker isn't available on that date anymore. Please choose another day on the calendar.";
  }
  return 'Something went wrong sending your request. Please try again in a moment.';
}

function showFormError(form, message) {
  let el = form.querySelector('[data-form-error]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'notice';
    el.dataset.formError = '';
    el.setAttribute('role', 'alert');
    el.style.marginTop = '14px';
    form.querySelector('[type="submit"]').after(el);
  }
  el.textContent = message;
}

async function submitOrder({ name, email, phone, date, items }) {
  if (!sb) return { error: NOT_CONNECTED };
  const { data, error } = await sb.rpc('submit_order', {
    p_name: name, p_email: email, p_phone: phone, p_pickup_date: date, p_items: items,
  });
  if (!error) return { number: data };
  const stale = /PRICE_CHANGED|ITEM_UNAVAILABLE/.test(error.message || '');
  return { error: friendlyError(error), stale };
}

const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

async function submitQuote({ occasion, servings, description, date, budget, name, email, phone, ref, files }) {
  if (!sb) return { error: NOT_CONNECTED };
  const paths = [];
  for (const file of files) {
    const ext = PHOTO_EXT[file.type];
    if (!ext || file.size > 5 * 1024 * 1024) return { error: `"${file.name}" must be a JPG, PNG, WEBP or HEIC photo under 5 MB.` };
    const path = `incoming/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('quote-photos').upload(path, file, { contentType: file.type });
    if (error) return { error: 'We couldn\'t upload your photos. Please try again.' };
    paths.push(path);
  }
  const { data, error } = await sb.rpc('submit_quote', {
    p_occasion: occasion, p_servings: Number(servings), p_description: description, p_event_date: date,
    p_budget: budget, p_name: name, p_email: email, p_phone: phone, p_ref_image: ref, p_photo_paths: paths,
  });
  return error ? { error: friendlyError(error) } : { number: data };
}

function initQuote() {
  const form = document.querySelector('[data-quote-form]');
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref');
  const refBox = document.querySelector('[data-ref]');
  if (ref && GALLERY.some((g) => g.src === ref)) {
    const title = params.get('title') || '';
    refBox.hidden = false;
    refBox.style.display = 'flex';
    refBox.innerHTML = `<img src="${ref}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px">
      <div><strong>Inspired by: ${escapeHtml(title)}</strong><div class="hint" style="margin:0">We'll attach this photo to your request.</div></div>`;
  }
  attachDatePicker(form.date, SITE.leadCustom);

  const drop = form.querySelector('.dropzone');
  const fileInput = drop.querySelector('input');
  const thumbs = form.querySelector('.thumbs');
  const showFiles = (files) => {
    thumbs.innerHTML = '';
    [...files].slice(0, 4).forEach((f) => {
      if (!f.type.startsWith('image/')) return;
      const img = document.createElement('img');
      img.alt = f.name;
      img.src = URL.createObjectURL(f);
      thumbs.append(img);
    });
  };
  drop.addEventListener('click', (e) => { if (e.target !== fileInput) fileInput.click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => showFiles(fileInput.files));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => { fileInput.files = e.dataTransfer.files; showFiles(e.dataTransfer.files); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending…';
    const { number, error } = await submitQuote({
      ...data,
      ref: ref && GALLERY.some((g) => g.src === ref) ? ref : null,
      files: [...fileInput.files].filter((f) => f.type.startsWith('image/')).slice(0, 4),
    });
    button.disabled = false;
    button.textContent = 'Send my request';
    if (error) { showFormError(form, error); return; }
    document.querySelector('[data-quote-page]').innerHTML = `
      <div class="success">
        <div class="check">${ICONS.check}</div>
        <h2>Request ${escapeHtml(number)} sent!</h2>
        <p>Thank you, ${escapeHtml(data.name.split(' ')[0])}. The baker will review your idea and email a price to <strong>${escapeHtml(data.email)}</strong> within 1–2 days.</p>
        <a class="btn btn-primary" href="gallery.html">Keep browsing</a>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Keeps cart prices in line with the live catalog; returns true if any price changed.
function repriceCart() {
  const items = Cart.items();
  let changed = false;
  for (const it of items) {
    let price = null;
    if (it.type === 'product') {
      const size = PRODUCTS.find((p) => p.id === it.productId)?.sizes.find((z) => z.id === it.sizeId);
      price = size ? size.price : null;
    } else if (it.type === 'custom') {
      const cfg = validConfig(it.config);
      price = cfg ? priceOf(cfg).total : null;
    }
    it.unavailable = price === null;
    if (price !== null && price !== it.unitPrice) { it.unitPrice = price; changed = true; }
  }
  Cart.save(items);
  return changed;
}

function initCatering() {
  const form = document.querySelector('[data-catering-form]');
  attachDatePicker(form.date, SITE.leadCustom);
  document.querySelector('.package-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-package]');
    if (!b) return;
    form.package.value = b.dataset.package;
    document.getElementById('catering-form').scrollIntoView({ behavior: 'smooth' });
    form.guests.focus({ preventScroll: true });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    if (!sb) { showFormError(form, NOT_CONNECTED); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending…';
    const { data, error } = await sb.rpc('submit_catering', {
      p_package: d.package, p_guests: Number(d.guests), p_description: d.description, p_event_date: d.date,
      p_budget: d.budget, p_name: d.name, p_email: d.email, p_phone: d.phone,
    });
    button.disabled = false;
    button.textContent = 'Request a catering quote';
    if (error) { showFormError(form, friendlyError(error)); return; }
    document.querySelector('[data-catering-page]').innerHTML = `
      <div class="success" style="margin-top:56px">
        <div class="check">${ICONS.check}</div>
        <h2>Request ${escapeHtml(data)} sent!</h2>
        <p>Thank you, ${escapeHtml(d.name.split(' ')[0])}. The baker will review your event and email a menu and price to <strong>${escapeHtml(d.email)}</strong> within 1–2 days.</p>
        <a class="btn btn-primary" href="index.html">Back to home</a>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initCart() {
  const root = document.querySelector('[data-cart]');
  let notice = repriceCart() ? 'Some prices were updated since you added these items. Your cart shows the current prices.' : '';
  let pickedDate = '';

  const render = () => {
    const items = Cart.items();
    if (!items.length) {
      root.innerHTML = `<div class="empty">
        <div style="color:var(--gold-500);display:flex;justify-content:center;margin-bottom:12px">${ICONS.cake}</div>
        <h2>Your cart is empty</h2>
        <p class="muted">Pick a ready-made favorite or design your own.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a class="btn btn-primary" href="shop.html">Shop cakes</a>
          <a class="btn btn-outline" href="builder.html">Build a custom cake</a>
        </div>
      </div>`;
      return;
    }
    const subtotal = Cart.subtotal();
    const blocked = items.some((i) => i.unavailable);
    const custom = items.some((i) => i.type === 'custom');
    const lead = custom ? SITE.leadCustom : SITE.leadReady;
    root.innerHTML = `<div class="cart-layout">
      <div>
        ${notice ? `<div class="notice" role="status" style="margin-bottom:16px">${escapeHtml(notice)}</div>` : ''}
        ${items.map((it) => `
          <div class="cart-item">
            ${it.image ? `<img src="${escapeHtml(it.image)}" alt="">` : `<div class="thumb">${it.preview || (it.productId ? productArt(it.productId) : ICONS.cake)}</div>`}
            <div>
              <div class="tag">${it.type === 'custom' ? 'Custom build' : 'Ready-made'}</div>
              <h3>${escapeHtml(it.name)}</h3>
              ${it.unavailable ? '<div class="error-msg">No longer available — please remove it.</div>' : ''}
              <ul>${it.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
            </div>
            <div class="right">
              <div class="line-price">${money(it.unitPrice * it.qty)}</div>
              ${it.type === 'product' ? `<div class="qty" style="height:40px">
                <button type="button" data-dec="${it.uid}" aria-label="Decrease quantity">−</button>
                <output>${it.qty}</output>
                <button type="button" data-inc="${it.uid}" aria-label="Increase quantity">+</button>
              </div>` : ''}
              <button class="remove" type="button" data-remove="${it.uid}">Remove</button>
            </div>
          </div>`).join('')}
      </div>
      <aside class="summary">
        <h2>Order summary</h2>
        <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
        <div class="row"><span>Pickup</span><span>Free</span></div>
        <div class="row total"><span>Total</span><span>${money(subtotal)}</span></div>
        <div class="row deposit"><span>Deposit to confirm (${SITE.depositPct}%)</span><span>${money(depositOf(subtotal))}</span></div>
        <form data-checkout style="margin-top:22px" novalidate>
          <div class="field"><label for="c-name">Name</label><input class="input" id="c-name" name="name" required autocomplete="name"></div>
          <div class="field"><label for="c-email">Email</label><input class="input" id="c-email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="c-phone">Phone</label><input class="input" id="c-phone" name="phone" type="tel" required autocomplete="tel"></div>
          <div class="field"><label for="c-date">Pickup date</label><input class="input" id="c-date" name="date" type="date" required value="${escapeHtml(pickedDate)}">
            <div class="hint">Cakes need at least ${lead} days' notice. Greyed-out days aren't available.</div></div>
          <button class="btn btn-primary btn-block" type="submit"${blocked ? ' disabled' : ''}>Place order</button>
          <p class="hint" style="text-align:center">Nothing is charged now. The baker confirms your order by email and lets you know how to pay the ${SITE.depositPct}% deposit.</p>
        </form>
      </aside>
    </div>`;
    attachDatePicker(root.querySelector('#c-date'), lead, (day) => { pickedDate = day; });
  };

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const items = Cart.items();
    if (t.dataset.remove) Cart.remove(t.dataset.remove);
    if (t.dataset.inc) { const it = items.find((i) => i.uid === t.dataset.inc); Cart.setQty(it.uid, it.qty + 1); }
    if (t.dataset.dec) { const it = items.find((i) => i.uid === t.dataset.dec); Cart.setQty(it.uid, it.qty - 1); }
    if (t.dataset.remove || t.dataset.inc || t.dataset.dec) { notice = ''; render(); }
  });

  root.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-checkout]')) return;
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]');
    const items = Cart.items().map(({ type, name, details, unitPrice, qty, productId, sizeId, config }) =>
      ({ type, name, details, unitPrice, qty, productId: productId || null, sizeId: sizeId || null, config: config || null }));

    button.disabled = true;
    button.textContent = 'Sending…';
    const { number, error, stale } = await submitOrder({ ...data, items });
    button.disabled = false;
    button.textContent = 'Place order';
    if (stale) {
      await loadCatalog();
      repriceCart();
      notice = error;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (error) { showFormError(form, error); return; }

    Cart.clear();
    root.innerHTML = `<div class="success">
      <div class="check">${ICONS.check}</div>
      <h2>Order received!</h2>
      <p class="muted" style="margin-bottom:10px">Once the baker confirms, a ${SITE.depositPct}% deposit reserves your date.</p>
      <p>Your order number is <strong>${escapeHtml(number)}</strong>. The baker will check the calendar and email <strong>${escapeHtml(data.email)}</strong> to confirm your pickup on ${escapeHtml(new Date(data.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}.</p>
      <a class="btn btn-primary" href="index.html">Back to home</a>
    </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  render();
}

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;
  if (page === 'admin') return;
  await loadCatalog();
  renderChrome();
  document.querySelectorAll('[data-deposit-pct]').forEach((el) => { el.textContent = SITE.depositPct; });
  ({ home: initHome, shop: initShop, product: initProduct, gallery: initGallery, quote: initQuote, cart: initCart, catering: initCatering }[page] || (() => {}))();
  if (page === 'builder' && typeof initBuilder === 'function') initBuilder();
  initReveal();
});
