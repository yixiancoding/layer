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
        collects: name, email, comment, pageUrl, userAgent, context
  → POST JSON  →  /.netlify/functions/submit-feedback
  → Netlify function:
        validates input
        derives: deployVersion + prototype (from pageUrl),
                 device + browser (from userAgent)
        sets authoritative Timestamp
        maps to exact Airtable columns
  → Airtable REST API  →  one row appended
  → 200 {ok:true}  →  widget shows "Sent ✓", panel stays open
```

The widget is a thin DOM layer that collects raw signals. **All string parsing
lives in the function** as pure, unit-testable helpers — the widget only derives
`context`, which requires the live DOM.

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

## Airtable schema (exact column names, in order)

```
Timestamp | Name | Email | Page URL | Deploy Version | Prototype | Context | Comment | Device | Browser
```

- `Timestamp` — Date field (server-generated ISO 8601).
- `Page URL` — full `location.href`.
- `Deploy Version` — derived from the URL (see parsing rules).
- `Prototype` — derived prototype slug (see parsing rules).
- `Context` — auto state hint captured by the widget on submit.

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

- Email format validated client-side whenever a value is present (the function
  re-validates server-side).
- Inline, per-field validation messages on invalid submit.

### Persistence (`localStorage` key `layer.visitor`)

Stores: `name`, `email`, and last panel `position {x, y}`.

- On open: pre-fill Name + Email; restore panel position.
- On submit / drag end: save current values.
- The Comment field is **never** persisted — always starts empty.

### Signals the widget collects and sends

The POST body is JSON:

```json
{
  "name":      "string",
  "email":     "string (may be empty)",
  "comment":   "string",
  "pageUrl":   "location.href",
  "userAgent": "navigator.userAgent",
  "context":   "auto state hint (see below)"
}
```

The widget does NOT parse deploy version / prototype / device / browser — it
sends the raw `pageUrl` and `userAgent` and lets the function derive those.

### Context capture (DOM, captured on submit) — `captureContext()`

Returns a short best-effort breadcrumb describing the current view, e.g.:

```
"Custom Eligibility — Eligibility results — scrolled 42%"
```

Composed from:

- `document.title`.
- The **nearest visible heading**: the last `h1`–`h6` whose top edge is at or
  above the current scroll position (i.e. the heading of the section currently in
  view). Omitted if none.
- **Scroll position** as a percentage:
  `round(scrollY / (scrollHeight − innerHeight) × 100)`, clamped 0–100; `0` when
  the page is not scrollable.

**Known limitation:** this cannot distinguish modal/tab states that share the
same scroll position and heading. Precise per-state capture is Phase 2
(screenshots/annotation). The visitor can always name the state in their Comment.

### Submit lifecycle

1. Client-side validation (required fields + email format). On failure: show
   inline messages, do not POST.
2. Disable Send, label "Sending…".
3. Capture `context`, build the JSON body, `POST` to the feedback URL.
4. **Success (200):** clear only the Comment field; keep Name/Email; show a
   transient "Sent ✓" confirmation (~2s); panel stays open, ready for another
   note.
5. **Failure (non-2xx / network error):** show inline error; preserve ALL field
   values including the Comment so the visitor can retry.

## Component 2 — Netlify function (`netlify/functions/submit-feedback.js`)

Node function using the built-in global `fetch`. Zero dependencies. Composed of
pure helpers plus a thin handler.

### Handler behavior

- `POST` only — other methods return `405`.
- Handles `OPTIONS` preflight and returns permissive CORS headers
  (`Access-Control-Allow-Origin: *`) so the widget also works if embedded
  cross-origin. (Default same-site embedding does not require this, but it
  avoids surprises.)
- Parses JSON body; malformed JSON → `400`.
- **Validation** (`validate(body)`): Name non-empty, Comment non-empty, Email
  format valid if present. Failure → `400` with a clear message.
- Reads env vars `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_ID`.
  Any missing → `500` with a safe client message; real reason logged
  server-side.
- Builds the record via `buildFields(body)` and `POST`s
  `{ fields, typecast: true }` to
  `https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}` with
  `Authorization: Bearer {AIRTABLE_API_KEY}`.
- Airtable non-2xx → `502` with safe message (Airtable detail logged).
- Success → `200 { ok: true }`.

### Pure helpers (all unit-tested)

**`parseDeployVersion(pageUrl)`**
- `localhost`, `127.0.0.1`, or `file:` → `"local"`.
- Hostname's first label matches `^deploy-preview-\d+` (e.g.
  `deploy-preview-26--ts-design-prototypes.netlify.app`) →
  the matched segment, e.g. `"deploy-preview-26"`.
- Anything else → `"unknown"`.

**`parsePrototype(pageUrl)`** — relies on the `/standalone/<author>/<prototype>`
convention.
- Split the pathname into non-empty segments.
- If the first segment is `standalone` and a third segment exists, return the
  third segment (the prototype), regardless of any deeper sub-route. Example:
  `/standalone/isa/custom-eligibility-prototype-v3/step-2` →
  `"custom-eligibility-prototype-v3"`.
- Otherwise fall back to the last non-empty segment.
- Strip a trailing `index.html`; URL-decode the segment.
- Empty path (`/`) → `"unknown"`.

**`parseDevice(userAgent)`** — best-effort readable string, e.g.
`"Desktop — macOS"`, `"Mobile — iOS"`, `"Mobile — Android"`. Unknown → `"unknown"`.

**`parseBrowser(userAgent)`** — best-effort name + major version, e.g.
`"Chrome 124"`, `"Safari 17"`, `"Firefox 126"`. Unknown → `"unknown"`.

**`buildFields(body)`** — returns the Airtable `fields` object with the exact
column names and values:

- `Timestamp` — server-generated ISO 8601 (authoritative).
- `Name`, `Email`, `Comment`, `Context` — from the validated body.
- `Page URL` — `body.pageUrl`.
- `Deploy Version` — `parseDeployVersion(body.pageUrl)`.
- `Prototype` — `parsePrototype(body.pageUrl)`.
- `Device` — `parseDevice(body.userAgent)`.
- `Browser` — `parseBrowser(body.userAgent)`.

### Environment variables

```
AIRTABLE_API_KEY
AIRTABLE_BASE_ID
AIRTABLE_TABLE_ID
```

## Component 3 — Demo page (`demo/index.html`)

A simple mock "prototype" page — enough headings/sections and vertical length to
exercise the `Context` hint (title, visible heading, scroll %) — that loads the
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
  columns above; make `Timestamp` a Date field), obtaining API key / base id /
  table id, local testing with `netlify dev`, deploying, and the embed snippet.
- **`DECISIONS.md`** — running log of the decisions in this spec.
- **`README.md`** — overview + quick start + embed snippet.

## Testing approach

- **Pure helpers are unit-tested** with Node's built-in `node:test` runner — no
  test dependencies. Targets:
  - `parseDeployVersion(pageUrl)` — local / deploy-preview / unknown.
  - `parsePrototype(pageUrl)` — convention path, deeper sub-route, non-convention
    fallback, trailing `index.html`, root.
  - `parseDevice(userAgent)` / `parseBrowser(userAgent)` — representative agents.
  - `validate(body)` — required fields and email format.
  - `buildFields(body)` — exact column names/order, derived values, server
    Timestamp present.
- The function exposes its pure helpers for import by the test runner without a
  live network.
- **Widget DOM behavior** (button toggle, drag, persistence, `captureContext`,
  submit/success/error states) is verified manually via `demo/index.html` under
  `netlify dev`.

## Decisions log (rationale)

- **Shadow DOM** over scoped CSS or iframe — only approach that guarantees
  non-interference in both directions while staying a single dependency-free
  file. iframe was rejected as overkill (YAGNI) for a small form.
- **Name + Comment required; Email optional** by default, with
  `data-require-email` toggle for client-facing deploys.
- **Remember name/email (and panel position) in `localStorage`** — reduces
  friction for repeat commenters; nothing is sent until submit.
- **Panel stays open after submit** with a transient "Sent ✓" — visitors
  routinely leave more than one note.
- **Minimize + drag** — minimize (button toggle) keeps the prototype visible;
  drag-by-header moves the panel off whatever they're looking at.
- **Prototype slug via convention** — `/standalone/<author>/<prototype>` →
  prototype segment, robust to deeper sub-routes; falls back to last segment.
  A single deploy-preview hosts many prototypes, so `Deploy Version` alone is
  insufficient.
- **`Context` auto hint** — single-page prototypes change state without changing
  the URL, and Phase 1 has no screenshots; a title + visible-heading + scroll
  breadcrumb is a zero-friction approximation. Precise state = Phase 2.
- **No Author column** — keep the schema lean; author is recoverable from
  `Page URL` if ever needed.
- **All parsing server-side** — the widget stays a thin DOM layer; parsers are
  pure and node-testable from the function. `Context` is the only client-derived
  field because it needs the DOM.
- **Server sets Timestamp** — authoritative, not spoofable by the client.
- **Server maps fields** to exact Airtable column names — keeps the widget
  payload decoupled from the Airtable schema.

## Out of scope (Phase 1)

Screenshots / annotation (Phase 2), ratings or categories, any authentication,
multiple Airtable tables/bases.
