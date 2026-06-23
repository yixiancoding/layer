# Layer Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-install feedback widget that injects via one `<script>` tag, collects name/email/comment plus auto-captured context, and writes a row to Airtable through a Netlify function.

**Architecture:** A dependency-free vanilla-JS widget renders inside a Shadow DOM (full style isolation) and POSTs JSON to a Netlify serverless function. The function holds all URL/User-Agent parsing as pure, unit-tested helpers, sets an authoritative timestamp, and maps fields to exact Airtable columns. The widget only derives `Context`, which needs the live DOM.

**Tech Stack:** Vanilla JS (Shadow DOM, `localStorage`, `fetch`), Netlify Functions (Node 20, CommonJS, global `fetch`), Airtable REST API, Node's built-in `node:test` runner (no test deps).

**Spec:** `docs/superpowers/specs/2026-06-22-layer-phase1-design.md`

---

## File Structure

```
layer/
├── widget/layer.js                       # browser widget (IIFE, Shadow DOM)
├── netlify/functions/submit-feedback.js  # HTTP handler (thin)
├── netlify/functions/lib/parse.js        # pure helpers (parsing/validation/mapping)
├── demo/index.html                       # local test prototype page
├── test/parse.test.js                    # unit tests for pure helpers
├── test/handler.test.js                  # handler tests (fetch + env mocked)
├── docs/setup.md                         # Airtable + local dev + deploy + embed
├── netlify.toml
├── .env.example
├── .gitignore
├── package.json                          # test script + Node engine only
├── DECISIONS.md
└── README.md
```

**Boundaries:**
- `lib/parse.js` is pure (string in → string/array/object out). No I/O, no DOM. Fully unit-tested.
- `submit-feedback.js` is the only place that touches `process.env` and the network. Kept thin so handler tests only need to mock `fetch` + env.
- `layer.js` is the only DOM code; verified manually via the demo page.

Airtable column order (referenced throughout):
`Timestamp | Name | Email | Page URL | Deploy Version | Prototype | Context | Comment | Device | Browser`

---

## Task 1: Project scaffolding & config

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `netlify.toml`
- Create: `package.json`
- Create: `README.md`
- Create: `DECISIONS.md`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
.env
.env.*
!.env.example
node_modules/
.netlify/
.DS_Store
.superpowers/
```

- [ ] **Step 2: Create `.env.example`**

```dotenv
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_ID=
```

- [ ] **Step 3: Create `netlify.toml`**

```toml
[build]
  publish = "."
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "20"
```

- [ ] **Step 4: Create `package.json`**

```json
{
  "name": "layer",
  "version": "0.1.0",
  "private": true,
  "description": "Lightweight feedback widget for live prototypes.",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 5: Create `README.md`**

```markdown
# Layer

A lightweight feedback widget for live prototypes. Visitors leave structured
feedback with **zero install and no account**; submissions are written to
Airtable via a Netlify function.

## Quick start

1. Create the Airtable base/table and get your credentials — see
   [`docs/setup.md`](docs/setup.md).
2. Copy `.env.example` to `.env` and fill in the three values.
3. Install the Netlify CLI and run locally:
   ```bash
   npm i -g netlify-cli
   netlify dev
   ```
   Open the demo at http://localhost:8888/demo/.

## Embed

Add one script tag to any page (adjust the `src` path to where you host the file):

```html
<script
  src="/widget/layer.js"
  data-feedback-url="/.netlify/functions/submit-feedback">
</script>
```

Optional: add `data-require-email="true"` to make email required (client-facing
deploys).

## Tests

```bash
npm test
```

## Scope

Phase 1: feedback form → Netlify function → Airtable row. Screenshots /
annotation are Phase 2.
```

- [ ] **Step 6: Create `DECISIONS.md`**

```markdown
# Decisions

- **Shadow DOM** for the widget — guarantees the widget and the host prototype
  cannot affect each other's styles, while staying a single dependency-free file.
  (iframe rejected as overkill; scoped CSS rejected as not bulletproof.)
- **Name + Comment required, Email optional**, with a `data-require-email="true"`
  toggle for client-facing deploys (enforced client-side).
- **Remember name/email + panel position in `localStorage`** so repeat
  commenters enter details once. The comment field is never persisted.
- **Panel stays open after submit** with a transient "Sent ✓" — visitors
  routinely leave more than one note.
- **Minimize + drag** — the button toggles the panel (keeps the prototype
  visible); the header is a drag handle so the panel can be moved off content.
- **Prototype slug** derived from the `/standalone/<author>/<prototype>`
  convention (3rd path segment, robust to deeper sub-routes; falls back to the
  last segment). A single deploy-preview hosts many prototypes, so
  `Deploy Version` alone is insufficient.
- **`Context` auto hint** (title + nearest visible heading + scroll %) — a
  zero-friction approximation of which state a comment is about, since
  single-page prototypes change state without changing the URL and Phase 1 has
  no screenshots.
- **All parsing server-side**; the widget is a thin DOM layer. `Context` is the
  only client-derived field because it needs the DOM.
- **Server sets the Timestamp** (authoritative) and **maps fields** to exact
  Airtable column names (keeps the widget decoupled from the schema).
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example netlify.toml package.json README.md DECISIONS.md
git commit -m "chore: scaffold Layer repo and config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: URL parsers (`parseDeployVersion`, `parsePrototype`)

**Files:**
- Create: `test/parse.test.js`
- Create: `netlify/functions/lib/parse.js`

- [ ] **Step 1: Write the failing tests**

Create `test/parse.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeployVersion, parsePrototype } = require('../netlify/functions/lib/parse');

