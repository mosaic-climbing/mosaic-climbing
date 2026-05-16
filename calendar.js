// Mosaic Climbing — events calendar (loaded only on calendar.html).
// Fetches /events.json, renders a month grid, opens a <dialog> with details on click.
(function () {
  'use strict';

  const root = document.querySelector('[data-cal-app]');
  if (!root) return;

  const grid       = root.querySelector('[data-cal-grid]');
  const titleEl    = root.querySelector('[data-cal-title]');
  const prevBtn    = root.querySelector('[data-cal-prev]');
  const nextBtn    = root.querySelector('[data-cal-next]');
  const todayBtn   = root.querySelector('[data-cal-today]');
  const statusEl   = root.querySelector('[data-cal-status]');
  const metaEl     = root.querySelector('[data-cal-meta]');
  const daypane    = root.querySelector('[data-cal-daypane]');
  const dpTitle    = root.querySelector('[data-cal-daypane-title]');
  const dpList     = root.querySelector('[data-cal-daypane-list]');
  const dpCloseBtn = root.querySelector('[data-cal-daypane-close]');

  const modal      = document.querySelector('[data-cal-modal]');
  const modalCat   = modal && modal.querySelector('[data-cal-modal-cat]');
  const modalTitle = modal && modal.querySelector('[data-cal-modal-title]');
  const modalWhen  = modal && modal.querySelector('[data-cal-modal-when]');
  const modalInst  = modal && modal.querySelector('[data-cal-modal-instructor]');
  const modalCap   = modal && modal.querySelector('[data-cal-modal-capacity]');
  const modalDesc  = modal && modal.querySelector('[data-cal-modal-desc]');
  const modalCta   = modal && modal.querySelector('[data-cal-modal-cta]');
  const modalClose = modal && modal.querySelector('[data-cal-modal-close]');

  const STATE = { events: [], updatedAt: null, monthOffset: 0, byDay: new Map() };
  const MOBILE_MQ = window.matchMedia('(max-width: 720px)');
  const MAX_CHIPS_PER_CELL = 3;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function dayIso(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function todayIso() { return dayIso(new Date()); }

  function parseLocal(iso) {
    // Parse "YYYY-MM-DDTHH:MM:SS" without timezone shift.
    if (!iso) return null;
    const [date, time = '00:00:00'] = iso.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  }

  function fmtTime(iso) {
    const dt = parseLocal(iso);
    if (!dt) return '';
    let h = dt.getHours();
    const m = dt.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12;
    if (h === 0) h = 12;
    return m === 0 ? `${h}${ampm}` : `${h}:${pad2(m)}${ampm}`;
  }

  function fmtTimeRange(start, end) {
    const s = fmtTime(start);
    const e = fmtTime(end);
    if (!e || s === e) return s;
    return `${s} – ${e}`;
  }

  function fmtDateLong(iso) {
    const dt = parseLocal(iso);
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  function fmtDateShort(iso) {
    const dt = parseLocal(iso);
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }

  function fmtMonthTitle(d) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function describeWhen(event) {
    const startDay = (event.start || '').slice(0, 10);
    const endDay = (event.end || '').slice(0, 10);
    if (event.allDay) {
      if (!endDay || startDay === endDay) return fmtDateLong(event.start);
      return `${fmtDateLong(event.start)} – ${fmtDateLong(event.end)}`;
    }
    if (startDay === endDay) {
      return `${fmtDateLong(event.start)} · ${fmtTimeRange(event.start, event.end)}`;
    }
    return `${fmtDateLong(event.start)} ${fmtTime(event.start)} – ${fmtDateLong(event.end)} ${fmtTime(event.end)}`;
  }

  function categoryLabel(cat) {
    return ({ youth: 'Youth program', workshop: 'Class', member: 'Member event', event: 'Event' })[cat] || 'Event';
  }

  function indexByDay(events) {
    const map = new Map();
    for (const e of events) {
      const startDay = (e.start || '').slice(0, 10);
      const endDay = (e.end || '').slice(0, 10) || startDay;
      if (!startDay) continue;
      // Walk every day the event covers (usually just one).
      const start = parseLocal(startDay);
      const end = parseLocal(endDay);
      if (!start || !end) continue;
      const cur = new Date(start);
      while (cur <= end) {
        const k = dayIso(cur);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(e);
        cur.setDate(cur.getDate() + 1);
      }
    }
    // Sort each day chronologically.
    for (const list of map.values()) {
      list.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    }
    return map;
  }

  function viewMonth() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth() + STATE.monthOffset, 1);
  }

  function render() {
    if (!grid) return;
    const month = viewMonth();
    const m = month.getMonth();
    const y = month.getFullYear();
    if (titleEl) titleEl.textContent = fmtMonthTitle(month);

    // First day of grid = Sunday on/before the 1st.
    const start = new Date(y, m, 1);
    start.setDate(1 - start.getDay());

    const today = todayIso();
    grid.innerHTML = '';

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = dayIso(d);
      const outside = d.getMonth() !== m;
      const isToday = iso === today;
      const evs = STATE.byDay.get(iso) || [];

      const cell = document.createElement('div');
      cell.className = 'cal-cell'
        + (outside ? ' is-outside' : '')
        + (isToday ? ' is-today' : '')
        + (evs.length ? ' has-events' : '');
      cell.dataset.day = iso;
      cell.setAttribute('role', 'gridcell');

      const dateLabel = document.createElement('span');
      dateLabel.className = 'cal-date';
      dateLabel.textContent = d.getDate();
      dateLabel.setAttribute('aria-label', d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }));
      cell.append(dateLabel);

      if (evs.length) {
        const chips = document.createElement('div');
        chips.className = 'cal-chips';
        const max = MAX_CHIPS_PER_CELL;
        const visible = evs.slice(0, max);
        for (const ev of visible) chips.append(buildChip(ev));
        if (evs.length > max) {
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'cal-more';
          more.textContent = `+${evs.length - max} more`;
          more.addEventListener('click', (e) => {
            e.stopPropagation();
            openDayPane(iso, evs);
          });
          chips.append(more);
        }
        cell.append(chips);

        // Whole-cell tap on mobile (or clicking blank space on desktop).
        cell.addEventListener('click', (e) => {
          if (e.target !== cell && !e.target.classList.contains('cal-chips') && !e.target.classList.contains('cal-date')) return;
          openDayPane(iso, evs);
        });
        // On mobile, the chips themselves are too small to tap precisely; let
        // any tap on the cell open the day pane.
        if (MOBILE_MQ.matches) {
          cell.addEventListener('click', () => openDayPane(iso, evs));
        }
      }

      grid.append(cell);
    }

    if (statusEl) statusEl.hidden = true;

    if (metaEl) {
      if (STATE.updatedAt) {
        const dt = new Date(STATE.updatedAt);
        const when = dt.toLocaleString('en-US', {
          month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        });
        metaEl.textContent = `Calendar updated ${when}. Registration runs through portal.mosaicclimbing.com.`;
      } else {
        metaEl.textContent = 'Registration runs through portal.mosaicclimbing.com.';
      }
    }
  }

  function buildChip(ev) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cal-chip cal-chip--${ev.category || 'event'}`;
    btn.dataset.evId = ev.id;
    btn.dataset.evStart = ev.start;
    btn.title = `${ev.title} · ${fmtTime(ev.start)}`;
    btn.setAttribute('aria-label', `${ev.title} at ${fmtTime(ev.start)}. Open details.`);

    const time = document.createElement('span');
    time.className = 'cal-chip__time';
    time.textContent = fmtTime(ev.start);
    btn.append(time);

    const title = document.createElement('span');
    title.className = 'cal-chip__title';
    title.textContent = ev.title || 'Untitled event';
    btn.append(title);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEventModal(ev);
    });
    return btn;
  }

  function openDayPane(iso, events) {
    if (!daypane) return;
    if (dpTitle) dpTitle.textContent = fmtDateShort(iso);
    if (dpList) {
      dpList.innerHTML = '';
      for (const ev of events) {
        const li = document.createElement('li');
        li.append(buildChip(ev));
        dpList.append(li);
      }
    }
    daypane.hidden = false;
    daypane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeDayPane() {
    if (daypane) daypane.hidden = true;
  }

  function openEventModal(ev) {
    if (!modal) return;
    closeDayPane();
    if (modalCat)   modalCat.textContent = categoryLabel(ev.category);
    if (modalTitle) modalTitle.textContent = ev.title || 'Untitled event';
    if (modalWhen)  modalWhen.textContent = describeWhen(ev);

    if (modalInst) {
      if (ev.instructorText) {
        modalInst.textContent = ev.instructorText;
        modalInst.hidden = false;
      } else {
        modalInst.hidden = true;
      }
    }
    if (modalCap) {
      if (ev.capacityText) {
        modalCap.textContent = ev.capacityText;
        modalCap.hidden = false;
      } else {
        modalCap.hidden = true;
      }
    }
    if (modalDesc) {
      modalDesc.innerHTML = '';
      const paragraphs = (ev.description || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (paragraphs.length === 0) {
        modalDesc.append(document.createElement('p'));
      } else {
        for (const text of paragraphs) {
          const p = document.createElement('p');
          p.textContent = text;
          modalDesc.append(p);
        }
      }
    }
    if (modalCta) {
      modalCta.href = ev.url || 'https://portal.mosaicclimbing.com/mos/n/calendar';
      modalCta.textContent = ev.cta || 'Register';
    }
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
  }

  function closeModal() {
    if (!modal) return;
    if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
  }

  // Wire toolbar
  prevBtn  && prevBtn.addEventListener('click',  () => { STATE.monthOffset--; render(); });
  nextBtn  && nextBtn.addEventListener('click',  () => { STATE.monthOffset++; render(); });
  todayBtn && todayBtn.addEventListener('click', () => { STATE.monthOffset = 0; render(); });
  dpCloseBtn && dpCloseBtn.addEventListener('click', closeDayPane);

  // Modal close handlers
  if (modal) {
    modalClose && modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      // Click on the backdrop (the dialog itself, not the panel) closes.
      if (e.target === modal) closeModal();
    });
    modal.addEventListener('cancel', () => { /* Escape — let it close */ });
  }

  // Keyboard: left/right on toolbar already work; add Home for today.
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.key === 'Home' && e.shiftKey) {
      STATE.monthOffset = 0; render();
    }
  });

  // Load events.json. Cache-bust via the meta updatedAt so a refreshed file
  // is picked up promptly even with the immutable Cache-Control header.
  fetch('events.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((payload) => {
      STATE.events = Array.isArray(payload.events) ? payload.events : [];
      STATE.updatedAt = payload.meta && payload.meta.updatedAt;
      STATE.byDay = indexByDay(STATE.events);
      render();
    })
    .catch((err) => {
      console.error('calendar: failed to load events.json', err);
      if (statusEl) {
        statusEl.textContent = "We can't load the events calendar right now. Try the full Mosaic portal below, or reload the page.";
        statusEl.hidden = false;
      }
      // Still render an empty grid so users get the month nav.
      render();
    });
})();
