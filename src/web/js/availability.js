/* the baker's availability, shown to customers.
   attachDatePicker() swaps a date input for a month view that greys out days that are too soon
   and marks the days the baker blocked in the admin portal. The input keeps the chosen value for the form. */

const Availability = {
  blocked: new Set(),
  status: 'idle', // idle | loading | ready | error
  promise: null,
  load(force = false) {
    if (this.promise && !force) return this.promise;
    if (!sb) { this.status = 'error'; return Promise.resolve(); }
    this.status = 'loading';
    this.promise = sb.rpc('public_blocked_days', { p_from: minDate(0), p_to: minDate(400) }).then(({ data, error }) => {
      if (error) { this.status = 'error'; return; }
      this.blocked = new Set(data);
      this.status = 'ready';
    }).finally(() => document.dispatchEvent(new CustomEvent('availability:change')));
    return this.promise;
  },
};

function attachDatePicker(input, leadDays, onPick = () => {}) {
  const min = minDate(leadDays);
  const label = input.form.querySelector(`label[for="${input.id}"]`);
  if (label) label.id ||= `${input.id}-label`;
  input.type = 'hidden';
  input.removeAttribute('min');

  const root = document.createElement('div');
  root.className = 'avail';
  root.setAttribute('role', 'group');
  if (label) root.setAttribute('aria-labelledby', label.id);
  input.after(root);

  const minMonth = new Date(`${min}T12:00`);
  minMonth.setDate(1);
  let month = new Date(`${input.value || min}T12:00`);
  month.setDate(1);
  let showError = false;

  const isOpen = (day) => day >= min && !Availability.blocked.has(day);
  const longDate = (day) => new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const earliest = () => {
    const d = new Date(`${min}T12:00`);
    for (let i = 0; i < 400; i++, d.setDate(d.getDate() + 1)) {
      const day = ymdLocal(d);
      if (isOpen(day)) return day;
    }
    return null;
  };

  const render = () => {
    if (input.value && !isOpen(input.value)) { input.value = ''; onPick(''); }
    const first = new Date(month);
    const monthsAhead = (month.getFullYear() - minMonth.getFullYear()) * 12 + month.getMonth() - minMonth.getMonth();
    let cells = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => `<span class="avail-dow" aria-hidden="true">${d}</span>`).join('');
    cells += '<span></span>'.repeat(first.getDay());
    const d = new Date(first);
    while (d.getMonth() === first.getMonth()) {
      const day = ymdLocal(d);
      const booked = day >= min && Availability.blocked.has(day);
      const soon = day < min;
      const state = soon ? 'is-soon' : booked ? 'is-booked' : 'is-open';
      const note = soon ? 'too soon' : booked ? 'the baker is not available' : 'available';
      cells += `<button type="button" class="avail-day ${state}${day === input.value ? ' is-picked' : ''}" data-pick="${day}"
        ${soon || booked ? 'disabled' : ''} aria-pressed="${day === input.value}" aria-label="${escapeHtml(longDate(day))}, ${note}">${d.getDate()}</button>`;
      d.setDate(d.getDate() + 1);
    }
    const next = earliest();
    const status = Availability.status === 'loading' ? "Checking the baker's calendar…"
      : Availability.status === 'error' ? "We couldn't load the baker's calendar right now — they'll confirm your date by email."
      : input.value ? `<strong>${escapeHtml(longDate(input.value))}</strong>`
      : next ? `Earliest available: ${escapeHtml(longDate(next))}` : 'No open dates right now.';
    root.innerHTML = `
      <div class="avail-head">
        <button type="button" data-step="-1" aria-label="Previous month"${monthsAhead <= 0 ? ' disabled' : ''}>‹</button>
        <strong>${escapeHtml(month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</strong>
        <button type="button" data-step="1" aria-label="Next month"${monthsAhead >= 12 ? ' disabled' : ''}>›</button>
      </div>
      <div class="avail-grid">${cells}</div>
      <div class="avail-legend" aria-hidden="true">
        <span><i class="is-open"></i>Available</span><span><i class="is-booked"></i>Not available</span><span><i class="is-soon"></i>Less than ${leadDays} days away</span>
      </div>
      <p class="avail-status" aria-live="polite">${status}</p>
      ${showError && !input.value ? '<div class="error-msg" role="alert">Please choose a date on the calendar.</div>' : ''}`;
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.step) month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.step), 1);
    if (b.dataset.pick) { input.value = b.dataset.pick; showError = false; onPick(input.value); }
    render();
    root.querySelector(b.dataset.pick ? `[data-pick="${b.dataset.pick}"]` : `[data-step="${b.dataset.step}"]`)?.focus();
  });

  // Runs before the page's own submit handler: no date means no submit.
  input.form.addEventListener('submit', (e) => {
    if (input.value) return;
    showError = true;
    render();
    if (input.form.checkValidity()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      root.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, true);

  document.addEventListener('availability:change', () => { if (root.isConnected) render(); });
  render();
  Availability.load();
}

function ymdLocal(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
