# Layer — Phase 2 Design (Screenshots & Annotation)

**Date:** 2026-06-24
**Status:** Approved (pending implementation plan)
**Builds on:** `docs/superpowers/specs/2026-06-22-layer-phase1-design.md`

## Overview

Phase 1 ships text feedback (name, email, comment) plus an auto-captured
`Context` breadcrumb. That breadcrumb explicitly cannot distinguish modal/tab
states that share the same scroll position and heading — Phase 1 parked
"precise per-state capture" here.

**Phase 2 adds an opt-in screenshot, with optional annotation, attached to a
feedback submission.** The visitor clicks "Add screenshot", captures (or, on
unsupported devices, uploads) an image of exactly what they're looking at,
optionally marks it up (box / arrow / freehand / text), and it is attached
inline to the Airtable row alongside their comment.

## Design principles (carried from Phase 1)

- **Zero runtime dependencies.** No bundled libraries, no CDN loads. Capture
  uses the browser-native Screen Capture API; everything else is hand-written.
- **Single embeddable file.** `widget/layer.js` stays one hand-authored file
  served from one `<script>` tag — no build step, no second request.
- **Full Shadow-DOM isolation.** All new UI (guided sheet, annotation overlay)
  lives inside the existing shadow root.
- **Screenshot is always optional.** Text-only feedback stays exactly one step;
  a screenshot never blocks or delays a comment.
- **Fidelity over convenience.** A subtly-wrong rasterization of a design
  prototype is worse than no image, so we never re-render the DOM ourselves.

## Why these choices (decisions log)

- **Native `getDisplayMedia()` over a DOM rasterizer (e.g. html2canvas).**
  Native capture is pixel-perfect, zero-dependency, and keeps `layer.js` a thin,
  readable file teams can audit before embedding. A DOM rasterizer adds ~50KB and
  renders real apps (web fonts, shadows, transforms, CORS images, canvas/WebGL)
  unreliably — failing hardest on exactly the design prototypes Layer serves.
- **Upload fallback for iOS, not a rasterizer.** No web API can capture the
  screen on iOS in any browser (all iOS browsers are WebKit; Apple has never
  implemented the Screen Capture API). The only zero-dependency, full-fidelity
  option there is to let the visitor attach their own OS screenshot. This also
  doubles as a fallback for locked-down desktop browsers.
- **iOS uploads attach as-is (no in-widget editor).** iOS has excellent built-in
  screenshot markup; routing uploads through our editor would add touch-editing
  complexity for little gain. The in-widget editor runs on the native-capture
  path only.
- **Inline Airtable attachment over a stored URL + link.** An inline,
  clickable thumbnail in the feedback row is the payoff when triaging feedback,
  and it avoids standing up image hosting. Cost: one extra Airtable API call and
  one extra env var.
- **Comment saved before the screenshot is attached.** The written feedback is
  the irreplaceable part; image attachment is best-effort and must never cause a
  comment to be lost.
- **Annotations stored as vectors, rasterized at attach time.** Keeps marks
  crisp at the image's natural resolution regardless of the on-screen canvas
  size, and keeps `Undo` trivial (pop the shape list).

## Architecture & data flow

```
Visitor on prototype, panel open
  → clicks "Add screenshot"
  → getScreenshot():
       getDisplayMedia supported?  (desktop + Android)
         YES → capture one frame (Layer UI hidden for the grab)
             → openAnnotator(blob) → box/arrow/freehand/text → Attach
             → rasterize at natural res → JPEG data URL
         NO  → guided capture sheet (device-specific hint)
             → <input type="file" accept="image/*"> → image as-is → JPEG data URL
  → panel shows thumbnail + "Screenshot attached ✓ · Remove"
  → Send: POST JSON (Phase 1 fields + optional `screenshot` data URL)

Netlify function (submit-feedback):
  validate text (unchanged)
  → create Airtable record via buildFields()  ← comment always saved here
  → if screenshot present AND AIRTABLE_SCREENSHOT_FIELD_ID set:
        POST base64 to content.airtable.com .../uploadAttachment
  → 200 { ok:true, screenshotAttached:<bool> }
```

