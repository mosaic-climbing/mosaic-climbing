// Mosaic Climbing — events calendar (loaded only on calendar.html).
// Week view: 7-day grid with hourly time axis on desktop, vertical agenda on
// mobile. Fetches /api/events (Worker proxy with 5-min edge cache).
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

  const modal      = document.querySelector('[data-cal-modal]');
  const modalCat   = modal && modal.querySelector('[data-cal-modal-cat]');
  const modalTitle = modal && modal.querySelector('[data-cal-modal-title]');
  const modalWhen  = modal && modal.querySelector('[data-cal-modal-when]');
  const modalInst  = modal && modal.querySelector('[data-cal-modal-instructor]');
  const modalCap   = modal && modal.querySelector('[data-cal-modal-capacity]');
  const modalDesc  = modal && modal.querySelector('[data-cal-modal-desc]');
  const modalCta   = modal && modal.querySelector('[data-cal-modal-cta]');
  const modalClose = modal && modal.querySelector('[data-cal-modal-close]');

  // Time axis bounds — sized from real event range (9am earliest, 9pm latest)
  // with one hour of padding on each side.
  const HOUR_START = 8;
  const HOUR_END   = 22;
  const HOURS      = HOUR_END - HOUR_START;
  const MOBILE_MQ  = window.matchMedia('(max-width: 720px)');

  const STATE = {
    events: [],
    byDay: new Map(),
    weekOffsetDays: 0,   // days from "this week's Sunday"
    updatedAt: null,
  };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function dayIso(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function todayIso() { return dayIso(new Date()); }

  function parseLocal(iso) {
    if (!iso) return null;
    const [date, time = '00:00:00'] = iso.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  }

  function startOfWeek(d) {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setDate(out.getDate() - out.getDay());
    return out;
  }

  function viewWeekStart() {
    const s = startOfWeek(new Date());
    s.setDate(s.getDate() + STATE.weekOffsetDays);
    return s;
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

  function fmtWeekRange(start) {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear  = start.getFullYear() === end.getFullYear();
    const left  = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const right = end.toLocaleDateString('en-US', sameMonth
      ? { day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
    return sameYear ? `${left} – ${right}` : `${left}, ${start.getFullYear()} – ${right}`;
  }

  function categoryLabel(cat) {
    return ({ youth: 'Youth program', workshop: 'Class', member: 'Member event', event: 'Event' })[cat] || 'Event';
  }

  function eventStartHours(ev) {
    // Hours into the day, fractional.
    const t = ev.start.split('T')[1] || '00:00:00';
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
  }
  function eventEndHours(ev) {
    const t = ev.end.split('T')[1] || '00:00:00';
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
  }

  function indexByDay(events) {
    const map = new Map();
    for (const e of events) {
      const startDay = (e.start || '').slice(0, 10);
      if (!startDay) continue;
      if (!map.has(startDay)) map.set(startDay, []);
      map.get(startDay).push(e);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    }
    return map;
  }

  // Lane-pack a day's events for side-by-side overlap rendering.
  // Returns each event annotated with { lane, laneCount } where lane is the
  // 0-based column inside the day, and laneCount is the cluster's width.
  function assignLanes(dayEvents) {
    if (dayEvents.length === 0) return [];
    const annotated = dayEvents.map((e) => ({
      ev: e,
      s: eventStartHours(e),
      e: eventEndHours(e),
      lane: -1,
    }));
    // Find clusters of overlapping events.
    const clusters = [];
    let current = [];
    let clusterEnd = -Infinity;
    for (const a of annotated.sort((x, y) => x.s - y.s)) {
      if (a.s >= clusterEnd) {
        if (current.length) clusters.push(current);
        current = [a];
        clusterEnd = a.e;
      } else {
        current.push(a);
        if (a.e > clusterEnd) clusterEnd = a.e;
      }
    }
    if (current.length) clusters.push(current);

    // For each cluster, greedily assign lanes.
    for (const cluster of clusters) {
      const laneEnds = []; // laneEnds[i] = end time of last event in lane i
      for (const a of cluster) {
        let lane = laneEnds.findIndex((end) => end <= a.s);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(a.e);
        } else {
          laneEnds[lane] = a.e;
        }
        a.lane = lane;
      }
      const laneCount = laneEnds.length;
      for (const a of cluster) a.laneCount = laneCount;
    }
    return annotated;
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = '';
    const weekStart = viewWeekStart();
    if (titleEl) titleEl.textContent = fmtWeekRange(weekStart);

    const today = todayIso();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }

    if (MOBILE_MQ.matches) {
      renderAgenda(days, today);
    } else {
      renderGrid(days, today);
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

  function renderGrid(days, today) {
    grid.dataset.layout = 'week';
    // Time axis column (left)
    const axis = document.createElement('div');
    axis.className = 'cal-axis';
    axis.setAttribute('aria-hidden', 'true');
    for (let h = HOUR_START; h < HOUR_END; h++) {
      const label = document.createElement('span');
      label.className = 'cal-axis__hour';
      label.textContent = hourLabel(h);
      axis.append(label);
    }
    grid.append(axis);

    // Day columns
    for (const d of days) {
      const iso = dayIso(d);
      const isToday = iso === today;
      const col = document.createElement('div');
      col.className = 'cal-day' + (isToday ? ' is-today' : '');
      col.dataset.day = iso;

      const head = document.createElement('div');
      head.className = 'cal-day__head';
      head.innerHTML =
        `<span class="cal-day__dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>` +
        `<span class="cal-day__num">${d.getDate()}</span>`;
      col.append(head);

      const body = document.createElement('div');
      body.className = 'cal-day__body';
      body.style.setProperty('--rows', String(HOURS));
      // Hour gridlines (visual)
      for (let h = 0; h < HOURS; h++) {
        const line = document.createElement('div');
        line.className = 'cal-day__row' + (h === 0 ? ' cal-day__row--first' : '');
        body.append(line);
      }
      // Events
      const dayEvents = STATE.byDay.get(iso) || [];
      const placed = assignLanes(dayEvents);
      for (const a of placed) {
        const chip = buildChip(a.ev, /*compact=*/ false);
        chip.style.top = `${(a.s - HOUR_START) * 100 / HOURS}%`;
        chip.style.height = `${Math.max(0.5, a.e - a.s) * 100 / HOURS}%`;
        chip.style.left = `calc(${(a.lane * 100) / a.laneCount}% + 2px)`;
        chip.style.width = `calc(${100 / a.laneCount}% - 4px)`;
        body.append(chip);
      }
      col.append(body);
      grid.append(col);
    }
  }

  function renderAgenda(days, today) {
    grid.dataset.layout = 'agenda';
    let anyEvents = false;
    for (const d of days) {
      const iso = dayIso(d);
      const isToday = iso === today;
      const dayEvents = STATE.byDay.get(iso) || [];

      const section = document.createElement('section');
      section.className = 'cal-agenda-day' + (isToday ? ' is-today' : '');
      section.dataset.day = iso;

      const head = document.createElement('h3');
      head.className = 'cal-agenda-day__head';
      head.innerHTML =
        `<span class="cal-agenda-day__dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>` +
        ` <span class="cal-agenda-day__num">${d.getDate()}</span>` +
        ` <span class="cal-agenda-day__month">${d.toLocaleDateString('en-US', { month: 'short' })}</span>`;
      section.append(head);

      if (dayEvents.length) {
        anyEvents = true;
        const list = document.createElement('ul');
        list.className = 'cal-agenda-list';
        for (const ev of dayEvents) {
          const li = document.createElement('li');
          li.append(buildChip(ev, /*compact=*/ true));
          list.append(li);
        }
        section.append(list);
      } else {
        const empty = document.createElement('p');
        empty.className = 'cal-agenda-day__empty';
        empty.textContent = '—';
        section.append(empty);
      }

      grid.append(section);
    }
    if (!anyEvents && statusEl) {
      // The agenda is technically rendered but informationally empty; this
      // mirrors the desktop empty-state where you can see all 7 columns sans
      // events.
    }
  }

  function buildChip(ev, compact) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cal-chip cal-chip--${ev.category || 'event'}`
      + (compact ? ' cal-chip--agenda' : ' cal-chip--block');
    btn.dataset.evId = ev.id;
    btn.dataset.evStart = ev.start;
    btn.setAttribute('aria-label', `${ev.title} at ${fmtTime(ev.start)}. Open details.`);

    const time = document.createElement('span');
    time.className = 'cal-chip__time';
    time.textContent = compact ? fmtTimeRange(ev.start, ev.end) : fmtTime(ev.start);
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

  function hourLabel(h) {
    if (h === 0) return '12am';
    if (h === 12) return 'noon';
    if (h < 12) return `${h}am`;
    return `${h - 12}pm`;
  }

  function openEventModal(ev) {
    if (!modal) return;
    if (modalCat)   modalCat.textContent = categoryLabel(ev.category);
    if (modalTitle) modalTitle.textContent = ev.title || 'Untitled event';
    if (modalWhen) {
      const startDay = (ev.start || '').slice(0, 10);
      const endDay = (ev.end || '').slice(0, 10);
      modalWhen.textContent = (startDay === endDay)
        ? `${fmtDateLong(ev.start)} · ${fmtTimeRange(ev.start, ev.end)}`
        : `${fmtDateLong(ev.start)} ${fmtTime(ev.start)} – ${fmtDateLong(ev.end)} ${fmtTime(ev.end)}`;
    }
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

  prevBtn  && prevBtn.addEventListener('click',  () => { STATE.weekOffsetDays -= 7; render(); });
  nextBtn  && nextBtn.addEventListener('click',  () => { STATE.weekOffsetDays += 7; render(); });
  todayBtn && todayBtn.addEventListener('click', () => { STATE.weekOffsetDays = 0; render(); });

  if (modal) {
    modalClose && modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Re-render on viewport flip between desktop and mobile so the layout
  // matches without a manual reload.
  let lastMatches = MOBILE_MQ.matches;
  MOBILE_MQ.addEventListener('change', () => {
    if (MOBILE_MQ.matches !== lastMatches) {
      lastMatches = MOBILE_MQ.matches;
      render();
    }
  });

  // Fetch from the same-origin Worker proxy. 5-min edge cache lives there.
  fetch('/api/events', { cache: 'default' })
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
      console.error('calendar: failed to load /api/events', err);
      if (statusEl) {
        statusEl.textContent = "We can't load the events calendar right now. Try the full Mosaic portal below, or reload the page.";
        statusEl.hidden = false;
      }
      render();
    });
})();
