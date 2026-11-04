const STEPS = [
  { id: 'size', title: 'Size & Tiers', lede: 'How many people are you celebrating with?' },
  { id: 'flavor', title: 'Flavor', lede: 'Choose a cake flavor for each tier — mix and match.' },
  { id: 'filling', title: 'Filling', lede: 'What goes between the layers?' },
  { id: 'style', title: 'Icing Style', lede: 'Pick the finish. Want something more detailed? Request a quote.' },
  { id: 'color', title: 'Color', lede: 'Main buttercream color, plus an optional metallic touch.' },
  { id: 'topper', title: 'Message & Topper', lede: 'Add a message and the finishing touch.' },
  { id: 'review', title: 'Review', lede: 'Check everything before adding it to your cart.' },
];

const byId = (list, id) => list.find((x) => x.id === id);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
function isDark(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 150;
}

const safeHex = (hex, fallback) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : fallback);

function tierDims(size) {
  if (size.id === '6-1') return [{ w: 168, h: 104 }];
  if (size.id === '8-1') return [{ w: 214, h: 108 }];
  return {
    1: [{ w: 196, h: 106 }],
    2: [{ w: 214, h: 88 }, { w: 150, h: 78 }],
    3: [{ w: 232, h: 74 }, { w: 172, h: 66 }, { w: 116, h: 58 }],
  }[Math.min(3, Math.max(1, Number(size.tiers) || 1))];
}

// Servings = cake volume (each tier: round π·r²·h or square side²·h) ÷ portion volume (party 14 in³, wedding 8 in³).
function servingsFor(size, shapeId, portion) {
  const d = Array.isArray(size?.diameters) ? size.diameters.map(Number).filter((x) => x > 0) : [];
  if (!d.length) return null;
  const h = Number(size.height) || 4;
  const vol = d.reduce((v, x) => v + (shapeId === 'square' ? x * x : Math.PI * (x / 2) ** 2) * h, 0);
  return Math.max(1, Math.floor(vol / (SITE.portions[portion] || SITE.portions.party)));
}

function servesText(size, shapeId) {
  const party = servingsFor(size, shapeId, 'party');
  const wedding = servingsFor(size, shapeId, 'wedding');
  return party ? `Serves ~${party} party or ~${wedding} wedding portions` : size.detail || '';
}

// Normalizes a saved/edited config against the current catalog; null if any choice is no longer offered.
function validConfig(c) {
  if (!c || typeof c !== 'object') return null;
  const has = (list, id) => list.some((o) => o.id === id);
  const size = byId(BUILDER.sizes, c.size);
  if (!size || !has(BUILDER.shapes, c.shape) || !has(BUILDER.fillings, c.filling) || !has(BUILDER.styles, c.style)
    || !has(BUILDER.colors, c.color) || !has(BUILDER.accents, c.accent) || !has(BUILDER.toppers, c.topper)) return null;
  const flavors = Array.isArray(c.flavors) ? c.flavors.slice(0, 3) : [];
  for (let i = 0; i < (Number(size.tiers) || 1); i++) if (!has(BUILDER.flavors, flavors[i])) return null;
  return { ...c, flavors, portion: c.portion === 'wedding' ? 'wedding' : 'party', message: String(c.message || '').slice(0, 30) };
}