test('parseDeployVersion: deploy preview host', () => {
  assert.equal(
    parseDeployVersion('https://deploy-preview-26--ts-design-prototypes.netlify.app/standalone/isa/x'),
    'deploy-preview-26'
  );
});

test('parseDeployVersion: localhost is local', () => {
  assert.equal(parseDeployVersion('http://localhost:8888/demo/'), 'local');
  assert.equal(parseDeployVersion('http://127.0.0.1:8888/'), 'local');
});

test('parseDeployVersion: production host is unknown', () => {
  assert.equal(parseDeployVersion('https://ts-design-prototypes.netlify.app/x'), 'unknown');
});

test('parseDeployVersion: branch deploy is unknown', () => {
  assert.equal(parseDeployVersion('https://main--ts-design-prototypes.netlify.app/x'), 'unknown');
});

test('parseDeployVersion: garbage is unknown', () => {
  assert.equal(parseDeployVersion('not a url'), 'unknown');
});

test('parsePrototype: convention path returns prototype segment', () => {
  assert.equal(
    parsePrototype('https://deploy-preview-26--site.netlify.app/standalone/isa/custom-eligibility-prototype-v3'),
    'custom-eligibility-prototype-v3'
  );
});

test('parsePrototype: deeper sub-route still returns prototype segment', () => {
  assert.equal(
    parsePrototype('https://site.netlify.app/standalone/isa/custom-eligibility-prototype-v3/step-2'),
    'custom-eligibility-prototype-v3'
  );
});

test('parsePrototype: trailing index.html stripped', () => {
  assert.equal(
    parsePrototype('https://site.netlify.app/standalone/isa/proto-a/index.html'),
    'proto-a'
  );
});

test('parsePrototype: non-convention path falls back to last segment', () => {
  assert.equal(parsePrototype('https://site.netlify.app/foo/bar/baz'), 'baz');
});

