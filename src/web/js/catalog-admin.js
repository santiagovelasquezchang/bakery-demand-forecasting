// "Precios y menú" tab: the baker edits ready-made cakes, Custom Cake Builder options and site settings.
// Everything saves straight to Supabase; the public site reads it on the next page load.
const Cat = { view: 'products', loaded: false, products: [], options: [], settings: {} };

const OPTION_SECTIONS = [
  { grp: 'size', title: 'Tamaños', help: 'Precio base según el tamaño. En "Medidas" escribe el diámetro de cada piso en pulgadas, de abajo hacia arriba (ej. 10, 8, 6); con eso calculamos las porciones.', priceLabel: 'Precio', tiers: true },
  { grp: 'flavor', title: 'Sabores de bizcocho', help: 'Precio extra por cada piso con ese sabor. Deja $0 si está incluido.', priceLabel: 'Extra por piso' },
  { grp: 'filling', title: 'Rellenos', help: 'Precio extra por cada piso.', priceLabel: 'Extra por piso', detail: 'Descripción corta' },
  { grp: 'style', title: 'Decoración', help: 'Precio extra por cada piso. "Dibujo" es cómo se ve en la vista previa del pastel.', priceLabel: 'Extra por piso', detail: 'Descripción corta', looks: { smooth: 'Liso', naked: 'Semi-desnudo', vintage: 'Vintage', drip: 'Con chorreado', fruit: 'Fruta y flores', floral: 'Flores de crema' } },
  { grp: 'color', title: 'Colores', help: 'Color principal del pastel.', priceLabel: 'Extra', hex: true },
  { grp: 'accent', title: 'Detalles metálicos', help: 'Dorado, plateado, etc. Se cobra una vez por pastel.', priceLabel: 'Extra', hex: true },
  { grp: 'topper', title: 'Toppers', help: 'Se cobra una vez por pastel.', priceLabel: 'Extra', detail: 'Descripción corta', looks: { none: 'Ninguno', hbd: 'Happy Birthday', numbers: 'Velas de número', name: 'Nombre', flowers: 'Flores' } },
  { grp: 'shape', title: 'Formas', help: 'Precio extra por la forma.', priceLabel: 'Extra' },
];

const slugify = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
const uniqueSlug = (base, taken) => {
  let k = base;
  for (let n = 2; taken.includes(k); n++) k = `${base.slice(0, 36)}-${n}`;
  return k;
};
const priceVal = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 10000 ? Math.round(n * 100) / 100 : null;
};
const saved = (extra = '') => { toast(`Guardado${extra}. Ya se ve en la página web.`); loadCatalog(); };

async function catLoad() {
  const [p, o, s] = await Promise.all([
    sb.from('catalog_products').select('*').order('sort').order('name'),
    sb.from('builder_options').select('*').order('sort').order('label'),
    sb.from('site_settings').select('*'),
  ]);
  if (p.error || o.error || s.error) { toast('No se pudo cargar el menú.'); return false; }
  Cat.products = p.data;
  Cat.options = o.data;
  Cat.settings = Object.fromEntries(s.data.map((r) => [r.key, r.value]));
  Cat.loaded = true;
  return true;
}

async function renderCatalog() {
  const views = [['products', 'Pasteles listos'], ['builder', 'Pastel personalizado'], ['settings', 'Ajustes del sitio']];
  $('[data-cat-tabs]').innerHTML = views.map(([id, label]) =>
    `<button type="button" class="filter" data-cat-view="${id}" aria-pressed="${Cat.view === id}">${label}</button>`).join('');
  const body = $('[data-cat-body]');
  if (!Cat.loaded) {
    body.innerHTML = '<div class="empty-list">Cargando menú…</div>';
    if (!(await catLoad())) { body.innerHTML = '<div class="empty-list">No se pudo cargar el menú.</div>'; return; }
  }
  const open = $$('.opt-section[open] [data-opt-add]', body).map((f) => f.dataset.optAdd);
  body.innerHTML = { products: catProductsView, builder: catBuilderView, settings: catSettingsView }[Cat.view]();
  open.forEach((g) => { const d = body.querySelector(`[data-opt-add="${g}"]`)?.closest('details'); if (d) d.open = true; });
}

