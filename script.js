// Mosaic Climbing — site script. Minimal, accessible.
(function () {
  'use strict';

  // Mobile nav
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu   = document.querySelector('[data-nav-menu]');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.dataset.open = String(open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false); toggle.focus();
      }
    });
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    const mql = window.matchMedia('(min-width: 900px)');
    mql.addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  // Sticky-header bottom border on scroll
  const head = document.querySelector('.site-head');
  if (head) {
    const onScroll = () => head.classList.toggle('is-scrolled', window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // aria-current on nav
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.nav-list a').forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
    if (href === file || (file === '' && href === 'index.html') || (file === 'index.html' && href === './')) {
      a.setAttribute('aria-current', 'page');
    }
  });

  // Year auto-fill
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  // ---------- Chat / contact widget (auto-injected on every page) ----------
  function buildChatWidget() {
    if (document.querySelector('[data-chat-fab]')) return; // already present

    // Submissions land in info@mosaicclimbing.com via FormSubmit's AJAX endpoint
    const ENDPOINT = 'https://formsubmit.co/ajax/info@mosaicclimbing.com';
    const FALLBACK_EMAIL = 'info@mosaicclimbing.com';

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'chat-fab';
    fab.setAttribute('aria-controls', 'chat-panel');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Open contact chat');
    fab.dataset.chatFab = '';
    fab.innerHTML = `
      <svg class="bubble" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>
      </svg>`;

    const panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.id = 'chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Contact Mosaic Climbing');
    panel.dataset.open = 'false';
    panel.innerHTML = `
      <header>
        <div class="avatar" aria-hidden="true">M</div>
        <div class="who">
          <strong>Mosaic Climbing</strong>
          <span>Usually replies within a day</span>
        </div>
      </header>
      <p class="chat-bubble">Hey — got a question? Drop us a note and we'll get back to you. For group bookings, the <a href="booking.html" style="color: var(--clay); border-bottom: 1px solid var(--clay); text-decoration: none;">booking page</a> has the form with all the details.</p>
      <form class="chat-form" data-chat-form novalidate>
        <div class="field-row">
          <div class="field"><label for="chat-name" style="font-size: var(--t-xs);">Name</label><input class="input" id="chat-name" name="name" type="text" autocomplete="name" required /></div>
          <div class="field"><label for="chat-email" style="font-size: var(--t-xs);">Email</label><input class="input" id="chat-email" name="email" type="email" autocomplete="email" required /></div>
        </div>
        <div class="field"><label for="chat-msg" style="font-size: var(--t-xs);">Your question</label><textarea class="textarea" id="chat-msg" name="msg" required></textarea></div>
        <div class="submit-row">
          <span class="alt">or call <a href="tel:+15137814083">513&middot;781&middot;4083</a></span>
          <button type="submit" class="btn btn-primary">Send</button>
        </div>
      </form>
      <p class="alt mt-3" data-chat-success hidden>Thanks — Nicole will get back to you within a day. For anything urgent, email <a href="mailto:${FALLBACK_EMAIL}">${FALLBACK_EMAIL}</a> or call <a href="tel:+15137814083">513&middot;781&middot;4083</a>.</p>
      <p class="alt mt-3" data-chat-error hidden>Something went wrong sending that. Please email <a href="mailto:${FALLBACK_EMAIL}">${FALLBACK_EMAIL}</a> directly.</p>
    `;

    document.body.append(fab, panel);

    const setOpen = (open) => {
      fab.setAttribute('aria-expanded', String(open));
      panel.dataset.open = String(open);
      fab.setAttribute('aria-label', open ? 'Close contact chat' : 'Open contact chat');
      if (open) {
        const first = panel.querySelector('input, textarea, button');
        if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
      }
    };
    fab.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.dataset.open === 'true') {
        setOpen(false); fab.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (panel.dataset.open !== 'true') return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      setOpen(false);
    });

    const form = panel.querySelector('[data-chat-form]');
    const success = panel.querySelector('[data-chat-success]');
    const errorEl = panel.querySelector('[data-chat-error]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      const msg = (data.get('msg') || '').toString().trim();
      if (!name || !email || !msg) {
        form.querySelectorAll(':invalid').forEach((el) => el.style.borderColor = 'var(--clay)');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
      submitBtn.disabled = true;
      errorEl.hidden = true;

      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            message: msg,
            _subject: `Chat widget — message from ${name}`,
            _template: 'table',
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        form.style.display = 'none';
        success.hidden = false;
      } catch (err) {
        submitBtn.textContent = originalLabel;
        submitBtn.disabled = false;
        errorEl.hidden = false;
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildChatWidget);
  } else {
    buildChatWidget();
  }

  // Lazy-load the LightWidget resizer script when the IG iframe nears viewport
  const igFrame = document.querySelector('iframe.lightwidget-widget');
  if (igFrame && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        const s = document.createElement('script');
        s.src = 'https://cdn.lightwidget.com/widgets/lightwidget.js';
        s.async = true;
        document.body.appendChild(s);
        obs.disconnect();
      }
    }, { rootMargin: '400px' });
    io.observe(igFrame);
  }

  // Lazy-load Flodesk embed when footer signup nears viewport
  const fdContainer = document.getElementById('fd-form-6a03e08e8ccae7375c1b4c77');
  if (fdContainer && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      if (!entries[0].isIntersecting) return;
      (function (w, d, t, h, s, n) {
        w.FlodeskObject = n;
        var fn = function () { (w[n].q = w[n].q || []).push(arguments); };
        w[n] = w[n] || fn;
        var f = d.getElementsByTagName(t)[0];
        var v = '?v=' + Math.floor(new Date().getTime() / (120 * 1000)) * 60;
        var sm = d.createElement(t);
        sm.async = true; sm.type = 'module';
        sm.src = h + s + '.mjs' + v;
        f.parentNode.insertBefore(sm, f);
        var sn = d.createElement(t);
        sn.async = true; sn.noModule = true;
        sn.src = h + s + '.js' + v;
        f.parentNode.insertBefore(sn, f);
      })(window, document, 'script', 'https://assets.flodesk.com', '/universal', 'fd');
      window.fd('form', {
        formId: '6a03e08e8ccae7375c1b4c77',
        containerEl: '#fd-form-6a03e08e8ccae7375c1b4c77',
      });
      obs.disconnect();
    }, { rootMargin: '400px' });
    // Observe the parent column (the embed container itself has 0 height until Flodesk fills it)
    io.observe(fdContainer.parentElement || fdContainer);
  }

  // Smooth-scroll for in-page anchors
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });
})();