function cakeSvg(s) {
  const color = safeHex(byId(BUILDER.colors, s.color)?.hex, '#FFFBF3');
  const accentHex = /^#[0-9a-f]{6}$/i.test(byId(BUILDER.accents, s.accent)?.hex || '') ? byId(BUILDER.accents, s.accent).hex : null;
  const look = byId(BUILDER.styles, s.style)?.look || 'smooth';
  const topperLook = byId(BUILDER.toppers, s.topper)?.look || 'none';
  const top = shade(color, 0.28);
  const side = color;
  const edge = shade(color, -0.18);
  const piping = isDark(color) ? shade(color, 0.35) : shade(color, -0.12);
  const round = s.shape === 'round';
  const dims = tierDims(byId(BUILDER.sizes, s.size));
  const cx = 160;
  let y = 268;
  let out = '';
  const tops = [];

  dims.forEach((d, i) => {
    const x = cx - d.w / 2;
    const yTop = y - d.h;
    const ry = round ? 11 : 0;
    let tier = '';
    if (look === 'naked') {
      tier += `<rect x="${x}" y="${yTop}" width="${d.w}" height="${d.h}" rx="${round ? 4 : 2}" fill="#E4BD7E"/>`;
      const bands = 3;
      for (let b = 0; b <= bands; b++) {
        const by = yTop + (d.h / bands) * b - 4;
        tier += `<rect x="${x}" y="${Math.max(yTop, by)}" width="${d.w}" height="8" fill="${side}" opacity=".9"/>`;
      }
      tier += `<rect x="${x}" y="${yTop}" width="${d.w}" height="${d.h}" rx="${round ? 4 : 2}" fill="${side}" opacity=".28"/>`;
    } else {
      tier += `<rect x="${x}" y="${yTop}" width="${d.w}" height="${d.h}" rx="${round ? 4 : 3}" fill="${side}"/>`;
      tier += `<rect x="${x + d.w - 18}" y="${yTop}" width="18" height="${d.h}" fill="${edge}" opacity=".35"/>`;
      tier += `<rect x="${x}" y="${yTop}" width="14" height="${d.h}" fill="#fff" opacity=".12"/>`;
    }
    tier += round
      ? `<ellipse cx="${cx}" cy="${yTop}" rx="${d.w / 2}" ry="${ry}" fill="${look === 'naked' ? shade(side, 0.1) : top}"/>`
      : `<rect x="${x}" y="${yTop - 5}" width="${d.w}" height="7" rx="2" fill="${top}"/>`;

    if (look === 'vintage') {
      const n = Math.round(d.w / 14);
      for (let k = 0; k <= n; k++) {
        const px = x + (d.w / n) * k;
        tier += `<circle cx="${px}" cy="${yTop + 2}" r="6.5" fill="${piping}"/>`;
        tier += `<circle cx="${px}" cy="${y - 3}" r="7" fill="${piping}"/>`;
      }
      const swags = Math.max(3, Math.round(d.w / 44));
      let path = `M${x + 4} ${yTop + 16}`;
      for (let k = 0; k < swags; k++) {
        const x2 = x + 4 + ((d.w - 8) / swags) * (k + 1);
        const xm = x + 4 + ((d.w - 8) / swags) * (k + 0.5);
        path += ` Q${xm} ${yTop + 16 + d.h * 0.32} ${x2} ${yTop + 16}`;
      }
      tier += `<path d="${path}" fill="none" stroke="${piping}" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (look === 'drip' && i === dims.length - 1) {
      const drip = '#4A2418';
      let path = `M${x} ${yTop}`;
      const n = Math.round(d.w / 18);
      for (let k = 0; k < n; k++) {
        const dx = d.w / n;
        const len = 14 + ((k * 37) % 26);
        const x0 = x + dx * k;
        path += ` L${x0 + dx * 0.2} ${yTop} L${x0 + dx * 0.2} ${yTop + len} Q${x0 + dx * 0.5} ${yTop + len + 10} ${x0 + dx * 0.8} ${yTop + len} L${x0 + dx * 0.8} ${yTop}`;
      }
      path += ` L${x + d.w} ${yTop} Z`;
      tier += `<path d="${path}" fill="${drip}"/>`;
      tier += round ? `<ellipse cx="${cx}" cy="${yTop}" rx="${d.w / 2}" ry="${ry}" fill="${drip}"/>` : `<rect x="${x}" y="${yTop - 5}" width="${d.w}" height="8" fill="${drip}"/>`;
    }
    if (look === 'floral') {
      const clusters = [[x + 16, yTop + 18], [x + d.w * 0.62, y - 16]];
      clusters.forEach(([fx, fy]) => {
        tier += `<ellipse cx="${fx - 12}" cy="${fy + 6}" rx="9" ry="4.5" fill="#7E9A64" transform="rotate(-24 ${fx - 12} ${fy + 6})"/>`;
        [[0, 0, 11], [16, 5, 9], [-4, 14, 8]].forEach(([ox, oy, r], j) => {
          const c = j === 0 ? '#D9607A' : j === 1 ? '#F2A9B8' : '#FFFBF3';
          tier += `<circle cx="${fx + ox}" cy="${fy + oy}" r="${r}" fill="${c}"/><circle cx="${fx + ox}" cy="${fy + oy}" r="${r * 0.45}" fill="none" stroke="${shade(c, -0.2)}" stroke-width="1.5"/>`;
        });
      });
    }
    if (accentHex) {
      tier += `<rect x="${x}" y="${y - 7}" width="${d.w}" height="6" fill="${accentHex}"/>`;
    }
    out += tier;
    tops.push({ yTop, w: d.w });
    y = yTop;
  });

  const topTier = tops[tops.length - 1];
  if (look === 'fruit') {
    const tY = topTier.yTop;
    const w = topTier.w;
    [[-0.36, 0], [-0.18, -4], [0, -6], [0.18, -4], [0.36, 0]].forEach(([fx, oy], k) => {
      const px = cx + fx * w;
      if (k % 2 === 0) {
        out += `<path d="M${px - 9} ${tY + oy - 4} Q${px} ${tY + oy + 18} ${px + 9} ${tY + oy - 4} Q${px} ${tY + oy - 10} ${px - 9} ${tY + oy - 4}Z" fill="#C8283C"/><path d="M${px - 5} ${tY + oy - 8} l5 3 l5 -3" stroke="#5E8C3A" stroke-width="2.5" fill="none"/>`;
      } else {
        out += `<circle cx="${px}" cy="${tY + oy - 4}" r="7" fill="#fff"/><circle cx="${px}" cy="${tY + oy - 4}" r="2.8" fill="#E8B730"/>`;
      }
    });
    out += `<path d="M${cx + w * 0.08} ${tY - 2} a10 10 0 0 1 20 0 z" fill="#F4D03F" stroke="#E0B21F" stroke-width="1.5"/>`;
  }

  const tY = topTier.yTop;
  if (topperLook === 'hbd' || topperLook === 'name') {
    const label = topperLook === 'hbd' ? 'Happy Birthday' : (s.message || 'Your Name');
    out += `<line x1="${cx - 30}" y1="${tY - 6}" x2="${cx - 30}" y2="${tY - 30}" stroke="#C9A24B" stroke-width="2"/><line x1="${cx + 30}" y1="${tY - 6}" x2="${cx + 30}" y2="${tY - 30}" stroke="#C9A24B" stroke-width="2"/>`;
    out += `<text x="${cx}" y="${tY - 34}" text-anchor="middle" font-family="Playball, cursive" font-size="24" fill="#C9A24B">${escapeHtml(label.slice(0, 16))}</text>`;
  }
  if (topperLook === 'numbers') {
    [-14, 14].forEach((ox) => {
      out += `<rect x="${cx + ox - 5}" y="${tY - 34}" width="10" height="30" rx="2" fill="#F4C6CF" stroke="#D98A9A"/><path d="M${cx + ox} ${tY - 48} q6 8 0 12 q-6 -4 0 -12z" fill="#F4A12F"/>`;
    });
  }
  if (topperLook === 'flowers') {
    [[-22, 0, 12, '#D9607A'], [0, -8, 14, '#FFFBF3'], [22, 0, 12, '#F2A9B8'], [-8, 4, 8, '#F4C6CF'], [12, 4, 8, '#C8283C']].forEach(([ox, oy, r, c]) => {
      out += `<circle cx="${cx + ox}" cy="${tY - 6 + oy}" r="${r}" fill="${c}"/><circle cx="${cx + ox}" cy="${tY - 6 + oy}" r="${r * 0.4}" fill="none" stroke="${shade(c, -0.2)}" stroke-width="1.5"/>`;
    });
  }

  if (s.message && s.topper !== 'name') {
    const bottom = dims[0];
    const msgY = 268 - bottom.h / 2 + 6;
    out += `<text x="${cx}" y="${msgY}" text-anchor="middle" font-family="Playball, cursive" font-size="${bottom.w > 200 ? 20 : 17}" fill="${isDark(color) ? '#FFFBF3' : '#7A1330'}">${escapeHtml(s.message.slice(0, 22))}</text>`;
  }

  return `<svg viewBox="0 0 320 300" role="img" aria-label="Preview of your custom cake">
    <ellipse cx="160" cy="284" rx="132" ry="10" fill="#E6D3B3" opacity=".7"/>
    <rect x="148" y="268" width="24" height="16" fill="#EFE3CF"/>
    <ellipse cx="160" cy="270" rx="128" ry="11" fill="#FFFDF9" stroke="#E6D3B3" stroke-width="2"/>
    ${out}
  </svg>`;
}

function priceOf(s) {
  const size = byId(BUILDER.sizes, s.size);
  const tiers = size.tiers;
  const lines = [];
  lines.push([size.label, size.price]);
  const shape = byId(BUILDER.shapes, s.shape);
  if (shape.price) lines.push([shape.label + ' shape', shape.price]);
  s.flavors.slice(0, tiers).forEach((id, i) => {
    const f = byId(BUILDER.flavors, id);
    if (f?.price) lines.push([`${f.label}${tiers > 1 ? ` (tier ${i + 1})` : ''}`, f.price]);
  });
  const filling = byId(BUILDER.fillings, s.filling);
  if (filling.price) lines.push([filling.label, filling.price * tiers]);
  const style = byId(BUILDER.styles, s.style);
  if (style.price) lines.push([style.label, style.price * tiers]);
  const color = byId(BUILDER.colors, s.color);
  if (color.price) lines.push([color.label, color.price]);
  const accent = byId(BUILDER.accents, s.accent);
  if (accent.price) lines.push([accent.label, accent.price]);
  const topper = byId(BUILDER.toppers, s.topper);
  if (topper.price) lines.push([topper.label, topper.price]);
  return { lines, total: lines.reduce((n, [, p]) => n + p, 0) };
}

function summaryRows(s) {
  const size = byId(BUILDER.sizes, s.size);
  const flavors = s.flavors.slice(0, size.tiers).map((id) => byId(BUILDER.flavors, id)?.label || id);
  return [
    ['Size', `${size.label} · ${byId(BUILDER.shapes, s.shape).label}`],
    ['Serves', (() => {
      const n = servingsFor(size, s.shape, s.portion);
      return n ? `~${n} ${s.portion === 'wedding' ? 'wedding' : 'party'} portions` : (size.detail || '—');
    })()],
    ['Flavor', size.tiers === 1 ? flavors[0] : flavors.map((f, i) => `T${i + 1}: ${f}`).join(', ')],
    ['Filling', byId(BUILDER.fillings, s.filling).label],
    ['Icing', byId(BUILDER.styles, s.style).label],
    ['Color', byId(BUILDER.colors, s.color).label + (byId(BUILDER.accents, s.accent).price || byId(BUILDER.accents, s.accent).hex ? ` + ${byId(BUILDER.accents, s.accent).label.replace(' accents', '').toLowerCase()}` : '')],
    ['Topper', byId(BUILDER.toppers, s.topper).label],
    ...(s.message ? [['Message', `"${s.message}"`]] : []),
  ];
}

function optionRow(name, o, checked, absolute = false) {
  const price = absolute ? money(o.price) : o.price ? `+${money(o.price)}` : 'Included';
  return `<label class="option">
    <input type="radio" name="${name}" value="${escapeHtml(o.id)}"${checked ? ' checked' : ''}>
    <span class="opt">
      <span class="radio"></span>
      <span class="opt-text"><strong>${escapeHtml(o.label)}</strong>${o.detail ? `<small>${escapeHtml(o.detail)}</small>` : ''}</span>
      <span class="opt-price">${price}</span>
    </span>
  </label>`;
}

function initBuilder() {
  const first = (list) => list[0]?.id;
  const fl = BUILDER.flavors.map((f) => f.id);
  const s = {
    size: first(BUILDER.sizes), shape: first(BUILDER.shapes),
    flavors: [fl[0], fl[1] || fl[0], fl[5] || fl[0]],
    filling: first(BUILDER.fillings), style: first(BUILDER.styles), color: first(BUILDER.colors),
    accent: (BUILDER.accents.find((a) => !a.price) || BUILDER.accents[0])?.id,
    topper: (BUILDER.toppers.find((t) => !t.price) || BUILDER.toppers[0])?.id,
    portion: 'party', message: '', notes: '',
  };
  let step = 0;
  let reached = 0;

  const rail = document.querySelector('[data-rail]');
  const panel = document.querySelector('[data-panel]');
  const preview = document.querySelector('[data-preview]');
  const summary = document.querySelector('[data-summary]');
  const totalEl = document.querySelector('[data-total]');
  let lastTotal = null;

  const renderRail = () => {
    rail.innerHTML = STEPS.map((st, i) => {
      const state = i === step ? 'current' : i <= reached ? 'done' : 'todo';
      return `<li><button type="button" data-go="${i}" data-state="${state}"${i > reached ? ' disabled' : ''}${i === step ? ' aria-current="step"' : ''}>
        <span class="num">${i < reached && i !== step ? '✓' : i + 1}</span>${st.title}</button></li>`;
    }).join('');
  };

  const renderPreview = () => {
    preview.innerHTML = cakeSvg(s);
    summary.innerHTML = summaryRows(s).map(([k, v]) => `<li><span>${k}</span><span>${escapeHtml(v)}</span></li>`).join('');
    const { total } = priceOf(s);
    totalEl.textContent = money(total);
    if (lastTotal !== null && lastTotal !== total) {
      totalEl.classList.remove('price-bump');
      void totalEl.offsetWidth;
      totalEl.classList.add('price-bump');
    }
    lastTotal = total;
  };

  const stepBody = () => {
    const id = STEPS[step].id;
    const tiers = byId(BUILDER.sizes, s.size).tiers;
    if (id === 'size') {
      return `<fieldset class="opt-group"><legend class="sr-only">Size</legend><div class="options">
          ${BUILDER.sizes.map((o) => optionRow('size', { ...o, detail: servesText(o, s.shape) }, s.size === o.id, true)).join('')}
        </div></fieldset>
        <fieldset class="opt-group" style="margin-top:28px"><legend>Portion size</legend><div class="pills">
          <label class="pill"><input type="radio" name="portion" value="party"${s.portion === 'party' ? ' checked' : ''}><span>Party portions</span></label>
          <label class="pill"><input type="radio" name="portion" value="wedding"${s.portion === 'wedding' ? ' checked' : ''}><span>Wedding portions</span></label>
        </div>
        <p class="hint">Party slices are generous (about ${SITE.portions.party} in³); wedding slices are slimmer (about ${SITE.portions.wedding} in³), so the same cake serves more guests.</p></fieldset>
        <fieldset class="opt-group" style="margin-top:28px"><legend>Shape</legend><div class="pills">
          ${BUILDER.shapes.map((o) => `<label class="pill"><input type="radio" name="shape" value="${escapeHtml(o.id)}"${s.shape === o.id ? ' checked' : ''}><span>${escapeHtml(o.label)}${o.price ? ` · +${money(o.price)}` : ''}</span></label>`).join('')}
        </div></fieldset>`;
    }
    if (id === 'flavor') {
      const names = ['Bottom tier', 'Middle tier', 'Top tier'];
      const labels = tiers === 1 ? ['Cake flavor'] : tiers === 2 ? ['Bottom tier', 'Top tier'] : names;
      return `<div class="tier-flavors">${labels.map((lab, i) => `
        <div class="field" style="margin:0">
          <label for="fl-${i}">${lab}</label>
          <select class="select" id="fl-${i}" data-flavor="${i}">
            <optgroup label="Classic">${BUILDER.flavors.filter((f) => !f.price).map((f) => `<option value="${escapeHtml(f.id)}"${s.flavors[i] === f.id ? ' selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}</optgroup>
            ${BUILDER.flavors.some((f) => f.price) ? `<optgroup label="Premium">${BUILDER.flavors.filter((f) => f.price).map((f) => `<option value="${escapeHtml(f.id)}"${s.flavors[i] === f.id ? ' selected' : ''}>${escapeHtml(f.label)} (+${money(f.price)})</option>`).join('')}</optgroup>` : ''}
          </select>
        </div>`).join('')}</div>`;
    }
    if (id === 'filling') {
      return `<div class="options">${BUILDER.fillings.map((o) => optionRow('filling', { ...o, price: o.price * tiers }, s.filling === o.id)).join('')}</div>
        ${tiers > 1 ? `<p class="hint">Filling prices include all ${tiers} tiers.</p>` : ''}`;
    }
    if (id === 'style') {
      return `<div class="options">${BUILDER.styles.map((o) => optionRow('style', { ...o, price: o.price * tiers }, s.style === o.id)).join('')}</div>`;
    }
    if (id === 'color') {
      return `<div class="swatch-grid">${BUILDER.colors.map((c) => `
        <label class="option"><input type="radio" name="color" value="${escapeHtml(c.id)}"${s.color === c.id ? ' checked' : ''}>
          <span class="opt"><span class="swatch" style="background:${safeHex(c.hex, '#FFFBF3')}"></span><span class="opt-text"><strong>${escapeHtml(c.label)}</strong>${c.price ? `<small>+${money(c.price)}</small>` : ''}</span></span>
        </label>`).join('')}</div>
        <fieldset class="opt-group" style="margin-top:28px"><legend>Metallic accent</legend><div class="pills">
          ${BUILDER.accents.map((o) => `<label class="pill"><input type="radio" name="accent" value="${escapeHtml(o.id)}"${s.accent === o.id ? ' checked' : ''}><span>${escapeHtml(o.label)}${o.price ? ` · +${money(o.price)}` : ''}</span></label>`).join('')}
        </div></fieldset>`;
    }
    if (id === 'topper') {
      return `<div class="field">
          <label for="b-msg">Message on the cake <span class="muted" style="font-weight:400">(optional, free)</span></label>
          <input class="input" id="b-msg" data-message maxlength="30" value="${escapeHtml(s.message)}" placeholder='e.g. "Happy 30th Ana"'>
          <div class="hint">Up to 30 characters. For a custom name topper, this text goes on the topper.</div>
        </div>
        <div class="options">${BUILDER.toppers.map((o) => optionRow('topper', o, s.topper === o.id)).join('')}</div>`;
    }
    const { lines, total } = priceOf(s);
    return `<ul class="summary-list" style="font-size:15px;margin-top:0">
        ${summaryRows(s).map(([k, v]) => `<li style="padding:10px 0;border-bottom:1px solid var(--cream-200)"><span>${k}</span><span>${escapeHtml(v)}</span></li>`).join('')}
      </ul>
      <h3 style="font-size:18px;margin:28px 0 8px">Price breakdown</h3>
      <ul class="summary-list">${lines.map(([k, p]) => `<li><span>${escapeHtml(k)}</span><span>${money(p)}</span></li>`).join('')}
        <li style="border-top:1px solid var(--cream-200);padding-top:10px;font-weight:600"><span>Total</span><span>${money(total)}</span></li></ul>
      <div class="field" style="margin-top:24px">
        <label for="b-notes">Notes for the baker <span class="muted" style="font-weight:400">(optional)</span></label>
        <textarea class="textarea" id="b-notes" data-notes maxlength="400" placeholder="Allergies, color references, anything we should know">${escapeHtml(s.notes)}</textarea>
      </div>
      <div class="notice">A ${SITE.depositPct}% deposit (${money(depositOf(total))}) confirms your cake once the baker accepts it. Custom cakes need at least ${BUILDER.minLeadDays} days' notice; you'll choose your pickup date at checkout.</div>`;
  };

  const renderPanel = () => {
    const st = STEPS[step];
    const last = step === STEPS.length - 1;
    panel.innerHTML = `
      <div class="step-meta"><span class="eyebrow">Step ${step + 1} of ${STEPS.length}</span></div>
      <h2 tabindex="-1">${st.title}</h2>
      <p class="muted" style="margin:8px 0 24px">${st.lede}</p>
      <form data-step-form novalidate>${stepBody()}</form>
      <div class="escape"><span>Something more specific in mind?</span><a href="quote.html">Describe it and get a personal quote →</a></div>
      <div class="step-nav">
        <button class="btn btn-outline" type="button" data-back${step === 0 ? ' disabled' : ''}>← Back</button>
        <span class="step-count">${step + 1} / ${STEPS.length}</span>
        ${last
          ? `<button class="btn btn-primary" type="button" data-add>Add to cart · ${money(priceOf(s).total)}</button>`
          : `<button class="btn btn-primary" type="button" data-next>Next: ${STEPS[step + 1].title} →</button>`}
      </div>`;
  };

  const go = (i) => {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    reached = Math.max(reached, step);
    renderRail();
    renderPanel();
    renderPreview();
    panel.querySelector('h2').focus({ preventScroll: true });
    const top = panel.getBoundingClientRect().top + window.scrollY - 110;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  };

  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b && !b.disabled) go(Number(b.dataset.go));
  });

  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.flavor !== undefined) s.flavors[Number(t.dataset.flavor)] = t.value;
    else if (t.name && t.name in s) s[t.name] = t.value;
    renderPreview();
    if (STEPS[step].id === 'review' || t.name === 'shape') renderPanel();
  });

  panel.addEventListener('input', (e) => {
    if (e.target.matches('[data-message]')) { s.message = e.target.value; renderPreview(); }
    if (e.target.matches('[data-notes]')) s.notes = e.target.value;
  });

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) go(step + 1);
    if (e.target.closest('[data-back]')) go(step - 1);
    if (e.target.closest('[data-add]')) {
      const size = byId(BUILDER.sizes, s.size);
      const { total } = priceOf(s);
      const details = summaryRows(s).map(([k, v]) => `${k}: ${v}`);
      if (s.notes.trim()) details.push(`Notes: ${s.notes.trim()}`);
      Cart.add({
        type: 'custom',
        name: `Custom ${size.tiers > 1 ? size.tiers + '-Tier ' : ''}Cake`,
        image: null,
        preview: cakeSvg(s),
        config: { ...s, flavors: [...s.flavors] },
        details,
        unitPrice: total,
        qty: 1,
      });
      location.href = 'cart.html';
    }
  });

  renderRail();
  renderPanel();
  renderPreview();
}
