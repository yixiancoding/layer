# Layer — Phase 1 Design

**Date:** 2026-06-22
**Status:** Approved (pending implementation plan)

## Overview

Layer is a lightweight feedback widget for live prototypes. A team deploys
prototypes to Netlify deploy-preview URLs and shares them with stakeholders and
customers. Layer lets any visitor leave structured feedback with **zero install
and no account** — a single `<script>` tag injects a floating button; clicking it
opens a small form; submitting writes a row to Airtable via a Netlify serverless
function.

**Phase 1 scope:** feedback form → Netlify function → Airtable row, working end
to end. Screenshots/annotation are Phase 2 and explicitly out of scope here.

## Design principles

- Zero friction for the person leaving feedback — no account, no install.
- One script tag for the team adding it to their repo.
- Minimal and unobtrusive — must not interfere with the prototype.
- Floating button is fixed, bottom-right.

## Architecture & data flow

```
Visitor on prototype
  → Layer widget (Shadow DOM, vanilla JS, zero deps)
  → POST JSON  →  /.netlify/functions/submit-feedback
  → Netlify function (validates, maps fields, sets Timestamp)
  → Airtable REST API  →  one row appended
  → 200 {ok:true}  →  widget shows "Sent ✓", panel stays open
```

## Repo structure

```
layer/
├── widget/
│   └── layer.js
├── netlify/
│   └── functions/
│       └── submit-feedback.js
├── demo/
│   └── index.html
├── docs/
│   └── setup.md
├── netlify.toml
├── .env.example
├── .gitignore
├── package.json        # test script + Node engine only; no runtime deps
├── DECISIONS.md
└── README.md
```

## Visual direction

**Direction A — Minimal / Neutral.** Monochrome (black/white). Small circular
icon button, clean white card panel. No brand color; designed to disappear into
any prototype.

## Component 1 — Widget (`widget/layer.js`)

A single self-contained IIFE. No build step, no dependencies, no runtime
network calls except the feedback POST.

### Configuration (read from its own `<script>` tag)

- `data-feedback-url` — endpoint to POST to. Default
  `/.netlify/functions/submit-feedback`.
- `data-require-email` — when `"true"`, Email becomes required (for
  client-facing deploys). Default `false`.

Embed:

```html
<script
  src="./widget/layer.js"
  data-feedback-url="/.netlify/functions/submit-feedback">
</script>
```

### Isolation

- Appends ONE host `<div>` to `<body>` and attaches an **open Shadow Root**.
- All markup and a single `<style>` element live inside the shadow root, so the
  prototype's CSS cannot reach in and the widget's CSS cannot leak out.
- Host element pinned `position: fixed; z-index: 2147483647`.

### Floating button (minimize control)

- 44px circular, `#111827` background, white chat-bubble SVG icon.
- `aria-label="Leave feedback"`, keyboard focusable.
- Fixed bottom-right (16px inset).
- Click toggles the panel open/closed. Closed = only the button shows, so the
  prototype is fully visible. This is the primary "minimize."

### Panel

- White card, ~320px wide, rounded corners, soft shadow.
- **Header**: title "Leave feedback" + a `–` minimize button. The header also
  serves as the **drag handle**.
- **Body**: form fields + Send button.
- **Drag**: pointer-down on the header drags the panel; position is clamped so
  it always stays within the viewport.

### Form fields

| Field   | Control   | Required                                  |
| ------- | --------- | ----------------------------------------- |
| Name    | text      | Yes                                       |
| Email   | email     | Optional, unless `data-require-email=true`|
| Comment | textarea  | Yes                                       |

- Email format validated client-side whenever a value is present.
- Inline, per-field validation messages on invalid submit.

### Persistence (`localStorage` key `layer.visitor`)

Stores: `name`, `email`, and last panel `position {x, y}`.

- On open: pre-fill Name + Email; restore panel position.
- On submit / drag end: save current values.
- The Comment field is **never** persisted — always starts empty.

### Auto-captured context (sent in payload)

- `pageUrl` — `location.href`.
- `deployVersion` — see parsing rules below.
- `device` — best-effort readable string, e.g. `"Desktop — macOS"`,
  `"Mobile — iOS"`, parsed from `navigator.userAgent`.
- `browser` — best-effort name + major version, e.g. `"Chrome 124"`,
  `"Safari 17"`.

(`Timestamp` is set authoritatively by the server, not the client.)

### Deploy Version parsing (pure helper `parseDeployVersion(hostname)`)

- `localhost`, `127.0.0.1`, or `file:` protocol → `"local"`.
- Hostname's first label matches `^deploy-preview-\d+` (e.g.
  `deploy-preview-26--ts-design-prototypes.netlify.app`) →
  the matched segment, e.g. `"deploy-preview-26"`.