Before sending, the widget caps the image's long edge at **~1600px** and encodes
**JPEG** (typically <1MB — safely under Netlify's 6MB request-body limit; well
under Airtable's 5MB upload-endpoint limit).

## Component 1 — Widget additions (`widget/layer.js`)

`layer.js` remains a single IIFE inside the existing shadow root, organized into
new cohesive functions alongside the Phase 1 code.

### Config (new)

- `data-screenshots` — when `"false"`, the screenshot feature is hidden
  entirely (button never shown). Default: enabled.

### Capture button

- A "📷 Add screenshot" control in the panel, above Send. Hidden when
  `data-screenshots="false"`.
- Shown on all platforms; the *path* it triggers is feature-detected at click
  time, not the button's visibility (so the upload fallback is always reachable).

### `getScreenshot()` — dispatcher

- If `navigator.mediaDevices?.getDisplayMedia` exists → **native path**.
- Else → **upload path**.
- Resolves to a JPEG data URL (annotated or as-is), or `null` if the visitor
  cancels.

### Native capture path (desktop + Android)

1. Call `getDisplayMedia({ video: { ... }, preferCurrentTab: true })`
   (`preferCurrentTab` is a progressive enhancement; ignored where unsupported).
2. Hide the Layer host element (`visibility:hidden`) for the frame grab so the
   widget isn't in the shot; draw one video frame to an offscreen canvas; stop
   all tracks; restore the host.
3. Pass the frame to `openAnnotator(...)`.
4. On cancel of the share prompt (user dismisses), resolve `null` quietly.

### `openAnnotator(image)` — full-screen annotation overlay (native path only)

- A fixed, full-viewport overlay inside the shadow root with a dark backdrop.
- The image is drawn to a canvas scaled to fit the viewport.
- **Toolbar:** Box · Arrow · Freehand · Text · Undo · Clear · Cancel · Attach.
  Stroke color is fixed to the accent `#FB35CF`.
- **Shape model:** an ordered array of shapes, each with coordinates normalized
  to image space:
  - `box` — `{x,y,w,h}` from pointer-drag.
  - `arrow` — `{x1,y1,x2,y2}`, rendered as a line with an arrowhead.
  - `draw` — `{points:[...]}` freehand polyline captured during a drag.
  - `text` — `{x,y,text}`: tap to place a caret, type into a small input,
    Enter (or blur) commits. (Repositioning after commit is out of scope.)
- **Undo** pops the last shape; **Clear** empties the list. The canvas is
  redrawn from the shape list on every change.
- **Pointer events** (`pointerdown/move/up`) with `touch-action:none` on the
  canvas cover mouse and touch (Android).
- **Attach:** render a fresh canvas at the image's natural (capped) resolution —
  draw the image, then each shape scaled from normalized coords — and
  `toDataURL('image/jpeg', ~0.85)`. Resolve that data URL.
- **Cancel:** resolve `null`; discard the image.

### Upload path (iOS + unsupported / locked-down browsers)

- **Guided capture sheet** (overlay inside the shadow root):
  - Step 1: "Take a screenshot now" with a **device-specific hardware hint** —
    iOS: "Side + Volume Up"; Android: "Power + Volume Down" — and "It saves to
    your Photos."
  - Step 2: a large **"Choose screenshot"** button backed by
    `<input type="file" accept="image/*">`.
  - A close (✕) control cancels (resolve `null`).
- The chosen file is read, downscaled/encoded to a JPEG data URL, and attached
  **as-is** — no annotation editor on this path.

### Panel integration

- After a screenshot resolves, the panel shows a **thumbnail + "Screenshot
  attached ✓ · Remove"**. Remove clears the held image and restores the
  "Add screenshot" control.
- The held screenshot is kept in memory only (never in `localStorage`).
- On submit, if a screenshot is held, the POST body includes
  `screenshot: "<data URL>"`.

### Submit lifecycle (extends Phase 1)

- Unchanged for text. If a screenshot is held, it is sent in the body.
- **Success with `screenshotAttached:true`** (or no screenshot sent): Phase 1
  behavior — clear comment, keep name/email, transient "Sent ✓", panel stays
  open; also clear the held screenshot.
- **Success with `screenshotAttached:false` while a screenshot was sent:** treat
  as success (the comment is saved) but show a soft note: "Comment saved —
  screenshot couldn't attach." Clear the comment as usual.
- **Failure (non-2xx / network):** Phase 1 behavior — preserve all field values
  **and the held screenshot** so the visitor can retry.

## Component 2 — Function changes (`netlify/functions/submit-feedback.js`)

### New pure helper (in `lib/parse.js`, unit-tested)

**`parseDataUrl(dataUrl)`** — parse a `data:image/...;base64,...` string into
`{ contentType, base64, filename }`, or `null` if it is not a well-formed
base64 image data URL of an allowed type (`image/jpeg`, `image/png`). The
filename is derived from the content type (e.g. `screenshot.jpg`).

### Handler flow

1. Method/JSON/validation handling: **unchanged** (text validation does not
   consider the screenshot).
2. Env: reads the Phase 1 trio plus optional **`AIRTABLE_SCREENSHOT_FIELD_ID`**.
   The Phase 1 trio missing → `500` as before.
3. **Create the record** via `buildFields(body, nowIso)` (no screenshot in the
   fields — `buildFields` is unchanged). Capture the returned record `id`.
   Airtable create failure → `502` (unchanged).
4. **Attach (best-effort), only if** the body has a `screenshot` that
   `parseDataUrl` accepts **and** `AIRTABLE_SCREENSHOT_FIELD_ID` is set:
   `POST https://content.airtable.com/v0/{AIRTABLE_BASE_ID}/{recordId}/{AIRTABLE_SCREENSHOT_FIELD_ID}/uploadAttachment`
   with `Authorization: Bearer {key}` and body
   `{ contentType, file: <base64>, filename }`.
   - Success → `screenshotAttached = true`.
   - Any failure here (non-2xx, network throw, invalid data URL, missing field
     id) → log server-side, `screenshotAttached = false`. **The created record
     is left as-is; the request still succeeds.**
5. Respond `200 { ok: true, screenshotAttached }`.

### Resilience invariant

Once the record is created, the request returns success. A screenshot problem
degrades to "comment saved without image", never to a lost comment.

## Component 3 — Airtable schema change

Append one column (order otherwise unchanged):

```
Timestamp | Name | Email | Page URL | Deploy Version | Prototype | Context | Comment | Device | Browser | Screenshot
```

- **`Screenshot`** — **Attachment** field.

`buildFields` does **not** write this column; it is populated only by the
best-effort attachment call, which requires the field's **id** (not name) — hence
the `AIRTABLE_SCREENSHOT_FIELD_ID` env var.

## Component 4 — Environment & config files

- New env var **`AIRTABLE_SCREENSHOT_FIELD_ID`** (the `Screenshot` field id,
  `fldXXXXXXXXXXXXXX`).
- `.env` and `.env.example` must gain this line. **Environment note:** the
  `teamsnap-secops` hook blocks the agent from reading/writing any `.env*` file,
  so these edits are performed by the **user** via the in-session `!` shell
  prefix (their action, not the agent's). `git add` of `.env.example` is not
  blocked, so the agent can stage/commit it afterward.
- `docs/setup.md` — document the new column, how to find its field id, and the
  new env var.
- `demo/index.html` — mention the screenshot button; no code change required for
  the feature to work (the widget self-detects the path).

## Testing approach

### Unit (`node:test`, no dependencies)

- **`parseDataUrl`** — valid `image/jpeg`, valid `image/png`, rejects: plain
  string, non-image data URL, disallowed type, missing base64.
- **Handler** (mock `fetch` + env):
  - No screenshot → exactly one `fetch` (create); `200 { ok:true,
    screenshotAttached:false }`; behavior otherwise identical to Phase 1.
  - Screenshot happy path → two `fetch` calls; the second hits the
    `…/{recordId}/{fieldId}/uploadAttachment` URL with `Bearer` auth and a body
    carrying `contentType` + base64; `200 { ok:true, screenshotAttached:true }`.
  - Screenshot present but `AIRTABLE_SCREENSHOT_FIELD_ID` unset → only the
    create `fetch`; `200 { …screenshotAttached:false }`.
  - Attachment upload returns non-2xx (or throws) → record still created;
    `200 { …screenshotAttached:false }` (failure logged).
  - Invalid `screenshot` data URL → create only; `200 { …:false }` (never 400).

### Manual (demo page under `netlify dev`)

- Native path: capture (verify the Layer UI is absent from the shot), draw each
  tool, Undo, Clear, Attach, Send; confirm the row in Airtable has an inline
  `Screenshot` thumbnail.
- Upload path: temporarily force the fallback (or test on iOS) — guided sheet
  shows the right hint; choose a file; attach; Send; thumbnail appears.
- Remove clears the held screenshot. Network-failure submit preserves the
  comment and the held screenshot.

## Out of scope (Phase 2)

Drag-to-reposition text after placement; multi-color or stroke-width pickers;
multiple screenshots per submission; video/GIF capture; server-side rendering;
editing iOS-uploaded images inside the widget; persisting a held screenshot
across reloads.
