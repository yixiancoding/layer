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
      '#screenshot-btn{background:transparent;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;text-align:left;width:100%}' +
      '#screenshot-btn:hover{border-color:var(--layer-accent);color:var(--layer-accent)}' +
      '#screenshot-btn:disabled{opacity:.5;cursor:default}' +
      '#screenshot-preview{display:flex;align-items:center;gap:8px;font-size:11px;color:#374151}' +
      '#screenshot-preview[hidden]{display:none}' +
      '#screenshot-thumb{width:48px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb}' +
      '#screenshot-remove{background:transparent;border:none;color:#6b7280;cursor:pointer;padding:0;font-size:11px;text-decoration:underline}' +
      '#screenshot-remove:hover{color:#b91c1c}' +
      '#annotator-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;flex-direction:column;align-items:stretch}' +
      '#annotator-overlay[hidden]{display:none}' +
      '#annotator-toolbar{display:flex;gap:6px;padding:8px 12px;background:#1f2937;flex-wrap:wrap;align-items:center}' +
      '.ann-tool{background:#374151;border:1px solid #4b5563;color:#f9fafb;border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}' +
      '.ann-tool.active{background:var(--layer-accent);border-color:var(--layer-accent);color:#fff}' +
      '.ann-tool:hover:not(.active){background:#4b5563}' +
      '#ann-spacer{flex:1}' +
      '#ann-cancel{background:#374151;border:1px solid #6b7280;color:#f9fafb;border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}' +
      '#ann-attach{background:var(--layer-accent);border:none;color:#fff;border-radius:5px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer}' +
      '#ann-canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px}' +
      '#ann-canvas{cursor:crosshair;touch-action:none;display:block;max-width:100%;max-height:100%}' +
      '#ann-text-input{position:fixed;background:rgba(0,0,0,.7);border:none;border-bottom:2px solid var(--layer-accent);color:#fff;font-size:14px;padding:2px 4px;outline:none;min-width:120px}' +
      '#upload-sheet{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center}' +
      '#upload-sheet[hidden]{display:none}' +
      '#upload-card{background:#fff;border-radius:12px;padding:24px;max-width:300px;width:90%;display:flex;flex-direction:column;gap:16px;text-align:center}' +
      '#upload-card h3{margin:0;font-size:15px;font-weight:700;color:#111827}' +
      '#upload-card p{margin:0;font-size:13px;color:#374151}' +
      '#upload-card .hint{font-weight:700;font-size:14px;color:var(--layer-accent)}' +
      '#choose-file-btn{background:var(--layer-accent);color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer}' +
      '#upload-cancel-btn{background:transparent;border:none;color:#6b7280;font-size:12px;cursor:pointer;text-decoration:underline}' +
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
      '<button id="screenshot-btn" type="button">📷 Add screenshot</button>' +
      '<div id="screenshot-preview" hidden>' +
      '<img id="screenshot-thumb" src="" alt="Screenshot preview">' +
      '<span>Screenshot attached ✓ · <button id="screenshot-remove" type="button">Remove</button></span>' +
      '</div>' +
      '<button id="send" type="submit">Send</button>' +
      '<div id="status" role="status"></div>' +
      '</form></section>' +
      '<div id="annotator-overlay" hidden>' +
      '<div id="annotator-toolbar">' +
      '<button class="ann-tool active" data-tool="box">Box</button>' +
      '<button class="ann-tool" data-tool="arrow">Arrow</button>' +
      '<button class="ann-tool" data-tool="draw">Freehand</button>' +
      '<button class="ann-tool" data-tool="text">Text</button>' +
      '<button class="ann-tool" id="ann-undo">Undo</button>' +
      '<button class="ann-tool" id="ann-clear">Clear</button>' +
      '<span id="ann-spacer"></span>' +
      '<button id="ann-cancel">Cancel</button>' +
      '<button id="ann-attach">Attach</button>' +
      '</div>' +
      '<div id="ann-canvas-wrap"><canvas id="ann-canvas"></canvas></div>' +
      '</div>' +
      '<div id="upload-sheet" hidden>' +
      '<div id="upload-card">' +
      '<h3>Add a screenshot</h3>' +
      '<p>Take a screenshot now:</p>' +
      '<p class="hint" id="upload-hint"></p>' +
      '<p>It saves to your Photos.</p>' +
      '<p>Then attach it below.</p>' +
      '<button id="choose-file-btn">Choose screenshot</button>' +
      '<input id="upload-file-input" type="file" accept="image/*" style="display:none">' +
      '<button id="upload-cancel-btn">Cancel</button>' +
      '</div>' +
      '</div>';

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
    var screenshotBtn = root.getElementById('screenshot-btn');
    var screenshotPreview = root.getElementById('screenshot-preview');
    var screenshotThumb = root.getElementById('screenshot-thumb');
    var screenshotRemove = root.getElementById('screenshot-remove');
    var heldScreenshot = null;

    // read config
    var SCREENSHOTS_ENABLED = !script || script.getAttribute('data-screenshots') !== 'false';
    if (!SCREENSHOTS_ENABLED) screenshotBtn.hidden = true;

    function setHeldScreenshot(dataUrl) {
      heldScreenshot = dataUrl;
      if (dataUrl) {
        screenshotThumb.src = dataUrl;
        screenshotPreview.hidden = false;
        screenshotBtn.hidden = true;
      } else {
        screenshotThumb.src = '';
        screenshotPreview.hidden = true;
        screenshotBtn.hidden = !SCREENSHOTS_ENABLED;
      }
    }

    var annOverlay = root.getElementById('annotator-overlay');
    var annCanvas = root.getElementById('ann-canvas');
    var annCancel = root.getElementById('ann-cancel');
    var annAttach = root.getElementById('ann-attach');
    var annUndo = root.getElementById('ann-undo');
    var annClear = root.getElementById('ann-clear');

    var ACCENT = '#FB35CF';
    var MAX_LONG_EDGE = 1600;

    function capScale(nw, nh) {
      var maxE = Math.max(nw, nh);
      return maxE > MAX_LONG_EDGE ? MAX_LONG_EDGE / maxE : 1;
    }

    function drawShapes(ctx, shapes, cw, ch) {
      ctx.strokeStyle = ACCENT;
      ctx.fillStyle = ACCENT;
      ctx.lineWidth = 2;
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        if (s.type === 'box') {
          ctx.beginPath();
          ctx.rect(s.x * cw, s.y * ch, s.w * cw, s.h * ch);
          ctx.stroke();
        } else if (s.type === 'arrow') {
          var x1 = s.x1 * cw, y1 = s.y1 * ch, x2 = s.x2 * cw, y2 = s.y2 * ch;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          var angle = Math.atan2(y2 - y1, x2 - x1);
          var headLen = 10;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath(); ctx.fill();
        } else if (s.type === 'draw') {
          if (!s.points.length) continue;
          ctx.beginPath(); ctx.moveTo(s.points[0][0] * cw, s.points[0][1] * ch);
          for (var j = 1; j < s.points.length; j++) ctx.lineTo(s.points[j][0] * cw, s.points[j][1] * ch);
          ctx.stroke();
        } else if (s.type === 'text') {
          ctx.font = '14px -apple-system,BlinkMacSystemFont,sans-serif';
          ctx.fillText(s.text, s.x * cw, s.y * ch);
        }
      }
    }

    function openAnnotator(bitmap, nw, nh) {
      return new Promise(function (resolve) {
        var shapes = [];
        var activeTool = 'box';
        var drawing = null;
        var ctx = annCanvas.getContext('2d');

        // fit canvas to viewport
        var wrap = root.getElementById('ann-canvas-wrap');
        var maxW = wrap.clientWidth || window.innerWidth - 24;
        var maxH = wrap.clientHeight || window.innerHeight - 60;
        var scaleToView = Math.min(maxW / nw, maxH / nh, 1);
        annCanvas.width = Math.round(nw * scaleToView);
        annCanvas.height = Math.round(nh * scaleToView);

        function redraw() {
          ctx.drawImage(bitmap, 0, 0, annCanvas.width, annCanvas.height);
          drawShapes(ctx, shapes, annCanvas.width, annCanvas.height);
        }
        redraw();

        annOverlay.hidden = false;
        panel.hidden = true;

        // tool buttons
        var toolBtns = annOverlay.querySelectorAll('[data-tool]');
        for (var i = 0; i < toolBtns.length; i++) {
          (function (btn) {
            btn.onclick = function () {
              activeTool = btn.getAttribute('data-tool');
              for (var k = 0; k < toolBtns.length; k++) toolBtns[k].classList.remove('active');
              btn.classList.add('active');
            };
          })(toolBtns[i]);
        }

        annUndo.onclick = function () {
          shapes.pop(); redraw();
        };
        annClear.onclick = function () {
          shapes = []; redraw();
        };

        function cleanup(resolveWith) {
          annOverlay.hidden = true;
          panel.hidden = false;
          resolve(resolveWith);
        }

        annCancel.onclick = function () { cleanup(null); };

        annAttach.onclick = function () {
          var scale = capScale(nw, nh);
          var outW = Math.round(nw * scale);
          var outH = Math.round(nh * scale);
          var out = document.createElement('canvas');
          out.width = outW; out.height = outH;
          var outCtx = out.getContext('2d');
          outCtx.drawImage(bitmap, 0, 0, outW, outH);
          drawShapes(outCtx, shapes, outW, outH);
          var dataUrl = out.toDataURL('image/jpeg', 0.85);
          cleanup(dataUrl);
        };

        // pointer events for drawing
        annCanvas.addEventListener('pointerdown', function (e) {
          var r = annCanvas.getBoundingClientRect();
          var px = (e.clientX - r.left) / annCanvas.width;
          var py = (e.clientY - r.top) / annCanvas.height;
          if (activeTool === 'text') {
            var inp = document.createElement('input');
            inp.id = 'ann-text-input';
            inp.style.position = 'fixed';
            inp.style.left = (e.clientX) + 'px';
            inp.style.top = (e.clientY - 20) + 'px';
            inp.style.maxWidth = Math.max(120, window.innerWidth - e.clientX - 8) + 'px';
            annOverlay.appendChild(inp);
            setTimeout(function () { inp.focus(); }, 0);
            inp.addEventListener('keydown', function (ke) {
              if (ke.key === 'Enter') inp.blur();
            });
            inp.addEventListener('blur', function () {
              if (inp.value.trim()) shapes.push({ type: 'text', x: px, y: py, text: inp.value.trim() });
              inp.remove();
              redraw();
            });
            return;
          }
          if (activeTool === 'box') {
            drawing = { type: 'box', x: px, y: py, w: 0, h: 0 };
          } else if (activeTool === 'arrow') {
            drawing = { type: 'arrow', x1: px, y1: py, x2: px, y2: py };
          } else if (activeTool === 'draw') {
            drawing = { type: 'draw', points: [[px, py]] };
          }
          try { annCanvas.setPointerCapture(e.pointerId); } catch (err) {}
        });

        annCanvas.addEventListener('pointermove', function (e) {
          if (!drawing) return;
          var r = annCanvas.getBoundingClientRect();
          var px = (e.clientX - r.left) / annCanvas.width;
          var py = (e.clientY - r.top) / annCanvas.height;
          if (drawing.type === 'box') { drawing.w = px - drawing.x; drawing.h = py - drawing.y; }
          else if (drawing.type === 'arrow') { drawing.x2 = px; drawing.y2 = py; }
          else if (drawing.type === 'draw') { drawing.points.push([px, py]); }
          redraw();
          drawShapes(ctx, [drawing], annCanvas.width, annCanvas.height);
        });

        annCanvas.addEventListener('pointerup', function () {
          if (!drawing) return;
          shapes.push(drawing);
          drawing = null;
          redraw();
        });

        annCanvas.addEventListener('pointercancel', function () { drawing = null; redraw(); });
      });
    }

    var uploadSheet = root.getElementById('upload-sheet');
    var uploadHint = root.getElementById('upload-hint');
    var chooseFileBtn = root.getElementById('choose-file-btn');
    var uploadFileInput = root.getElementById('upload-file-input');
    var uploadCancelBtn = root.getElementById('upload-cancel-btn');

    function deviceHint() {
      var ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/.test(ua)) return 'Side button + Volume Up';
      if (/Android/.test(ua)) return 'Power + Volume Down';
      return 'Use your OS screenshot shortcut';
    }

    function toJpegDataUrl(file, callback) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var scale = capScale(img.naturalWidth, img.naturalHeight);
          var c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * scale);
          c.height = Math.round(img.naturalHeight * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          callback(c.toDataURL('image/jpeg', 0.85));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function openUploadSheet() {
      return new Promise(function (resolve) {
        uploadHint.textContent = deviceHint();
        uploadSheet.hidden = false;
        panel.hidden = true;

        function done(result) {
          uploadSheet.hidden = true;
          panel.hidden = false;
          // reset input so the same file can be re-selected
          uploadFileInput.value = '';
          resolve(result);
        }

        uploadCancelBtn.onclick = function () { done(null); };

        chooseFileBtn.onclick = function () { uploadFileInput.click(); };

        uploadFileInput.onchange = function () {
          var file = uploadFileInput.files && uploadFileInput.files[0];
          if (!file) { done(null); return; }
          toJpegDataUrl(file, function (dataUrl) { done(dataUrl); });
        };
      });
    }

    function getScreenshot() {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        return navigator.mediaDevices.getDisplayMedia({
          video: { preferCurrentTab: true },
          preferCurrentTab: true,
        }).then(function (stream) {
          var video = document.createElement('video');
          video.srcObject = stream;
          video.muted = true;
          return video.play().then(function () {
            var nw = video.videoWidth;
            var nh = video.videoHeight;
            host.style.visibility = 'hidden';
            return new Promise(function (resolve) {
              requestAnimationFrame(function () { requestAnimationFrame(resolve); });
            }).then(function () { return createImageBitmap(video); }).then(function (bitmap) {
              stream.getTracks().forEach(function (t) { t.stop(); });
              host.style.visibility = '';
              return openAnnotator(bitmap, nw, nh);
            });
          });
        }).catch(function (err) {
          host.style.visibility = '';
          if (err && err.name === 'NotAllowedError') return null;
          return null;
        });
      }
      // upload path for iOS / unsupported browsers
      return openUploadSheet();
    }

    screenshotBtn.addEventListener('click', function () {
      screenshotBtn.disabled = true;
      getScreenshot().then(function (dataUrl) {
        if (dataUrl) setHeldScreenshot(dataUrl);
      }).catch(function () {
        // user cancelled or unsupported — no-op
      }).finally(function () {
        screenshotBtn.disabled = false;
      });
    });

    screenshotRemove.addEventListener('click', function () {
      setHeldScreenshot(null);
    });

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
      if (heldScreenshot) payload.screenshot = heldScreenshot;
      var screenshotWasSent = !!heldScreenshot;

      var label = send.textContent;
      send.disabled = true; send.textContent = 'Sending…';

      fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.ok ? res.json() : Promise.reject(new Error('bad status ' + res.status));
      }).then(function (data) {
        saveStore({ name: payload.name, email: payload.email });
        commentEl.value = '';
        setHeldScreenshot(null);
        if (screenshotWasSent && data && data.screenshotAttached === false) {
          statusEl.textContent = 'Comment saved — screenshot couldn\'t attach.';
          statusEl.className = 'ok';
        } else {
          statusEl.textContent = 'Sent ✓'; statusEl.className = 'ok';
        }
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