- Anything else → `"unknown"`.

### Submit lifecycle

1. Client-side validation (required fields + email format). On failure: show
   inline messages, do not POST.
2. Disable Send, label "Sending…".
3. `POST` JSON to the feedback URL.
4. **Success (200):** clear only the Comment field; keep Name/Email; show a
   transient "Sent ✓" confirmation (~2s); panel stays open, ready for another
   note.
5. **Failure (non-2xx / network error):** show inline error; preserve ALL field
   values including the Comment so the visitor can retry.

## Component 2 — Netlify function (`netlify/functions/submit-feedback.js`)

Node function using the built-in global `fetch`. Zero dependencies.

- `POST` only — other methods return `405`.
- Handles `OPTIONS` preflight and returns permissive CORS headers
  (`Access-Control-Allow-Origin: *`) so the widget also works if embedded
  cross-origin. (Default same-site embedding does not require this, but it
  avoids surprises.)
- Parses JSON body; malformed JSON → `400`.
- **Validation** (pure helper `validate(body)`): Name non-empty, Comment
  non-empty, Email format valid if present. Failure → `400` with a clear
  message.
- Reads env vars `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_ID`.
  Any missing → `500` with a safe client message; real reason logged
  server-side.
- **Field mapping** (pure helper `buildFields(body)`) → exact Airtable column
  names, in this order:

  `Timestamp | Name | Email | Page URL | Deploy Version | Comment | Device | Browser`

  - `Timestamp` — server-generated ISO 8601 string (authoritative).
  - Remaining fields come from the validated payload.
- `POST`s `{ fields, typecast: true }` to
  `https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}` with
  `Authorization: Bearer {AIRTABLE_API_KEY}`.
- Airtable non-2xx → `502` with safe message (Airtable detail logged).
- Success → `200 { ok: true }`.

### Environment variables

```
AIRTABLE_API_KEY
AIRTABLE_BASE_ID
AIRTABLE_TABLE_ID
```

## Component 3 — Demo page (`demo/index.html`)

A simple mock "prototype" page (some headings/paragraphs/imagery) that loads the
widget via the script tag and points `data-feedback-url` at the function. The
full submit path works when served under `netlify dev`.

## Component 4 — Config & supporting files

- **`netlify.toml`** — `functions = "netlify/functions"`; publish directory set
  so `/widget/layer.js` and `/demo/` are served and the function resolves at
  `/.netlify/functions/submit-feedback`.
- **`.gitignore`** — must include `.env`, plus `node_modules`, `.netlify`,
  `.DS_Store`, `.superpowers/`.
- **`.env.example`** — the three variable names, no values.
- **`docs/setup.md`** — Airtable base/table setup (create table with the exact
  fields above; make `Timestamp` a Date field), obtaining API key / base id /
  table id, local testing with `netlify dev`, deploying, and the embed snippet.
- **`DECISIONS.md`** — running log of the decisions in this spec.
- **`README.md`** — overview + quick start + embed snippet.

## Testing approach

- **Pure helpers are unit-tested** with Node's built-in `node:test` runner — no
  test dependencies. Targets:
  - `parseDeployVersion(hostname)` — local / deploy-preview / unknown cases.
  - `parseDevice(ua)` and `parseBrowser(ua)` — representative user agents.
  - `validate(body)` — required fields and email format.
  - `buildFields(body)` — exact column names/order and server Timestamp.
- A minimal `package.json` declares the `test` script and Node engine only.
- **Widget DOM behavior** (button toggle, drag, persistence, submit/success/
  error states) is verified manually via `demo/index.html` under `netlify dev`.

To keep helpers testable, the function and widget export/expose their pure
helpers in a way the test runner can import without a live network or DOM.

## Decisions log (rationale)

- **Shadow DOM** over scoped CSS or iframe — only approach that guarantees
  non-interference in both directions while staying a single dependency-free
  file. iframe was rejected as overkill (YAGNI) for a 3-field form.
- **Name + Comment required; Email optional** by default, with
  `data-require-email` toggle for client-facing deploys.
- **Remember name/email (and panel position) in `localStorage`** — reduces
  friction for repeat commenters; nothing is sent until submit.
- **Panel stays open after submit** with a transient "Sent ✓" — visitors
  routinely leave more than one note.
- **Minimize + drag** — minimize (button toggle) is the floor requirement so the
  prototype stays visible; drag-by-header lets the visitor move the panel off
  whatever they're looking at.
- **Server sets Timestamp** — authoritative, not spoofable by the client.
- **Server maps fields** to exact Airtable column names — keeps the widget
  payload decoupled from the Airtable schema.

## Out of scope (Phase 1)

Screenshots / annotation (Phase 2), ratings or categories, any authentication,
multiple Airtable tables/bases.