/* ---------- Pasteles listos ---------- */

function catProductsView() {
  return `
    <div class="cat-intro">
      <p>Estos son los pasteles que los clientes pueden pedir directo en la tienda. <a class="link-arrow" href="shop.html" target="_blank" rel="noopener">Ver la tienda →</a></p>
      <button class="btn btn-primary" type="button" data-prod-new>+ Agregar pastel</button>
    </div>
    <div class="prod-list">
      ${Cat.products.map((p, i) => {
        const from = Math.min(...p.sizes.map((s) => Number(s.price)));
        return `<article class="prod-row${p.active ? '' : ' hidden-item'}">
          <div class="prod-thumb">${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="">` : productArt(p.id)}</div>
          <div class="prod-main">
            <h3>${escapeHtml(p.name)}</h3>
            <div class="meta">${p.sizes.map((s) => `${escapeHtml(s.label)}: <strong>${money(s.price)}</strong>`).join(' · ')}</div>
            ${p.active ? '' : '<span class="badge declined" style="margin-top:6px;display:inline-block">Oculto en la web</span>'}
          </div>
          <div class="prod-actions">
            <label class="switch" title="Visible en la web"><input type="checkbox" data-prod-active="${p.id}"${p.active ? ' checked' : ''}><span></span><em>Visible</em></label>
            <button class="icon-btn" type="button" data-prod-move="${p.id}:-1" aria-label="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
            <button class="icon-btn" type="button" data-prod-move="${p.id}:1" aria-label="Bajar"${i === Cat.products.length - 1 ? ' disabled' : ''}>↓</button>
            <button class="btn btn-outline btn-sm" type="button" data-prod-edit="${p.id}">Editar</button>
          </div>
          <span class="sr-only">Desde ${money(from)}</span>
        </article>`;
      }).join('') || '<div class="empty-list">Aún no hay pasteles. Agrega el primero.</div>'}
    </div>`;
}

function sizeRow(s) {
  return `<div class="size-row" data-size-row data-size-id="${escapeHtml(s.id)}">
    <input class="input" name="size_label" value="${escapeHtml(s.label)}" placeholder='ej. 8" · serves 20–24' maxlength="60" required aria-label="Tamaño">
    <div class="money-input"><span>$</span><input class="input" name="size_price" type="number" min="0" step="0.01" value="${s.price ?? ''}" required aria-label="Precio"></div>
    <button class="remove" type="button" data-size-del aria-label="Quitar tamaño">Quitar</button>
  </div>`;
}

function openProductEditor(p) {
  const isNew = !p;
  p = p || { name: '', tag: '', description: '', image_url: null, sizes: [{ id: 's1', label: '', price: '' }], flavors: [], active: true };
  openModal(`
    <h2>${isNew ? 'Nuevo pastel' : 'Editar pastel'}</h2>
    <p class="muted" style="font-size:14px">Escríbelo como quieres que lo lean los clientes (la página está en inglés).</p>
    <div class="field" style="margin-top:16px"><label for="p-name">Nombre</label><input class="input" id="p-name" name="name" value="${escapeHtml(p.name)}" maxlength="80" required></div>
    <div class="field"><label for="p-tag">Etiqueta corta <span class="muted" style="font-weight:400">(opcional, ej. Fresh &amp; Floral)</span></label><input class="input" id="p-tag" name="tag" value="${escapeHtml(p.tag || '')}" maxlength="40"></div>
    <div class="field"><label for="p-desc">Descripción</label><textarea class="textarea" id="p-desc" name="description" maxlength="600" style="min-height:90px">${escapeHtml(p.description || '')}</textarea></div>
    <div class="field">
      <span class="label">Foto</span>
      <div class="photo-pick">
        <div class="prod-thumb" data-photo-preview>${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="">` : '<span class="muted" style="font-size:12px">Sin foto</span>'}</div>
        <label class="btn btn-outline btn-sm">Subir foto<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-file hidden></label>
        ${p.image_url ? '<button class="link-btn" type="button" data-photo-clear>Quitar foto</button>' : ''}
      </div>
    </div>
    <div class="field">
      <span class="label">Tamaños y precios</span>
      <div data-sizes>${p.sizes.map(sizeRow).join('')}</div>
      <button class="link-btn" type="button" data-size-add style="padding-left:0">+ Agregar tamaño</button>
    </div>
    <div class="field"><label for="p-flavors">Sabores que puede elegir el cliente <span class="muted" style="font-weight:400">(uno por línea; vacío = sin opción de sabor)</span></label>
      <textarea class="textarea" id="p-flavors" name="flavors" style="min-height:90px">${escapeHtml((p.flavors || []).join('\n'))}</textarea></div>
    <label class="check-line"><input type="checkbox" name="active"${p.active ? ' checked' : ''}> Visible en la página web</label>
    <div class="modal-actions" style="justify-content:space-between">
      ${isNew ? '<span></span>' : `<button class="btn btn-outline" type="button" data-prod-delete="${p.id}" style="border-color:var(--maroon-600)">Eliminar pastel</button>`}
      <div style="display:flex;gap:10px">${cancelBtn}<button class="btn btn-primary" type="submit">Guardar</button></div>
    </div>`,
  async (form, btn) => {
    const sizes = $$('[data-size-row]', form).map((r) => ({
      id: r.dataset.sizeId, label: r.querySelector('[name="size_label"]').value.trim(), price: priceVal(r.querySelector('[name="size_price"]').value),
    }));
    if (!sizes.length) { toast('Agrega al menos un tamaño con precio.'); return; }
    if (sizes.some((s) => !s.label || s.price === null)) { toast('Revisa los tamaños: cada uno necesita nombre y precio.'); return; }
    btn.disabled = true;
    let image = form.dataset.image === undefined ? p.image_url : form.dataset.image || null;
    const file = form.querySelector('[data-photo-file]').files[0];
    if (file) {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      if (!ext || file.size > 5 * 1024 * 1024) { btn.disabled = false; toast('La foto debe ser JPG, PNG o WEBP de máximo 5 MB.'); return; }
      const path = `products/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('catalog').upload(path, file, { contentType: file.type });
      if (up.error) { btn.disabled = false; toast('No se pudo subir la foto.'); return; }
      image = sb.storage.from('catalog').getPublicUrl(path).data.publicUrl;
    }
    const flavors = form.flavors.value.split('\n').map((f) => f.trim()).filter(Boolean).slice(0, 30);
    const row = {
      name: form.name.value.trim(), tag: form.tag.value.trim() || null, description: form.description.value.trim() || null,
      image_url: image, sizes, flavors: flavors.length ? flavors : null, active: form.active.checked, updated_at: new Date().toISOString(),
    };
    const res = isNew
      ? await sb.from('catalog_products').insert({ ...row, id: uniqueSlug(slugify(row.name).padEnd(2, '0'), Cat.products.map((x) => x.id)), sort: Math.max(0, ...Cat.products.map((x) => x.sort)) + 1 })
      : await sb.from('catalog_products').update(row).eq('id', p.id);
    btn.disabled = false;
    if (res.error) { toast('No se pudo guardar.'); return; }
    modal().close();
    await catLoad();
    renderCatalog();
    saved();
  });

  const form = modalForm();
  form.querySelector('[data-size-add]').onclick = () => {
    const taken = $$('[data-size-row]', form).map((r) => r.dataset.sizeId);
    form.querySelector('[data-sizes]').insertAdjacentHTML('beforeend', sizeRow({ id: uniqueSlug('s', taken), label: '', price: '' }));
  };
  form.querySelector('[data-sizes]').onclick = (e) => {
    if (e.target.closest('[data-size-del]')) e.target.closest('[data-size-row]').remove();
  };
  form.querySelector('[data-photo-file]').onchange = (e) => {
    const f = e.target.files[0];
    if (f) form.querySelector('[data-photo-preview]').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
  };
  const clear = form.querySelector('[data-photo-clear]');
  if (clear) clear.onclick = () => { form.dataset.image = ''; form.querySelector('[data-photo-preview]').innerHTML = '<span class="muted" style="font-size:12px">Sin foto</span>'; clear.remove(); };
  const del = form.querySelector('[data-prod-delete]');
  if (del) del.onclick = async () => {
    if (!confirm(`¿Eliminar "${p.name}" de la tienda? Si solo quieres esconderlo por un tiempo, desmarca "Visible".`)) return;
    const { error } = await sb.from('catalog_products').delete().eq('id', p.id);
    if (error) { toast('No se pudo eliminar.'); return; }
    modal().close();
    await catLoad();
    renderCatalog();
    saved();
  };
}

async function moveProduct(id, dir) {
  const i = Cat.products.findIndex((p) => p.id === id);
  const j = i + dir;
  if (j < 0 || j >= Cat.products.length) return;
  const list = [...Cat.products];
  [list[i], list[j]] = [list[j], list[i]];
  const results = await Promise.all(list.map((p, k) => (p.sort === k + 1 ? null : sb.from('catalog_products').update({ sort: k + 1 }).eq('id', p.id))));
  if (results.some((r) => r?.error)) { toast('No se pudo reordenar.'); return; }
  await catLoad();
  renderCatalog();
}

/* ---------- Pastel personalizado ---------- */

function optionRowHtml(o, sec) {
  const metaField = sec.tiers
    ? `<label class="mini-field">Medidas (pulgadas)<input class="input" data-opt-meta="diameters" value="${escapeHtml((o.meta.diameters || []).join(', '))}" placeholder="10, 8, 6" style="width:130px"></label>
       <label class="mini-field">Alto por piso<input class="input" type="number" min="1" max="12" step="0.5" data-opt-meta="height" value="${Number(o.meta.height || 4)}" style="width:90px"></label>
       <span class="mini-field">Porciones<span class="serves-preview">${servesPreview(o.meta)}</span></span>`
    : sec.looks
      ? `<label class="mini-field">Dibujo<select class="select" data-opt-meta="look">${Object.entries(sec.looks).map(([k, v]) => `<option value="${k}"${(o.meta.look || Object.keys(sec.looks)[0]) === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`
      : sec.hex
        ? `<label class="mini-field">Color<input type="color" data-opt-meta="hex" value="${/^#[0-9a-f]{6}$/i.test(o.meta.hex || '') ? o.meta.hex : '#ffffff'}"></label>`
        : '';
  return `<div class="opt-row${o.active ? '' : ' hidden-item'}" data-opt="${o.id}">
    <label class="switch" title="Visible en la web"><input type="checkbox" data-opt-active${o.active ? ' checked' : ''}><span></span></label>
    <label class="mini-field grow">Nombre<input class="input" data-opt-field="label" value="${escapeHtml(o.label)}" maxlength="80"></label>
    ${sec.detail ? `<label class="mini-field grow">${sec.detail}<input class="input" data-opt-field="detail" value="${escapeHtml(o.detail || '')}" maxlength="120"></label>` : ''}
    ${metaField}
    <label class="mini-field">${sec.priceLabel}<div class="money-input"><span>$</span><input class="input" type="number" min="0" step="0.01" data-opt-field="price" value="${Number(o.price)}"></div></label>
    <button class="remove" type="button" data-opt-del aria-label="Eliminar ${escapeHtml(o.label)}"${o.key === 'none' ? ' hidden' : ''}>Eliminar</button>
  </div>`;
}

function servesPreview(meta) {
  const size = { diameters: meta.diameters, height: meta.height };
  const party = servingsFor(size, 'round', 'party');
  return party ? `~${party} fiesta · ~${servingsFor(size, 'round', 'wedding')} boda` : '—';
}

function catBuilderView() {
  return `
    <div class="cat-intro">
      <p>Opciones y precios del <strong>Custom Cake Builder</strong>. Los cambios se guardan solos. <a class="link-arrow" href="builder.html" target="_blank" rel="noopener">Probar el builder →</a></p>
    </div>
    ${OPTION_SECTIONS.map((sec) => {
      const rows = Cat.options.filter((o) => o.grp === sec.grp);
      return `<details class="panel-card opt-section"${sec.grp === 'size' ? ' open' : ''}>
        <summary><h2>${sec.title}</h2><span class="muted">${rows.filter((r) => r.active).length} visibles</span></summary>
        <p class="hint" style="margin:6px 0 14px">${sec.help}</p>
        <div class="opt-rows">${rows.map((o) => optionRowHtml(o, sec)).join('')}</div>
        <form class="add-opt" data-opt-add="${sec.grp}" novalidate>
          <input class="input" name="label" placeholder="Nueva opción" maxlength="80" required aria-label="Nueva opción en ${sec.title}">
          <div class="money-input"><span>$</span><input class="input" name="price" type="number" min="0" step="0.01" value="0" required aria-label="${sec.priceLabel}"></div>
          <button class="btn btn-primary btn-sm" type="submit">Agregar</button>
        </form>
      </details>`;
    }).join('')}`;
}

const optTimers = new Map();
async function saveOption(id, patch) {
  clearTimeout(optTimers.get(id));
  optTimers.set(id, setTimeout(async () => {
    const { error } = await sb.from('builder_options').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('No se pudo guardar el cambio.'); return; }
    saved();
  }, 400));
}

/* ---------- Ajustes ---------- */

function catSettingsView() {
  const lead = Cat.settings.lead_days || { ready: 7, custom: 7 };
  const cafe = Cat.settings.cafe || {};
  const portions = Cat.settings.portions || { party: 14, wedding: 8 };
  const deposit = Cat.settings.deposit || { percent: 50 };
  return `
    <form class="cafe-grid" data-settings novalidate>
      <div class="panel-card">
        <h2>Días de anticipación</h2>
        <p class="muted" style="font-size:14px;margin-top:4px">Con cuántos días mínimo te pueden hacer un pedido.</p>
        <div class="field-row" style="margin-top:16px">
          <div class="field"><label for="s-ready">Pasteles listos</label><input class="input" id="s-ready" name="ready" type="number" min="1" max="60" value="${Number(lead.ready)}" required></div>
          <div class="field"><label for="s-custom">Personalizados y cotizaciones</label><input class="input" id="s-custom" name="custom" type="number" min="1" max="120" value="${Number(lead.custom)}" required></div>
        </div>
        <h2 style="margin-top:24px">Anticipo</h2>
        <div class="field" style="margin-top:12px;max-width:220px"><label for="s-dep">Porcentaje que se cobra para confirmar</label>
          <div class="money-input"><input class="input" id="s-dep" name="deposit" type="number" min="0" max="100" step="1" value="${Number(deposit.percent)}" required style="padding-left:16px"><span style="left:auto;right:14px">%</span></div></div>
        <h2 style="margin-top:24px">Tamaño de las porciones</h2>
        <p class="muted" style="font-size:14px;margin-top:4px">Pulgadas cúbicas por porción. El cliente elige fiesta o boda en el builder.</p>
        <div class="field-row" style="margin-top:12px">
          <div class="field"><label for="s-party">Fiesta</label><input class="input" id="s-party" name="party" type="number" min="1" max="60" step="0.5" value="${Number(portions.party)}" required></div>
          <div class="field"><label for="s-wedding">Boda</label><input class="input" id="s-wedding" name="wedding" type="number" min="1" max="60" step="0.5" value="${Number(portions.wedding)}" required></div>
        </div>
        <h2 style="margin-top:24px">Coffee shop en la página</h2>
        <p class="muted" style="font-size:14px;margin-top:4px">Aparece al final de la página de inicio. Escríbelo en inglés.</p>
        <div class="field" style="margin-top:16px"><label for="s-cname">Nombre</label><input class="input" id="s-cname" name="cname" value="${escapeHtml(cafe.name || '')}" maxlength="80"></div>
        <div class="field"><label for="s-caddr">Dirección</label><textarea class="textarea" id="s-caddr" name="caddr" maxlength="200" style="min-height:70px" placeholder="123 Main St, Your Town">${escapeHtml(cafe.address || '')}</textarea></div>
        <div class="field"><label for="s-chours">Horario</label><textarea class="textarea" id="s-chours" name="chours" maxlength="200" style="min-height:70px" placeholder="Tue–Sun 7am–5pm">${escapeHtml(cafe.hours || '')}</textarea></div>
        <div class="field"><label for="s-cnote">Frase corta</label><input class="input" id="s-cnote" name="cnote" value="${escapeHtml(cafe.note || '')}" maxlength="140"></div>
        <button class="btn btn-primary" type="submit">Guardar ajustes</button>
      </div>
      <aside class="panel-card">
        <h3>Así se ve en la web</h3>
        <p class="hint">La dirección y el horario solo aparecen si los llenas. Con dirección, se muestra un botón "Get directions" que abre Google Maps.</p>
        <a class="link-arrow" href="index.html#cafe" target="_blank" rel="noopener">Ver en la página →</a>
      </aside>
    </form>`;
}

/* ---------- Events ---------- */

function wireCatalog() {
  const panel = $('[data-panel="catalog"]');

  panel.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.catView) { Cat.view = t.dataset.catView; renderCatalog(); }
    if ('prodNew' in t.dataset) openProductEditor(null);
    if (t.dataset.prodEdit) openProductEditor(structuredClone(Cat.products.find((p) => p.id === t.dataset.prodEdit)));
    if (t.dataset.prodMove) { const [id, d] = t.dataset.prodMove.split(':'); moveProduct(id, Number(d)); }
    if ('optDel' in t.dataset) {
      const row = t.closest('[data-opt]');
      const o = Cat.options.find((x) => x.id === row.dataset.opt);
      const left = Cat.options.filter((x) => x.grp === o.grp && x.active && x.id !== o.id);
      if (!left.length) { toast('Debe quedar al menos una opción visible en esta sección.'); return; }
      if (!confirm(`¿Eliminar "${o.label}"? Si solo quieres esconderla por un tiempo, apaga el interruptor.`)) return;
      const { error } = await sb.from('builder_options').delete().eq('id', o.id);
      if (error) { toast('No se pudo eliminar.'); return; }
      Cat.options = Cat.options.filter((x) => x.id !== o.id);
      renderCatalog();
      saved();
    }
  });

  panel.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.prodActive) {
      const { error } = await sb.from('catalog_products').update({ active: t.checked }).eq('id', t.dataset.prodActive);
      if (error) { toast('No se pudo guardar.'); t.checked = !t.checked; return; }
      Cat.products.find((p) => p.id === t.dataset.prodActive).active = t.checked;
      renderCatalog();
      saved();
      return;
    }
    const row = t.closest('[data-opt]');
    if (!row) return;
    const o = Cat.options.find((x) => x.id === row.dataset.opt);
    if ('optActive' in t.dataset) {
      if (!t.checked && !Cat.options.some((x) => x.grp === o.grp && x.active && x.id !== o.id)) {
        t.checked = true;
        toast('Debe quedar al menos una opción visible en esta sección.');
        return;
      }
      o.active = t.checked;
      row.classList.toggle('hidden-item', !t.checked);
      saveOption(o.id, { active: t.checked });
    } else if (t.dataset.optField) {
      const f = t.dataset.optField;
      let v = t.value.trim();
      if (f === 'price') {
        v = priceVal(v);
        if (v === null) { toast('Escribe un precio válido.'); t.value = o.price; return; }
      }
      if (f === 'label' && !v) { toast('El nombre no puede quedar vacío.'); t.value = o.label; return; }
      o[f] = f === 'detail' ? v || null : v;
      saveOption(o.id, { [f]: o[f] });
    } else if (t.dataset.optMeta) {
      const k = t.dataset.optMeta;
      if (k === 'diameters') {
        const d = t.value.split(/[,\s]+/).map(Number).filter((x) => x > 0 && x <= 30).slice(0, 3);
        if (!d.length) { toast('Escribe al menos un diámetro, ej. 8 o 10, 8, 6'); t.value = (o.meta.diameters || []).join(', '); return; }
        o.meta = { ...o.meta, diameters: d, tiers: d.length };
        t.value = d.join(', ');
      } else if (k === 'height') {
        const h = Number(t.value);
        if (!(h > 0 && h <= 12)) { toast('Escribe una altura válida en pulgadas.'); t.value = o.meta.height || 4; return; }
        o.meta = { ...o.meta, height: h };
      } else {
        o.meta = { ...o.meta, [k]: t.value };
      }
      const preview = row.querySelector('.serves-preview');
      if (preview) preview.textContent = servesPreview(o.meta);
      saveOption(o.id, { meta: o.meta });
    }
  });

  panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.matches('[data-opt-add]')) {
      const grp = f.dataset.optAdd;
      const label = f.label.value.trim();
      const price = priceVal(f.price.value);
      if (!label || price === null) { toast('Escribe el nombre y un precio válido.'); return; }
      const sec = OPTION_SECTIONS.find((x) => x.grp === grp);
      const same = Cat.options.filter((o) => o.grp === grp);
      const meta = sec.tiers ? { tiers: 1, diameters: [8], height: 4 } : sec.looks ? { look: Object.keys(sec.looks)[0] } : sec.hex ? { hex: '#ffffff' } : {};
      const { data, error } = await sb.from('builder_options').insert({
        grp, key: uniqueSlug(slugify(label), same.map((o) => o.key)), label, price, meta, active: true,
        sort: Math.max(0, ...same.map((o) => o.sort)) + 1,
      }).select().single();
      if (error) { toast('No se pudo agregar.'); return; }
      Cat.options.push(data);
      renderCatalog();
      const sectionEl = $$('.opt-section', panel).find((d) => d.querySelector(`[data-opt-add="${grp}"]`));
      if (sectionEl) sectionEl.open = true;
      saved();
    }
    if (f.matches('[data-settings]')) {
      if (!f.reportValidity()) return;
      const rows = [
        { key: 'lead_days', value: { ready: Number(f.ready.value), custom: Number(f.custom.value) } },
        { key: 'deposit', value: { percent: Number(f.deposit.value) } },
        { key: 'portions', value: { party: Number(f.party.value), wedding: Number(f.wedding.value) } },
        { key: 'cafe', value: { name: f.cname.value.trim(), address: f.caddr.value.trim(), hours: f.chours.value.trim(), note: f.cnote.value.trim() } },
      ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      const { error } = await sb.from('site_settings').upsert(rows);
      if (error) { toast('No se pudieron guardar los ajustes.'); return; }
      rows.forEach((r) => { Cat.settings[r.key] = r.value; });
      saved();
    }
  });
}
