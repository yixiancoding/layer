# Layer Phase 2 — Screenshots & Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in screenshot (with optional annotation) to feedback submissions, stored as an Airtable attachment alongside the comment.

**Architecture:** The widget gains a "Add screenshot" button that dispatches to either the native Screen Capture API (desktop/Android) or a guided upload sheet (iOS/unsupported). Captured images pass through an in-widget annotation canvas (native path only), are downscaled/JPEG-encoded, and sent as a base64 data URL in the existing POST body. The Netlify function creates the Airtable record first (text feedback never lost), then best-effort uploads the image via the Airtable content API.

**Tech Stack:** Vanilla JS (no build step, no dependencies), Shadow DOM, Screen Capture API, `<canvas>`, Pointer Events API, Netlify Functions (Node.js `'use strict'`), Airtable REST + content upload APIs.

## Global Constraints

- `widget/layer.js` is a single hand-authored IIFE — no bundler, no imports, no CDN loads. All new UI lives inside the existing shadow root.
- All new widget code uses `var`, `function`, no arrow functions, no `let/const` — matching Phase 1 style.
- `netlify/functions/lib/parse.js` uses `'use strict'` + CommonJS (`module.exports`).
- `netlify/functions/submit-feedback.js` uses `'use strict'` + CommonJS.
- Tests use `node:test` + `node:assert/strict` (no test framework).
- Accent color is `#FB35CF` (CSS var `--layer-accent`); stroke color in annotator is `#FB35CF`.
- Screenshots are capped at 1600px long edge, encoded as JPEG (~0.85 quality).
- Comment is always saved before screenshot attachment is attempted — screenshot failure must never cause a 4xx/5xx for the submission.
- `data-screenshots="false"` on the `<script>` tag hides the feature entirely.
- The secops hook blocks reading/writing `.env*` files — the user edits `.env` manually; the agent commits `.env.example` only.
- Git remote: `git@github-personal:yixiancoding/layer.git` (SSH alias). Use `git push github-personal layer-phase2`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `netlify/functions/lib/parse.js` | Modify | Add `parseDataUrl()` helper |
| `netlify/functions/submit-feedback.js` | Modify | Read screenshot from body, create record, best-effort attach |
| `test/parse.test.js` | Modify | Tests for `parseDataUrl` |
| `test/handler.test.js` | Modify | Tests for screenshot handler paths |
| `widget/layer.js` | Modify | All widget additions (button, capture, annotator, upload sheet) |
| `.env.example` | Modify | Add `AIRTABLE_SCREENSHOT_FIELD_ID` line |
| `docs/setup.md` | Modify | Document new Airtable column, field id, env var |
| `demo/index.html` | Modify | Mention screenshot button in the demo |

---

## Task 1: `parseDataUrl` — helper + unit tests

**Files:**
- Modify: `netlify/functions/lib/parse.js`
- Modify: `test/parse.test.js`

**Interfaces:**
- Produces: `parseDataUrl(dataUrl: string): {contentType: string, base64: string, filename: string} | null`
  - Returns `null` for: plain string, non-image data URL, disallowed type (anything other than `image/jpeg` or `image/png`), missing base64 marker.
  - `filename` is `"screenshot.jpg"` for `image/jpeg`, `"screenshot.png"` for `image/png`.

- [ ] **Step 1: Write failing tests**

Append to `test/parse.test.js`:

