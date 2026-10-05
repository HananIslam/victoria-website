/*
 * Assessment hand-off.
 *
 * Any <form data-assessment-form> with `name` and `email` inputs becomes a
 * capture point for the Cognitive Equity Assessment. On submit we:
 *   1. validate,
 *   2. ask the assessment app whether this email already has an unfinished
 *      attempt or a saved report,
 *   3. if so, offer "continue / see results / start over" right here,
 *   4. redirect to the app with name, email and the chosen intent in the URL.
 *
 * If the lookup fails for any reason we still redirect; the app re-checks on
 * arrival and will ask the same question itself.
 */
(function () {
  var DEFAULT_ORIGIN = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://localhost:5173'
    : 'https://assessment.victoriaverlezza.com';
  var ORIGIN = String(window.VV_ASSESSMENT_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
  var STATUS_URL = ORIGIN + '/api/assessment-status';
  var LOOKUP_TIMEOUT_MS = 6000;
  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }

  function buildStartUrl(name, email, intent) {
    var url = ORIGIN + '/?name=' + encodeURIComponent(name) + '&email=' + encodeURIComponent(email);
    if (intent) url += '&intent=' + encodeURIComponent(intent);
    return url;
  }

  function go(name, email, intent) {
    window.location.assign(buildStartUrl(name, email, intent));
  }

  function lookup(email) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, LOOKUP_TIMEOUT_MS) : null;
    return fetch(STATUS_URL + '?email=' + encodeURIComponent(email), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (!data || typeof data !== 'object' || !data.status) return null;
      return data;
    }).catch(function () {
      return null;
    }).then(function (result) {
      if (timer) clearTimeout(timer);
      return result;
    });
  }

  /* ---------- Welcome-back dialog ---------- */

  var modal = null;
  var lastFocus = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function ensureModal() {
    if (modal) return modal;
    var root = el('div', 'vv-resume');
    root.hidden = true;
    var backdrop = el('div', 'vv-resume__backdrop');
    var dialog = el('div', 'vv-resume__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'vv-resume-title');
    dialog.setAttribute('aria-describedby', 'vv-resume-body');

    var close = el('button', 'vv-resume__close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    var eyebrow = el('p', 'vv-resume__eyebrow', 'Returning participant');
    var title = el('h2', 'vv-resume__title');
    title.id = 'vv-resume-title';
    var body = el('p', 'vv-resume__body');
    body.id = 'vv-resume-body';
    var email = el('p', 'vv-resume__email');
    var actions = el('div', 'vv-resume__actions');

    dialog.appendChild(close);
    dialog.appendChild(eyebrow);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(email);
    dialog.appendChild(actions);
    root.appendChild(backdrop);
    root.appendChild(dialog);
    document.body.appendChild(root);

    backdrop.addEventListener('click', hideModal);
    close.addEventListener('click', hideModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden) hideModal();
    });

    modal = { root: root, dialog: dialog, title: title, body: body, email: email, actions: actions, close: close };
    return modal;
  }

  function hideModal() {
    if (!modal || modal.root.hidden) return;
    modal.root.hidden = true;
    document.body.classList.remove('is-modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function button(label, kind, onClick) {
    var b = el('button', 'btn vv-resume__btn vv-resume__btn--' + kind, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function showModal(state, name, email, returnFocusTo) {
    var m = ensureModal();
    var hasResults = Boolean(state.results);
    var hasProgress = Boolean(state.progress);
    var progress = state.progress || {};
    var qNum = (Number(progress.questionIndex) || 0) + 1;
    var total = Number(progress.totalQuestions) || 0;
    var where = total ? 'question ' + qNum + ' of ' + total : 'question ' + qNum;

    m.title.textContent = 'Welcome back, ' + name;
    if (hasResults && hasProgress) {
      m.body.textContent = 'This email already has a finished report and an unfinished attempt. Pick up the attempt, read the report, or begin again.';
    } else if (hasResults) {
      m.body.textContent = 'You have already taken this assessment. Read your saved report, or take it again for a fresh read.';
    } else {
      m.body.textContent = 'You left off at ' + where + '. Carry on where you were, or start over.';
    }
    m.email.textContent = email;

    m.actions.innerHTML = '';
    if (hasResults) {
      m.actions.appendChild(button('See my results', 'primary', function () { go(name, email, 'results'); }));
    }
    if (hasProgress) {
      m.actions.appendChild(button(
        hasResults ? 'Continue the unfinished attempt' : 'Continue from ' + where,
        hasResults ? 'secondary' : 'primary',
        function () { go(name, email, 'continue'); }
      ));
    }
    m.actions.appendChild(button(hasResults ? 'Take it again' : 'Start over', 'ghost', function () { go(name, email, 'restart'); }));

    lastFocus = returnFocusTo || document.activeElement;
    m.root.hidden = false;
    document.body.classList.add('is-modal-open');
    var first = m.actions.querySelector('button');
    if (first) first.focus();
  }

  /* ---------- Forms ---------- */

  function fieldError(input) {
    var field = input.closest('.field');
    return field ? field.querySelector('.field-error') : null;
  }

  function setInvalid(input, invalid) {
    var err = fieldError(input);
    if (invalid) {
      input.setAttribute('aria-invalid', 'true');
      if (err) err.classList.add('is-visible');
    } else {
      input.removeAttribute('aria-invalid');
      if (err) err.classList.remove('is-visible');
    }
  }

  function wireForm(form) {
    var nameInput = form.querySelector('input[name="name"]');
    var emailInput = form.querySelector('input[name="email"]');
    // Obscure name on purpose — browsers/password managers autofill `website`/`url`.
    var honeypot = form.querySelector('input[name="vv_hp"]');
    var submit = form.querySelector('button[type="submit"]');
    if (!nameInput || !emailInput || !submit) return;

    var idleHtml = submit.innerHTML;
    var busy = false;
    var busyTimer = null;

    function setBusy(on) {
      busy = on;
      submit.disabled = on;
      form.classList.toggle('is-busy', on);
      submit.innerHTML = on ? 'One moment…' : idleHtml;
      if (busyTimer) { clearTimeout(busyTimer); busyTimer = null; }
      // Never leave the button stuck if lookup/redirect hangs.
      if (on) {
        busyTimer = setTimeout(function () { setBusy(false); }, LOOKUP_TIMEOUT_MS + 1500);
      }
    }

    nameInput.addEventListener('input', function () { setInvalid(nameInput, false); });
    emailInput.addEventListener('input', function () { setInvalid(emailInput, false); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;

      var name = (nameInput.value || '').trim().slice(0, 80);
      var email = normalizeEmail(emailInput.value);
      var ok = true;
      setInvalid(nameInput, !name); if (!name) ok = false;
      var emailBad = !email || !emailOk.test(email);
      setInvalid(emailInput, emailBad); if (emailBad) ok = false;
      if (!ok) { (nameInput.getAttribute('aria-invalid') ? nameInput : emailInput).focus(); return; }

      // Bots fill hidden fields; people don't. Silent no-op (no "stuck" busy state).
      if (honeypot && (honeypot.value || '').trim()) return;

      setBusy(true);
      lookup(email).then(function (state) {
        if (!state) { go(name, email, null); return; }
        if (state.status === 'new') { go(name, email, 'new'); return; }
        setBusy(false);
        showModal(state, name, email, submit);
      });
    });
  }

  function prefillFromUrl() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var name = (params.get('name') || '').trim();
    var email = (params.get('email') || '').trim();
    if (!name && !email) return;
    document.querySelectorAll('form[data-assessment-form]').forEach(function (form) {
      var n = form.querySelector('input[name="name"]');
      var m = form.querySelector('input[name="email"]');
      if (n && name && !n.value) n.value = name;
      if (m && email && !m.value) m.value = email;
    });
    // Arrived back from the app without enough details: put the cursor where it's needed.
    if (params.get('from')) {
      var form = document.querySelector('form[data-assessment-form]');
      if (form) {
        var target = form.querySelector('input[name="name"]');
        if (target && target.value) target = form.querySelector('input[name="email"]');
        if (target && target.value) target = form.querySelector('button[type="submit"]');
        setTimeout(function () { if (target) target.focus(); }, 250);
      }
    }
  }

  document.querySelectorAll('form[data-assessment-form]').forEach(wireForm);
  prefillFromUrl();
})();
