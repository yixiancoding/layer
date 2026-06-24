(function () {
  'use strict';

  // --- config (read synchronously while currentScript is valid) ---
  var script = document.currentScript;
  var FEEDBACK_URL =
    (script && script.getAttribute('data-feedback-url')) ||
    '/.netlify/functions/submit-feedback';
  var REQUIRE_EMAIL =
    !!script && script.getAttribute('data-require-email') === 'true';
  var STORE_KEY = 'layer.visitor';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveStore(patch) {
    var next = Object.assign(loadStore(), patch);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  function captureContext() {
    var title = (document.title || '').trim();
    var headings = Array.prototype.slice.call(
      document.querySelectorAll('h1,h2,h3,h4,h5,h6')
    );
    var current = '';
    for (var i = 0; i < headings.length; i++) {
      var top = headings[i].getBoundingClientRect().top + window.scrollY;
      if (top <= window.scrollY + 4) current = (headings[i].textContent || '').trim();
    }
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    var pct = scrollable > 0
      ? Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)))
      : 0;
    return [title, current, 'scrolled ' + pct + '%'].filter(Boolean).join(' — ');
  }

  function init() {
    var host = document.createElement('div');
    host.id = 'layer-feedback-host';
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });

    root.innerHTML =
      '<style>' +
      ':host{--layer-accent:#FB35CF}' +
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      '#fab{position:fixed;right:16px;bottom:16px;width:44px;height:44px;border-radius:50%;border:none;background:var(--layer-accent);color:#fff;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}' +
      '#fab svg{width:22px;height:22px;display:block}' +
      '#fab:focus-visible{outline:2px solid var(--layer-accent);outline-offset:2px}' +
      '#panel{position:fixed;right:16px;bottom:72px;width:320px;max-width:calc(100vw - 32px);background:#fff;color:#111827;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 12px 30px rgba(0,0,0,.18);overflow:hidden}' +
      '#panel[hidden]{display:none}' +
      '#bar{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--layer-accent);color:#fff;cursor:move;user-select:none;font-size:13px;font-weight:600}' +
      '#min{background:transparent;border:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 4px}' +
      '#form{padding:12px;display:flex;flex-direction:column;gap:8px}' +
      'label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}' +
      'input,textarea{font:inherit;font-size:13px;font-weight:400;padding:8px;border:1px solid #d1d5db;border-radius:6px;width:100%;color:#111827;background:#fff}' +
      'input:focus,textarea:focus{outline:none;border-color:var(--layer-accent)}' +
      'textarea{resize:vertical}' +
      '.err{color:#b91c1c;font-size:11px}' +
      '.err:empty{display:none}' +
      '#send{margin-top:4px;background:var(--layer-accent);color:#fff;border:none;border-radius:6px;padding:9px;font-size:13px;font-weight:600;cursor:pointer}' +
      '#send:disabled{opacity:.6;cursor:default}' +
      '#status{font-size:12px;min-height:16px}' +
      '#status.ok{color:#166534}#status.bad{color:#b91c1c}' +
      '</style>' +
      '<button id="fab" aria-label="Leave feedback" title="Leave feedback">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '</button>' +
      '<section id="panel" role="dialog" aria-label="Leave feedback" hidden>' +
      '<header id="bar"><span>Leave feedback</span><button id="min" type="button" aria-label="Minimize">–</button></header>' +
      '<form id="form" novalidate>' +
      '<label>Name<input id="name" type="text" autocomplete="name" aria-describedby="err-name"></label>' +
      '<div class="err" id="err-name"></div>' +
      '<label>Email' + (REQUIRE_EMAIL ? '' : ' (optional)') + '<input id="email" type="email" autocomplete="email" aria-describedby="err-email"></label>' +
      '<div class="err" id="err-email"></div>' +
      '<label>Comment<textarea id="comment" rows="4" aria-describedby="err-comment"></textarea></label>' +
      '<div class="err" id="err-comment"></div>' +
      '<button id="send" type="submit">Send</button>' +
      '<div id="status" role="status"></div>' +
      '</form></section>';

    var fab = root.getElementById('fab');
    var panel = root.getElementById('panel');
    var bar = root.getElementById('bar');
    var min = root.getElementById('min');
    var form = root.getElementById('form');
    var nameEl = root.getElementById('name');
    var emailEl = root.getElementById('email');
    var commentEl = root.getElementById('comment');
    var send = root.getElementById('send');
    var statusEl = root.getElementById('status');
    var errName = root.getElementById('err-name');
    var errEmail = root.getElementById('err-email');
    var errComment = root.getElementById('err-comment');

    function restorePosition(pos) {
      if (!pos) return;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = pos.x + 'px';
      panel.style.top = pos.y + 'px';
    }

    function openPanel() {
      var s = loadStore();
      if (s.name) nameEl.value = s.name;
      if (s.email) emailEl.value = s.email;
      restorePosition(s.pos);
      panel.hidden = false;
      nameEl.focus();
    }
    function closePanel() { panel.hidden = true; }

    fab.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });
    min.addEventListener('click', closePanel);

    // --- drag by header ---
    var drag = null;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target === min) return;
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    });
    bar.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var w = panel.offsetWidth, h = panel.offsetHeight;
      var x = Math.max(0, Math.min(e.clientX - drag.dx, window.innerWidth - w));
      var y = Math.max(0, Math.min(e.clientY - drag.dy, window.innerHeight - h));
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
    });
    bar.addEventListener('pointerup', function () {
      if (!drag) return;
      drag = null;
      var r = panel.getBoundingClientRect();
      saveStore({ pos: { x: r.left, y: r.top } });
    });
    bar.addEventListener('pointercancel', function () { drag = null; });

    function setErr(el, msg) { el.textContent = msg || ''; }

    function validateClient() {
      var ok = true;
      setErr(errName, ''); setErr(errEmail, ''); setErr(errComment, '');
      if (!nameEl.value.trim()) { setErr(errName, 'Name is required.'); ok = false; }
      var email = emailEl.value.trim();
      if (REQUIRE_EMAIL && !email) { setErr(errEmail, 'Email is required.'); ok = false; }
      if (email && !EMAIL_RE.test(email)) { setErr(errEmail, 'Email is not valid.'); ok = false; }
      if (!commentEl.value.trim()) { setErr(errComment, 'Comment is required.'); ok = false; }
      return ok;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      statusEl.textContent = ''; statusEl.className = '';
      if (!validateClient()) return;

      var payload = {
        name: nameEl.value.trim(),
        email: emailEl.value.trim(),
        comment: commentEl.value.trim(),
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        context: captureContext()
      };

      var label = send.textContent;
      send.disabled = true; send.textContent = 'Sending…';

      fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('bad status ' + res.status);
        saveStore({ name: payload.name, email: payload.email });
        commentEl.value = '';
        statusEl.textContent = 'Sent ✓'; statusEl.className = 'ok';
        setTimeout(function () {
          if (statusEl.className === 'ok') { statusEl.textContent = ''; statusEl.className = ''; }
        }, 2000);
      }).catch(function () {
        statusEl.textContent = 'Could not send. Please try again.';
        statusEl.className = 'bad';
      }).finally(function () {
        send.disabled = false; send.textContent = label;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