```js
const { parseDataUrl } = require('../netlify/functions/lib/parse');

test('parseDataUrl: valid image/jpeg', () => {
  const result = parseDataUrl('data:image/jpeg;base64,/9j/abc123==');
  assert.deepEqual(result, { contentType: 'image/jpeg', base64: '/9j/abc123==', filename: 'screenshot.jpg' });
});

test('parseDataUrl: valid image/png', () => {
  const result = parseDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(result, { contentType: 'image/png', base64: 'iVBORw0KGgo=', filename: 'screenshot.png' });
});

test('parseDataUrl: plain string returns null', () => {
  assert.equal(parseDataUrl('hello world'), null);
});

test('parseDataUrl: non-image data URL returns null', () => {
  assert.equal(parseDataUrl('data:text/plain;base64,aGVsbG8='), null);
});

test('parseDataUrl: disallowed type (image/gif) returns null', () => {
  assert.equal(parseDataUrl('data:image/gif;base64,R0lGOD'), null);
});

test('parseDataUrl: missing base64 marker returns null', () => {
  assert.equal(parseDataUrl('data:image/jpeg,/9j/abc'), null);
});

test('parseDataUrl: empty string returns null', () => {
  assert.equal(parseDataUrl(''), null);
});

test('parseDataUrl: null input returns null', () => {
  assert.equal(parseDataUrl(null), null);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/isali/projects/layer && node --test test/parse.test.js 2>&1 | tail -20
```

Expected: failures on the `parseDataUrl` tests (function not exported).

- [ ] **Step 3: Implement `parseDataUrl` in `parse.js`**

Add before the `module.exports` line in `netlify/functions/lib/parse.js`:

```js
var ALLOWED_IMAGE_TYPES = { 'image/jpeg': 'screenshot.jpg', 'image/png': 'screenshot.png' };

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  var contentType = m[1];
  var filename = ALLOWED_IMAGE_TYPES[contentType];
  if (!filename) return null;
  return { contentType: contentType, base64: m[2], filename: filename };
}
```

Add `parseDataUrl` to `module.exports`:

```js
module.exports = {
  parseDeployVersion, parsePrototype, parseDevice, parseBrowser, validate, buildFields, parseDataUrl,
};
```

- [ ] **Step 4: Run tests — all must pass**

```bash
node --test test/parse.test.js 2>&1 | tail -10
```

Expected: all pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/parse.js test/parse.test.js
git commit -m "feat: add parseDataUrl helper with unit tests"
```

---

## Task 2: Handler — screenshot attachment + tests

**Files:**
- Modify: `netlify/functions/submit-feedback.js`
- Modify: `test/handler.test.js`

**Interfaces:**
- Consumes: `parseDataUrl` from `./lib/parse` (Task 1)
- Produces: handler now returns `{ ok: true, screenshotAttached: boolean }` on 200.
  - `screenshotAttached: true` only when a screenshot was present, parsed OK, `AIRTABLE_SCREENSHOT_FIELD_ID` is set, and the upload call succeeded.
  - All other cases (no screenshot, missing field id, invalid data URL, upload error/non-2xx): `screenshotAttached: false` and status still 200.

- [ ] **Step 1: Fix the two existing handler tests that will break**

The existing `happy path` test (a) mocks `fetch` with `text: async () => '{}'` but the new handler calls `res.json()`, and (b) asserts `{ ok: true }` but the new handler returns `{ ok: true, screenshotAttached: false }`. Fix both now so they stay green after the handler is updated.

In `test/handler.test.js`, find and update the `happy path` mock and assertion:

```js
// BEFORE:
global.fetch = async (url, opts) => {
  captured = { url, opts };
  return { ok: true, status: 200, text: async () => '{}' };
};
// ...
assert.deepEqual(JSON.parse(res.body), { ok: true });

// AFTER:
global.fetch = async (url, opts) => {
  captured = { url, opts };
  return { ok: true, status: 200, json: async () => ({ id: 'rec1' }), text: async () => '{}' };
};
// ...
assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
```

Run tests to confirm they still pass with the old handler:

```bash
node --test test/handler.test.js 2>&1 | tail -10
```

Expected: all 8 existing tests pass (handler not yet changed — the `json` method is added to the mock but unused; assertion now expects `screenshotAttached:false` which the old handler doesn't return, so this will fail — that's OK, you're about to fix the handler in Step 3).

Actually: run after Step 3 to confirm. Proceed to Step 2.

- [ ] **Step 2: Write failing handler tests for new screenshot paths**

Append to `test/handler.test.js`:

```js
const ENV_WITH_SCREENSHOT = {
  AIRTABLE_API_KEY: 'key123',
  AIRTABLE_BASE_ID: 'appBASE',
  AIRTABLE_TABLE_ID: 'tblTABLE',
  AIRTABLE_SCREENSHOT_FIELD_ID: 'fldSCREEN',
};