test('parsePrototype: root path is unknown', () => {
  assert.equal(parsePrototype('https://site.netlify.app/'), 'unknown');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/parse'`.

- [ ] **Step 3: Implement the parsers**

Create `netlify/functions/lib/parse.js`:

```js
'use strict';

function safeUrl(pageUrl) {
  try { return new URL(pageUrl); } catch { return null; }
}

function parseDeployVersion(pageUrl) {
  const url = safeUrl(pageUrl);
  if (!url) return 'unknown';
  if (url.protocol === 'file:') return 'local';
  const host = url.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return 'local';
  const firstLabel = host.split('--')[0];
  const m = firstLabel.match(/^deploy-preview-\d+/);
  return m ? m[0] : 'unknown';
}

function parsePrototype(pageUrl) {
  const url = safeUrl(pageUrl);
  if (!url) return 'unknown';
  let segments = url.pathname.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  if (segments.length && segments[segments.length - 1].toLowerCase() === 'index.html') {
    segments.pop();
  }
  if (!segments.length) return 'unknown';
  if (segments[0] === 'standalone' && segments.length >= 3) return segments[2];
  return segments[segments.length - 1];
}

module.exports = { parseDeployVersion, parsePrototype };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add test/parse.test.js netlify/functions/lib/parse.js
git commit -m "feat: add deploy-version and prototype URL parsers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: User-Agent parsers (`parseDevice`, `parseBrowser`)

**Files:**
- Modify: `test/parse.test.js` (append tests)
- Modify: `netlify/functions/lib/parse.js` (add functions, extend exports)

- [ ] **Step 1: Append the failing tests**

Append to `test/parse.test.js`:

```js
const { parseDevice, parseBrowser } = require('../netlify/functions/lib/parse');

const UA_MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const UA_ANDROID_FF = 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0';

test('parseDevice: desktop mac', () => {
  assert.equal(parseDevice(UA_MAC_CHROME), 'Desktop — macOS');
});
test('parseDevice: iphone is mobile iOS', () => {
  assert.equal(parseDevice(UA_IPHONE_SAFARI), 'Mobile — iOS');
});
test('parseDevice: android mobile', () => {
  assert.equal(parseDevice(UA_ANDROID_FF), 'Mobile — Android');
});
test('parseDevice: empty is unknown', () => {
  assert.equal(parseDevice(''), 'unknown');
});

test('parseBrowser: chrome', () => {
  assert.equal(parseBrowser(UA_MAC_CHROME), 'Chrome 124');
});
test('parseBrowser: edge wins over chrome token', () => {
  assert.equal(parseBrowser(UA_WIN_EDGE), 'Edge 124');
});
test('parseBrowser: safari', () => {
  assert.equal(parseBrowser(UA_IPHONE_SAFARI), 'Safari 17');
});
test('parseBrowser: firefox', () => {
  assert.equal(parseBrowser(UA_ANDROID_FF), 'Firefox 126');
});
test('parseBrowser: empty is unknown', () => {
  assert.equal(parseBrowser(''), 'unknown');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parseDevice`/`parseBrowser` are not exported (undefined is not a function).

- [ ] **Step 3: Add the parsers**

In `netlify/functions/lib/parse.js`, add these two functions above `module.exports`:

```js
function parseDevice(userAgent) {
  const ua = userAgent || '';
  if (!ua) return 'unknown';
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' : 'unknown';
  if (os === 'unknown') return 'unknown';
  const form =
    /iPad|Tablet/.test(ua) ? 'Tablet' :
    /Mobi|iPhone|Android.*Mobile/.test(ua) ? 'Mobile' :
    'Desktop';
  return `${form} — ${os}`;
}

function parseBrowser(userAgent) {
  const ua = userAgent || '';
  if (!ua) return 'unknown';
  let m;
  if ((m = ua.match(/Edg\/(\d+)/))) return `Edge ${m[1]}`;
  if ((m = ua.match(/OPR\/(\d+)/))) return `Opera ${m[1]}`;
  if ((m = ua.match(/Firefox\/(\d+)/))) return `Firefox ${m[1]}`;
  if ((m = ua.match(/Chrome\/(\d+)/))) return `Chrome ${m[1]}`;
  if (/Safari/.test(ua) && (m = ua.match(/Version\/(\d+)/))) return `Safari ${m[1]}`;
  return 'unknown';
}
```

Then replace the export line with:

```js
module.exports = { parseDeployVersion, parsePrototype, parseDevice, parseBrowser };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green (19 total).

- [ ] **Step 5: Commit**

```bash
git add test/parse.test.js netlify/functions/lib/parse.js
git commit -m "feat: add device and browser user-agent parsers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Validation & field mapping (`validate`, `buildFields`)

**Files:**
- Modify: `test/parse.test.js` (append tests)
- Modify: `netlify/functions/lib/parse.js` (add functions, extend exports)

- [ ] **Step 1: Append the failing tests**

Append to `test/parse.test.js`:

```js
const { validate, buildFields } = require('../netlify/functions/lib/parse');

test('validate: ok when name + comment present, no email', () => {
  assert.deepEqual(validate({ name: 'Ada', comment: 'Looks good' }), []);
});
test('validate: missing name and comment', () => {
  const errs = validate({ name: '  ', comment: '' });
  assert.equal(errs.length, 2);
});
test('validate: bad email format', () => {
  const errs = validate({ name: 'Ada', comment: 'x', email: 'nope' });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /email/i);
});
test('validate: good email passes', () => {
  assert.deepEqual(validate({ name: 'Ada', comment: 'x', email: 'ada@example.com' }), []);
});

test('buildFields: maps exact columns with injected timestamp', () => {
  const body = {
    name: ' Ada ',
    email: 'ada@example.com',
    comment: ' Nice ',
    context: ' Home — Step 1 — scrolled 10% ',
    pageUrl: 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  const fields = buildFields(body, '2026-06-22T00:00:00.000Z');
  assert.deepEqual(fields, {
    'Timestamp': '2026-06-22T00:00:00.000Z',
    'Name': 'Ada',
    'Email': 'ada@example.com',
    'Page URL': 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    'Deploy Version': 'deploy-preview-26',
    'Prototype': 'proto-x',
    'Context': 'Home — Step 1 — scrolled 10%',
    'Comment': 'Nice',
    'Device': 'Desktop — macOS',
    'Browser': 'Chrome 124',
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `validate`/`buildFields` not exported.

- [ ] **Step 3: Add the functions**

In `netlify/functions/lib/parse.js`, add above `module.exports`:

```js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body) {
  const b = body || {};
  const errors = [];
  if (!String(b.name || '').trim()) errors.push('Name is required.');
  if (!String(b.comment || '').trim()) errors.push('Comment is required.');
  const email = String(b.email || '').trim();
  if (email && !EMAIL_RE.test(email)) errors.push('Email is not valid.');
  return errors;
}

function buildFields(body, nowIso) {
  const b = body || {};
  const pageUrl = String(b.pageUrl || '');
  const userAgent = String(b.userAgent || '');
  return {
    'Timestamp': nowIso,
    'Name': String(b.name || '').trim(),
    'Email': String(b.email || '').trim(),
    'Page URL': pageUrl,
    'Deploy Version': parseDeployVersion(pageUrl),
    'Prototype': parsePrototype(pageUrl),
    'Context': String(b.context || '').trim(),
    'Comment': String(b.comment || '').trim(),
    'Device': parseDevice(userAgent),
    'Browser': parseBrowser(userAgent),
  };
}
```

Then replace the export line with:

```js
module.exports = {
  parseDeployVersion, parsePrototype, parseDevice, parseBrowser, validate, buildFields,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green (24 total).

- [ ] **Step 5: Commit**

```bash
git add test/parse.test.js netlify/functions/lib/parse.js
git commit -m "feat: add request validation and Airtable field mapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Netlify function handler

**Files:**
- Create: `test/handler.test.js`
- Create: `netlify/functions/submit-feedback.js`

- [ ] **Step 1: Write the failing tests**

Create `test/handler.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/submit-feedback');

const ENV = {
  AIRTABLE_API_KEY: 'key123',
  AIRTABLE_BASE_ID: 'appBASE',
  AIRTABLE_TABLE_ID: 'tblTABLE',
};

function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

function validBody() {
  return JSON.stringify({
    name: 'Ada', email: 'ada@example.com', comment: 'Nice',
    pageUrl: 'https://deploy-preview-26--site.netlify.app/standalone/isa/proto-x',
    userAgent: 'UA', context: 'ctx',
  });
}

test('OPTIONS preflight returns 204 with CORS', async () => {
  const res = await handler({ httpMethod: 'OPTIONS' });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('GET returns 405', async () => {
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('invalid JSON returns 400', async () => {
  const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: '{not json' }));
  assert.equal(res.statusCode, 400);
});

test('validation failure returns 400', async () => {
  const body = JSON.stringify({ name: '', comment: '' });
  const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body }));
  assert.equal(res.statusCode, 400);
});

test('missing env returns 500', async () => {
  const res = await handler({ httpMethod: 'POST', body: validBody() });
  assert.equal(res.statusCode, 500);
});

test('happy path posts to Airtable and returns 200', async () => {
  let captured = null;
  const savedFetch = global.fetch;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    assert.equal(captured.url, 'https://api.airtable.com/v0/appBASE/tblTABLE');
    assert.equal(captured.opts.headers.Authorization, 'Bearer key123');
    const sent = JSON.parse(captured.opts.body);
    assert.equal(sent.typecast, true);
    assert.equal(sent.fields['Deploy Version'], 'deploy-preview-26');
    assert.equal(sent.fields['Prototype'], 'proto-x');
    assert.ok(sent.fields['Timestamp']);
  } finally {
    global.fetch = savedFetch;
  }
});

test('Airtable failure returns 502', async () => {
  const savedFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 422, text: async () => 'bad field' });
  try {
    const res = await withEnv(ENV, () => handler({ httpMethod: 'POST', body: validBody() }));
    assert.equal(res.statusCode, 502);
  } finally {
    global.fetch = savedFetch;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../netlify/functions/submit-feedback'`.

- [ ] **Step 3: Implement the handler**

Create `netlify/functions/submit-feedback.js`:

```js
'use strict';

const { validate, buildFields } = require('./lib/parse');

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

  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    console.error('Layer: missing Airtable environment variables');
    return json(500, { error: 'Server is not configured.' });
  }

  const fields = buildFields(body, new Date().toISOString());
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

  try {
    const res = await fetch(url, {
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
    return json(200, { ok: true });
  } catch (err) {
    console.error('Layer: Airtable request failed', err);
    return json(502, { error: 'Could not save feedback.' });
  }
}

exports.handler = handler;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green (parse + handler suites).

- [ ] **Step 5: Commit**

```bash
git add test/handler.test.js netlify/functions/submit-feedback.js
git commit -m "feat: add submit-feedback Netlify function

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Widget & demo page

The widget has no automated tests (it is DOM/browser behavior); it is verified
manually against the demo page under `netlify dev`.

**Files:**
- Create: `widget/layer.js`
- Create: `demo/index.html`

- [ ] **Step 1: Create the widget**

Create `widget/layer.js`:

```js
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
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      '#fab{position:fixed;right:16px;bottom:16px;width:44px;height:44px;border-radius:50%;border:none;background:#111827;color:#fff;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}' +
      '#fab svg{width:22px;height:22px;display:block}' +
      '#fab:focus-visible{outline:2px solid #111827;outline-offset:2px}' +
      '#panel{position:fixed;right:16px;bottom:72px;width:320px;max-width:calc(100vw - 32px);background:#fff;color:#111827;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 12px 30px rgba(0,0,0,.18);overflow:hidden}' +
      '#panel[hidden]{display:none}' +
      '#bar{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#111827;color:#fff;cursor:move;user-select:none;font-size:13px;font-weight:600}' +
      '#min{background:transparent;border:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 4px}' +
      '#form{padding:12px;display:flex;flex-direction:column;gap:8px}' +
      'label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#374151}' +
      'input,textarea{font:inherit;font-size:13px;font-weight:400;padding:8px;border:1px solid #d1d5db;border-radius:6px;width:100%;color:#111827;background:#fff}' +
      'input:focus,textarea:focus{outline:none;border-color:#111827}' +
      'textarea{resize:vertical}' +
      '.err{color:#b91c1c;font-size:11px}' +
      '.err:empty{display:none}' +
      '#send{margin-top:4px;background:#111827;color:#fff;border:none;border-radius:6px;padding:9px;font-size:13px;font-weight:600;cursor:pointer}' +
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
      '<label>Name<input id="name" type="text" autocomplete="name"></label>' +
      '<div class="err" id="err-name"></div>' +
      '<label>Email' + (REQUIRE_EMAIL ? '' : ' (optional)') + '<input id="email" type="email" autocomplete="email"></label>' +
      '<div class="err" id="err-email"></div>' +
      '<label>Comment<textarea id="comment" rows="4"></textarea></label>' +
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
```

- [ ] **Step 2: Create the demo page**

Create `demo/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Custom Eligibility Prototype</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto;
           padding: 40px 20px; line-height: 1.6; color: #111; }
    section { margin: 0 0 80vh; }
    h2 { margin-top: 0; }
  </style>
</head>
<body>
  <h1>Custom Eligibility Prototype</h1>
  <p>Scroll through the steps. Use the feedback button (bottom-right) to comment.</p>

  <section><h2>Step 1 — Overview</h2>
    <p>This mock page exists to exercise the Layer widget locally.</p></section>
  <section><h2>Step 2 — Eligibility results</h2>
    <p>Scrolling here should change the captured Context (visible heading + scroll %).</p></section>
  <section><h2>Step 3 — Confirmation</h2>
    <p>The final step of the flow.</p></section>

  <script
    src="../widget/layer.js"
    data-feedback-url="/.netlify/functions/submit-feedback">
  </script>
</body>
</html>
```

- [ ] **Step 3: Confirm unit tests still pass**

Run: `npm test`
Expected: PASS (unchanged — widget has no unit tests).

- [ ] **Step 4: Manual verification under `netlify dev`**

Run: `netlify dev` (install once with `npm i -g netlify-cli` if needed).
Open: http://localhost:8888/demo/

Verify each, fixing the widget and re-checking before moving on:
- A circular dark button appears bottom-right; the demo page layout is untouched.
- Clicking the button opens the panel; clicking again (or the `–`) closes it, fully revealing the page.
- Submitting empty shows "Name is required." and "Comment is required." inline; no network request fires.
- Entering an invalid email shows "Email is not valid."
- Dragging the dark header moves the panel; it cannot be dragged off-screen.
- Reload the page, reopen — name/email are pre-filled (if a prior submit/drag occurred) and the panel reappears where it was last dragged.

(Submitting successfully is verified end-to-end in Task 8, once Airtable env is set. Without env, a submit shows "Could not send. Please try again." — that is expected here.)

- [ ] **Step 5: Commit**

```bash
git add widget/layer.js demo/index.html
git commit -m "feat: add Shadow DOM feedback widget and demo page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Setup documentation

**Files:**
- Create: `docs/setup.md`

- [ ] **Step 1: Write the setup guide**

Create `docs/setup.md`:

```markdown
# Layer setup

## 1. Create the Airtable table

1. Create (or pick) an Airtable base.
2. Create a table with these fields, in this order and with these exact names:

   | Field          | Type              |
   | -------------- | ----------------- |
   | Timestamp      | Date (include time) |
   | Name           | Single line text  |
   | Email          | Email             |
   | Page URL       | URL               |
   | Deploy Version | Single line text  |
   | Prototype      | Single line text  |
   | Context        | Long text         |
   | Comment        | Long text         |
   | Device         | Single line text  |
   | Browser        | Single line text  |

   Field names must match exactly — the function maps to them by name.

## 2. Get credentials

- **AIRTABLE_API_KEY** — a Personal Access Token from
  https://airtable.com/create/tokens with the `data.records:write` scope, granted
  access to your base.
- **AIRTABLE_BASE_ID** — from the API docs for your base
  (https://airtable.com/api), looks like `appXXXXXXXXXXXXXX`.
- **AIRTABLE_TABLE_ID** — the table ID (`tblXXXXXXXXXXXXXX`) or the exact table
  name.

## 3. Configure environment

Copy the example file and fill in values:

```bash
cp .env.example .env
```

```dotenv
AIRTABLE_API_KEY=patXXXXXXXX...
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_TABLE_ID=tblXXXXXXXXXXXXXX
```

`.env` is gitignored — never commit it.

## 4. Run locally

```bash
npm i -g netlify-cli
netlify dev
```

`netlify dev` loads `.env` and serves the function at
`/.netlify/functions/submit-feedback`. Open http://localhost:8888/demo/ and
submit feedback; a row should appear in Airtable.

## 5. Deploy

Push to a repo connected to Netlify, or run `netlify deploy`. Set the three
environment variables in **Site settings → Environment variables** (do not rely
on `.env` in production).

## 6. Embed in a prototype

Add one tag to any page (point `src` at where the file is hosted):

```html
<script
  src="/widget/layer.js"
  data-feedback-url="/.netlify/functions/submit-feedback">
</script>
```

Make email required for client-facing deploys:

```html
<script
  src="/widget/layer.js"
  data-feedback-url="/.netlify/functions/submit-feedback"
  data-require-email="true">
</script>
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup.md
git commit -m "docs: add Airtable + local dev + deploy setup guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: End-to-end verification

No code — this task confirms the whole path works against a real Airtable base.

**Prerequisite:** Airtable table created and `.env` filled per `docs/setup.md`.

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS — all parse + handler tests green.

- [ ] **Step 2: Run the app**

Run: `netlify dev`
Open: http://localhost:8888/demo/

- [ ] **Step 3: Submit and verify the row**

1. Open the widget, enter Name + Comment (leave Email blank), Send.
2. Expect a transient "Sent ✓"; the panel stays open; the comment clears;
   name persists.
3. In Airtable, confirm a new row with:
   - `Timestamp` populated (server time).
   - `Page URL` = the demo URL; `Deploy Version` = `local`;
     `Prototype` = `demo` (last path segment for the non-convention demo path).
   - `Context` containing the page title, a heading, and `scrolled N%`.
   - `Device` / `Browser` populated from your browser.
4. Scroll to "Step 3 — Confirmation", submit again, and confirm `Context`
   reflects the new heading/scroll.

- [ ] **Step 4: Verify the error path**

Temporarily set a wrong `AIRTABLE_TABLE_ID`, restart `netlify dev`, submit, and
confirm the widget shows "Could not send. Please try again." and the comment text
is preserved. Restore the correct value afterward.

- [ ] **Step 5: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: end-to-end verification fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Shadow DOM isolation (Task 6), config attributes incl.
`data-require-email` (Task 6), floating button + minimize + drag + position
persistence (Task 6), required/optional fields + validation (Tasks 4, 6),
localStorage remember (Task 6), keep-panel-open + transient confirmation + error
preserves values (Task 6), `captureContext` (Task 6), `parseDeployVersion` /
`parsePrototype` / `parseDevice` / `parseBrowser` / `validate` / `buildFields`
(Tasks 2–4), function handler with CORS/405/400/500/502 + Airtable POST + server
Timestamp (Task 5), exact Airtable column order (Tasks 4, 7), demo page (Task 6),
netlify.toml / .gitignore (incl. `.env`) / .env.example / package.json (Task 1),
setup.md / README / DECISIONS (Tasks 1, 7), tests via node:test (Tasks 2–5),
end-to-end check (Task 8). No gaps found.

**Placeholder scan:** none — every code step contains complete content.

**Type consistency:** helper names (`parseDeployVersion`, `parsePrototype`,
`parseDevice`, `parseBrowser`, `validate`, `buildFields`, `handler`), the
`localStorage` key `layer.visitor`, the payload shape
`{name,email,comment,pageUrl,userAgent,context}`, and the Airtable column names
are identical across the widget, function, and tests.