function validBodyWithScreenshot() {
  return JSON.stringify({
    name: 'Ada', email: 'ada@example.com', comment: 'Nice',
    pageUrl: 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    userAgent: 'UA', context: 'ctx',
    screenshot: 'data:image/jpeg;base64,/9j/fakebase64==',
  });
}

test('no screenshot: one fetch call, screenshotAttached false', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => { callCount++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec1' }) }; };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 1);
  } finally { global.fetch = savedFetch; }
});

test('screenshot happy path: two fetches, second hits uploadAttachment URL, screenshotAttached true', async () => {
  const calls = [];
  const savedFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec42' }) };
  };
  try {
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: true });
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /content\.airtable\.com/);
    assert.match(calls[1].url, /rec42/);
    assert.match(calls[1].url, /fldSCREEN/);
    assert.match(calls[1].url, /uploadAttachment/);
    assert.match(calls[1].opts.headers['Authorization'], /Bearer key123/);
    const uploadBody = JSON.parse(calls[1].opts.body);
    assert.equal(uploadBody.contentType, 'image/jpeg');
    assert.equal(uploadBody.filename, 'screenshot.jpg');
    assert.ok(uploadBody.file.length > 0);
  } finally { global.fetch = savedFetch; }
});

test('screenshot present but AIRTABLE_SCREENSHOT_FIELD_ID unset: one fetch, screenshotAttached false', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => { callCount++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec1' }) }; };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 1);
  } finally { global.fetch = savedFetch; }
});

test('attachment upload returns non-2xx: record still created, screenshotAttached false, 200', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'recX' }) };
    return { ok: false, status: 422, text: async () => 'error' };
  };
  try {
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 2);
  } finally { global.fetch = savedFetch; }
});

test('attachment upload throws: record still created, screenshotAttached false, 200', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'recX' }) };
    throw new Error('network error');
  };
  try {
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body: validBodyWithScreenshot() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 2);
  } finally { global.fetch = savedFetch; }
});

test('invalid screenshot data URL: one fetch, screenshotAttached false, 200', async () => {
  let callCount = 0;
  const savedFetch = global.fetch;
  global.fetch = async () => { callCount++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rec1' }) }; };
  try {
    const body = JSON.stringify({
      name: 'Ada', comment: 'x',
      pageUrl: 'https://example.com', userAgent: 'UA', context: 'c',
      screenshot: 'not-a-data-url',
    });
    const res = await withEnv(ENV_WITH_SCREENSHOT, () => handler({ httpMethod: 'POST', body }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true, screenshotAttached: false });
    assert.equal(callCount, 1);
  } finally { global.fetch = savedFetch; }
});
```

- [ ] **Step 3: Run tests to confirm new ones fail**

```bash
node --test test/handler.test.js 2>&1 | tail -20
```

Expected: the updated `happy path` and new screenshot tests fail; other existing tests still pass.

- [ ] **Step 4: Update `submit-feedback.js`**

Replace the entire file content:

```js
'use strict';

const { validate, buildFields, parseDataUrl } = require('./lib/parse');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(obj),
  };
}

async function handler(event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (method !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse((event && event.body) || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const errors = validate(body);
  if (errors.length) return json(400, { error: errors.join(' ') });

  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_SCREENSHOT_FIELD_ID } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    console.error('Layer: missing Airtable environment variables');
    return json(500, { error: 'Server is not configured.' });
  }

  const fields = buildFields(body, new Date().toISOString());
  const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

  let recordId;
  try {
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields, typecast: true }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Layer: Airtable error', res.status, detail);
      return json(502, { error: 'Could not save feedback.' });
    }
    const data = await res.json();
    recordId = data && data.id;
  } catch (err) {
    console.error('Layer: Airtable request failed', err);
    return json(502, { error: 'Could not save feedback.' });
  }

  let screenshotAttached = false;
  const parsed = parseDataUrl(body && body.screenshot);
  if (parsed && AIRTABLE_SCREENSHOT_FIELD_ID && recordId) {
    const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${AIRTABLE_SCREENSHOT_FIELD_ID}/uploadAttachment`;
    try {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentType: parsed.contentType, file: parsed.base64, filename: parsed.filename }),
      });
      if (uploadRes.ok) {
        screenshotAttached = true;
      } else {
        const detail = await uploadRes.text();
        console.error('Layer: screenshot upload failed', uploadRes.status, detail);
      }
    } catch (err) {
      console.error('Layer: screenshot upload threw', err);
    }
  }

  return json(200, { ok: true, screenshotAttached });
}

exports.handler = handler;
```

- [ ] **Step 5: Run all tests — all must pass**

```bash
node --test test/handler.test.js test/parse.test.js 2>&1 | tail -15
```

Expected: all pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/submit-feedback.js netlify/functions/lib/parse.js test/handler.test.js test/parse.test.js
git commit -m "feat: handler attaches screenshot to Airtable record (best-effort)"
```

---

## Task 3: Widget scaffold — button, state, thumbnail, submit lifecycle

This task wires up the screenshot UI: adds the button to the panel HTML, reads `data-screenshots`, manages the in-memory screenshot state, shows the thumbnail, and sends the screenshot in the POST body. `getScreenshot()` is stubbed to return `null` (so Send works normally throughout); it will be replaced in Task 4.

**Files:**
- Modify: `widget/layer.js`

**Interfaces:**
- Produces (stubs, replaced in later tasks):
  - `getScreenshot()` — `Promise<string|null>` — returns `null` always in this task
- Produces (final):
  - Screenshot button above Send (`#screenshot-btn`)
  - Thumbnail section (`#screenshot-preview`) with "Screenshot attached ✓ · Remove" when a screenshot is held
  - `heldScreenshot` variable (in-memory, never localStorage)
  - On submit: if `heldScreenshot`, include `screenshot: heldScreenshot` in the POST body
  - On success (`screenshotAttached: true` or no screenshot sent): clear `heldScreenshot`, restore the button
  - On success with `screenshotAttached: false` while a screenshot was sent: clear comment + screenshot but show soft note "Comment saved — screenshot couldn't attach."
  - On failure: preserve `heldScreenshot` so visitor can retry

- [ ] **Step 1: Add screenshot CSS and HTML to the shadow root template**

In `widget/layer.js`, find the `root.innerHTML = ...` assignment. This is one big string — you will extend it.

In the `<style>` section (the string between `'<style>'` and `'</style>'`), append before the closing `</style>`:

```css
#screenshot-btn{background:transparent;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;text-align:left;width:100%}
#screenshot-btn:hover{border-color:var(--layer-accent);color:var(--layer-accent)}
#screenshot-btn:disabled{opacity:.5;cursor:default}
#screenshot-preview{display:flex;align-items:center;gap:8px;font-size:11px;color:#374151}
#screenshot-preview[hidden]{display:none}
#screenshot-thumb{width:48px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb}
#screenshot-remove{background:transparent;border:none;color:#6b7280;cursor:pointer;padding:0;font-size:11px;text-decoration:underline}
#screenshot-remove:hover{color:#b91c1c}
```

In the `<form id="form">` section of the HTML string, insert before `<button id="send"`:

```html
<button id="screenshot-btn" type="button">📷 Add screenshot</button>
<div id="screenshot-preview" hidden>
  <img id="screenshot-thumb" src="" alt="Screenshot preview">
  <span>Screenshot attached ✓ · <button id="screenshot-remove" type="button">Remove</button></span>
</div>
```

- [ ] **Step 2: Wire up config, state, and screenshot controls**

After the existing `var errComment = ...` line, add:

```js
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

function getScreenshot() {
  // stub — replaced in Task 4
  return Promise.resolve(null);
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
```

- [ ] **Step 3: Update submit handler to include screenshot + handle `screenshotAttached` response**

Find the `form.addEventListener('submit', ...)` block. Update the `payload` object and the `.then` handler as follows.

Replace:

```js
      var payload = {
        name: nameEl.value.trim(),
        email: emailEl.value.trim(),
        comment: commentEl.value.trim(),
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        context: captureContext()
      };
```

With:

```js
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
```

Replace the `.then(function (res) { ... })` block with:

```js
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
```

The `.catch` and `.finally` handlers remain unchanged.

- [ ] **Step 4: Manual smoke test — confirm button renders and stub works**

Start `netlify dev` (from the layer repo root) and open `http://localhost:8888/demo/`. Open the feedback panel — confirm the "📷 Add screenshot" button is visible above Send. Click it — it should briefly disable then re-enable (stub returns null). Send a regular comment — it should still work (Sent ✓). If `AIRTABLE_SCREENSHOT_FIELD_ID` is not yet in `.env`, the response will have `screenshotAttached: false` — that's expected.

- [ ] **Step 5: Commit**

```bash
git add widget/layer.js
git commit -m "feat: widget screenshot scaffold — button, state, thumbnail, submit wiring"
```

---

## Task 4: Native capture path + annotator

Replaces the `getScreenshot()` stub with the real dispatcher. Implements:
1. **`getScreenshot()`** — detects `getDisplayMedia` and dispatches to native or upload path (upload path stubs to "not implemented yet" in this task — it returns `null` quietly; Task 5 implements it).
2. **Native capture** — `getDisplayMedia`, hide/show host, draw one frame, pass to `openAnnotator`.
3. **`openAnnotator(imageBitmap, naturalWidth, naturalHeight)`** — full-screen annotation overlay with Box, Arrow, Freehand, Text tools; Undo, Clear, Cancel, Attach.

**Files:**
- Modify: `widget/layer.js`

**Interfaces:**
- Consumes: `host` (the outer `div#layer-feedback-host` element — accessible as `host` in the closure)
- Produces:
  - `getScreenshot(): Promise<string|null>` (replaces stub)
  - `openAnnotator(bitmap, nw, nh): Promise<string|null>`
  - Shape model: `{type:'box'|'arrow'|'draw'|'text', x,y,w,h / x1,y1,x2,y2 / points / text}` — coordinates normalized to `[0,1]` range relative to natural image dimensions.

- [ ] **Step 1: Add annotator CSS to the shadow root `<style>` block**

Append in the `<style>` string (before the closing `</style>`):

```css
#annotator-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;flex-direction:column;align-items:stretch}
#annotator-overlay[hidden]{display:none}
#annotator-toolbar{display:flex;gap:6px;padding:8px 12px;background:#1f2937;flex-wrap:wrap;align-items:center}
.ann-tool{background:#374151;border:1px solid #4b5563;color:#f9fafb;border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}
.ann-tool.active{background:var(--layer-accent);border-color:var(--layer-accent);color:#fff}
.ann-tool:hover:not(.active){background:#4b5563}
#ann-spacer{flex:1}
#ann-cancel{background:#374151;border:1px solid #6b7280;color:#f9fafb;border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}
#ann-attach{background:var(--layer-accent);border:none;color:#fff;border-radius:5px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer}
#ann-canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px}
#ann-canvas{cursor:crosshair;touch-action:none;display:block;max-width:100%;max-height:100%}
#ann-text-input{position:fixed;background:rgba(0,0,0,.7);border:none;border-bottom:2px solid var(--layer-accent);color:#fff;font-size:14px;padding:2px 4px;outline:none;min-width:120px}
```

- [ ] **Step 2: Add annotator HTML to the shadow root**

Inside the `root.innerHTML = ...` string, after `</section>` (the closing tag of the panel), append:

```html
<div id="annotator-overlay" hidden>
  <div id="annotator-toolbar">
    <button class="ann-tool active" data-tool="box">Box</button>
    <button class="ann-tool" data-tool="arrow">Arrow</button>
    <button class="ann-tool" data-tool="draw">Freehand</button>
    <button class="ann-tool" data-tool="text">Text</button>
    <button class="ann-tool" id="ann-undo">Undo</button>
    <button class="ann-tool" id="ann-clear">Clear</button>
    <span id="ann-spacer"></span>
    <button id="ann-cancel">Cancel</button>
    <button id="ann-attach">Attach</button>
  </div>
  <div id="ann-canvas-wrap">
    <canvas id="ann-canvas"></canvas>
  </div>
</div>
```

- [ ] **Step 3: Replace the `getScreenshot()` stub and implement the full capture + annotator logic**

Find the comment `// stub — replaced in Task 4` and the stub `getScreenshot` function. Replace the entire block (from `function getScreenshot()` through the closing `}`) with the following. Add it before the `screenshotBtn.addEventListener` block:

```js
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
            btn.addEventListener('click', function () {
              activeTool = btn.getAttribute('data-tool');
              for (var k = 0; k < toolBtns.length; k++) toolBtns[k].classList.remove('active');
              btn.classList.add('active');
            });
          })(toolBtns[i]);
        }

        annUndo.addEventListener('click', function onUndo() {
          shapes.pop(); redraw();
        });
        annClear.addEventListener('click', function onClear() {
          shapes = []; redraw();
        });

        function cleanup(resolveWith) {
          annOverlay.hidden = true;
          panel.hidden = false;
          annUndo.removeEventListener('click', annUndo._h);
          annClear.removeEventListener('click', annClear._h);
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
            inp.style.left = (e.clientX) + 'px';
            inp.style.top = (e.clientY - 20) + 'px';
            // inp is appended to the shadow root's host or document.body for overlay positioning
            // since we're inside shadow DOM, append to annOverlay
            annOverlay.appendChild(inp);
            inp.focus();
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
            return createImageBitmap(video).then(function (bitmap) {
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
      // upload path — implemented in Task 5
      return Promise.resolve(null);
    }
```

- [ ] **Step 4: Manual test — native capture flow**

Run `netlify dev`. Open `http://localhost:8888/demo/`. Open the feedback panel. Click "📷 Add screenshot". Accept the browser's share prompt. The Layer widget should disappear for the frame grab, then the annotation overlay should appear with the screenshot. Test each tool (Box, Arrow, Freehand, Text), Undo, Clear. Click Attach — the thumbnail should appear in the panel. Send the feedback. Check the Airtable row for an inline Screenshot attachment.

- [ ] **Step 5: Commit**

```bash
git add widget/layer.js
git commit -m "feat: native screenshot capture + annotation overlay"
```

---

## Task 5: Upload path — guided capture sheet

Replaces the `return Promise.resolve(null)` upload-path stub in `getScreenshot()` with the full guided sheet: device-specific hint, file picker, downscale/JPEG encode.

**Files:**
- Modify: `widget/layer.js`

**Interfaces:**
- Consumes: `host` — the outer div, for UA sniffing the device hint
- Produces: `openUploadSheet(): Promise<string|null>` — file picker wrapped in guided overlay; resolves with JPEG data URL or `null` on cancel.

- [ ] **Step 1: Add upload sheet CSS to the `<style>` block**

Append in the `<style>` string:

```css
#upload-sheet{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center}
#upload-sheet[hidden]{display:none}
#upload-card{background:#fff;border-radius:12px;padding:24px;max-width:300px;width:90%;display:flex;flex-direction:column;gap:16px;text-align:center}
#upload-card h3{margin:0;font-size:15px;font-weight:700;color:#111827}
#upload-card p{margin:0;font-size:13px;color:#374151}
#upload-card .hint{font-weight:700;font-size:14px;color:var(--layer-accent)}
#choose-file-btn{background:var(--layer-accent);color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer}
#upload-cancel-btn{background:transparent;border:none;color:#6b7280;font-size:12px;cursor:pointer;text-decoration:underline}
```

- [ ] **Step 2: Add upload sheet HTML to the shadow root (after the annotator overlay)**

In the `root.innerHTML` string, after the `</div>` that closes `#annotator-overlay`, append:

```html
<div id="upload-sheet" hidden>
  <div id="upload-card">
    <h3>Add a screenshot</h3>
    <p>Take a screenshot now:</p>
    <p class="hint" id="upload-hint"></p>
    <p>Then attach it below.</p>
    <button id="choose-file-btn">Choose screenshot</button>
    <input id="upload-file-input" type="file" accept="image/*" style="display:none">
    <button id="upload-cancel-btn">Cancel</button>
  </div>
</div>
```

- [ ] **Step 3: Implement `openUploadSheet()` and wire it into `getScreenshot()`**

After the `openAnnotator` function and before the `getScreenshot` function, insert:

```js
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
```

In `getScreenshot()`, replace the stub comment and `return Promise.resolve(null)` at the end:

```js
      // upload path for iOS / unsupported browsers
      return openUploadSheet();
```

- [ ] **Step 4: Manual test — upload path**

To test without iOS: temporarily comment out the `if (navigator.mediaDevices && ...)` condition so the upload path always runs. Open the demo panel, click "📷 Add screenshot". The guided sheet should appear with a hint. Click "Choose screenshot", pick any image file. The thumbnail should appear in the panel. Remove the temporary comment before committing.

- [ ] **Step 5: Restore the dispatcher condition, confirm it's correct, commit**

The final `getScreenshot()` should look like:

```js
    function getScreenshot() {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        return navigator.mediaDevices.getDisplayMedia({ ... })
          ...
      }
      return openUploadSheet();
    }
```

```bash
git add widget/layer.js
git commit -m "feat: upload path — guided capture sheet for iOS and unsupported browsers"
```

---

## Task 6: Docs, config, demo

**Files:**
- Modify: `.env.example`
- Modify: `docs/setup.md`
- Modify: `demo/index.html`

**Note:** The user must manually add `AIRTABLE_SCREENSHOT_FIELD_ID` to their `.env` file (the secops hook blocks the agent from writing `.env*`). The agent can commit `.env.example`.

- [ ] **Step 1: Add `AIRTABLE_SCREENSHOT_FIELD_ID` to `.env.example`**

Read `.env.example` first, then append after the existing `AIRTABLE_TABLE_ID` line:

```
# Optional — Airtable field id for the Screenshot attachment column (e.g. fldXXXXXXXXXXXXXX)
# Obtain from: Airtable API docs page for your base > field id column in the Screenshot row.
# If unset, screenshots are captured and sent but not attached to the Airtable record.
AIRTABLE_SCREENSHOT_FIELD_ID=
```

- [ ] **Step 2: Update `docs/setup.md` — document Screenshot column and new env var**

Read the current `docs/setup.md`, then append a new section documenting:
- Add a **Screenshot** (Attachment type) column to the Airtable table after the Browser column.
- How to find the field id: open the Airtable API docs for your base → find the Screenshot row → copy the `fldXXXXX` id.
- Set `AIRTABLE_SCREENSHOT_FIELD_ID=fldXXXXX` in `.env`.
- In Netlify UI: add `AIRTABLE_SCREENSHOT_FIELD_ID` to the environment variables for the site.
- If the env var is omitted, feedback still works — screenshots are sent but not attached.

- [ ] **Step 3: Update `demo/index.html` — mention screenshot button**

Read `demo/index.html`. Find the paragraph or section that describes the widget. Add one sentence: "Click **📷 Add screenshot** to capture and optionally annotate the current screen before sending."

- [ ] **Step 4: Commit docs and config**

```bash
git add .env.example docs/setup.md demo/index.html
git commit -m "docs: document Screenshot field, env var, and screenshot button in demo"
```

---

## Task 7: Full test suite pass + push

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/isali/projects/layer && node --test test/parse.test.js test/handler.test.js 2>&1
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run `netlify dev` end-to-end**

Start `netlify dev`. Open `http://localhost:8888/demo/`. Test:
- Native path: accept share prompt, draw with each tool (Box, Arrow, Freehand, Text), Undo, Clear, Attach, Send → Airtable row has Screenshot thumbnail.
- Remove: click Remove after capturing → button restores, no screenshot sent.
- No screenshot: send without screenshot → single Airtable fetch, `screenshotAttached: false`, normal "Sent ✓".
- `data-screenshots="false"`: temporarily add the attribute to the script tag in demo — button should not appear.

- [ ] **Step 3: Push branch**

```bash
git push github-personal layer-phase2
```

Then open a PR via the GitHub web UI: `https://github.com/yixiancoding/layer/compare/main...layer-phase2`

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `data-screenshots="false"` hides button (Task 3 config)
- ✅ `getScreenshot()` dispatcher — native vs upload (Task 4)
- ✅ `getDisplayMedia` with `preferCurrentTab` (Task 4)
- ✅ Layer UI hidden during frame grab (Task 4 — `host.style.visibility`)
- ✅ Annotator — Box, Arrow, Freehand, Text, Undo, Clear, Cancel, Attach (Task 4)
- ✅ Shapes normalized to image space, rasterized at natural (capped) res on Attach (Task 4)
- ✅ Pointer events with `touch-action:none` (set via CSS in Task 4 on `#ann-canvas`)
- ✅ Upload path — guided sheet, device-specific hint, file input (Task 5)
- ✅ iOS-uploaded images attached as-is / no annotation editor on upload path (Task 5)
- ✅ Thumbnail + "Screenshot attached ✓ · Remove" (Task 3)
- ✅ Screenshot held in memory only, never localStorage (Task 3 — `heldScreenshot` var)
- ✅ Screenshot included in POST body (Task 3 `payload.screenshot`)
- ✅ Success with `screenshotAttached: false` while screenshot sent → soft note (Task 3)
- ✅ Failure preserves held screenshot (Task 3 — `.catch` doesn't call `setHeldScreenshot`)
- ✅ `parseDataUrl` — valid jpeg/png, rejects others (Task 1)
- ✅ Handler: create record first, then best-effort attach (Task 2)
- ✅ Handler: missing `AIRTABLE_SCREENSHOT_FIELD_ID` → `screenshotAttached: false` (Task 2)
- ✅ Handler: upload non-2xx → record kept, `screenshotAttached: false` (Task 2)
- ✅ Handler: upload throw → record kept, `screenshotAttached: false` (Task 2)
- ✅ Handler: invalid data URL → create only, `screenshotAttached: false` (Task 2)
- ✅ Max long edge 1600px, JPEG 0.85 (Task 4 `capScale`, Task 5 `toJpegDataUrl`)
- ✅ `AIRTABLE_SCREENSHOT_FIELD_ID` env var + `.env.example` (Task 6)
- ✅ `docs/setup.md` update (Task 6)
- ✅ `demo/index.html` mention (Task 6)
- ✅ Airtable `Screenshot` column is Attachment type (documented in Task 6; user creates manually)

**Note on `touch-action:none`:** must be set on `#ann-canvas` in CSS (added in Task 4 style block). Verify it's in the style string: `#ann-canvas{cursor:crosshair;touch-action:none;...}` ✅ (included in Task 4 Step 1 CSS).

**Note on Phase 1 `happy path` test:** The existing test `'happy path posts to Airtable and returns 200'` mocks `fetch` returning `{ ok: true, status: 200, text: async () => '{}' }`. The new handler calls `res.json()` after the create call. This will break the existing test because `{}` as text doesn't have a `.json()` method on the mock response. Fix: update the existing mock in `test/handler.test.js` to return `{ ok: true, status: 200, json: async () => ({ id: 'rec1' }), text: async () => '{}' }`. The new Task 2 tests already do this correctly.
