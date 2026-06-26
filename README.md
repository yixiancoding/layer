# Layer

A zero-install feedback widget for live prototypes. Drop in one `<script>` tag — visitors can leave a comment and attach an annotated screenshot. Every submission lands as a row in your Airtable base.

**No account required for visitors. No npm install. No build step.**

---

## How it works

```
Visitor clicks the widget → fills in feedback + optional screenshot
  → POST to a Netlify function
  → row created in Airtable (screenshot attached inline)
```

The widget is a single hand-authored JS file served from one `<script>` tag. It renders entirely inside a Shadow DOM so its styles never conflict with the prototype.

---

## Self-hosting in 15 minutes

### 1. Create the Airtable table

Create a table with these fields in this order (names must match exactly):

| Field          | Type                |
| -------------- | ------------------- |
| Timestamp      | Date (include time) |
| Name           | Single line text    |
| Email          | Email               |
| Page URL       | URL                 |
| Deploy Version | Single line text    |
| Prototype      | Single line text    |
| Context        | Long text           |
| Comment        | Long text           |
| Device         | Single line text    |
| Browser        | Single line text    |
| Screenshot     | Attachment          |

### 2. Get your Airtable credentials

- **API key** — create a Personal Access Token at [airtable.com/create/tokens](https://airtable.com/create/tokens) with the `data.records:write` scope and access to your base
- **Base ID** — from the URL of your base (`appXXXXXXXXXXXXXX`)
- **Table ID** — from the Airtable API docs for your base (`tblXXXXXXXXXXXXXX`)
- **Screenshot field ID** — from the Airtable API docs, find the Screenshot row and copy the field ID (`fldXXXXXXXXXXXXXX`)

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```dotenv
AIRTABLE_API_KEY=patXXXXXXXX...
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_TABLE_ID=tblXXXXXXXXXXXXXX
AIRTABLE_SCREENSHOT_FIELD_ID=fldXXXXXXXXXXXXXX
```

### 4. Run locally

```bash
npm i -g netlify-cli
netlify dev
```

Open [http://localhost:8888/demo/](http://localhost:8888/demo/) and submit feedback — a row should appear in Airtable.

### 5. Deploy

Push to a repo connected to Netlify (or run `netlify deploy`). Add the four environment variables under **Site settings → Environment variables**. That's it.

---

## Embed in a prototype

Add one tag before `</body>`:

```html
<script
  src="https://your-site.netlify.app/widget/layer.js"
  data-feedback-url="https://your-site.netlify.app/.netlify/functions/submit-feedback">
</script>
```

Or point at your own deploy. CORS is open so the widget can be embedded on any domain.

### Options

| Attribute | Default | Description |
|---|---|---|
| `data-feedback-url` | `/.netlify/functions/submit-feedback` | URL of the Netlify function |
| `data-require-email` | `false` | Set to `"true"` to make email required |
| `data-screenshots` | `true` | Set to `"false"` to hide the screenshot button |

---

## Screenshot & annotation

Visitors can click **📷 Add screenshot** to attach an image to their feedback.

- **Desktop / Android** — captures the current tab using the browser's Screen Capture API, then opens an annotation overlay with Box, Arrow, Freehand, and Text tools
- **iOS / unsupported browsers** — shows a guided sheet with hardware shortcut instructions and a file picker

Screenshots are capped at 1600px on the long edge and encoded as JPEG before sending. Requires `AIRTABLE_SCREENSHOT_FIELD_ID` to be set — if omitted, feedback still works and screenshots are silently skipped.

---

## What gets captured automatically

Every submission includes:

- **Deploy Version** — parsed from the Netlify preview URL (`deploy-preview-N`) or `local`
- **Prototype** — parsed from the URL path (e.g. `/standalone/isa/my-prototype` → `my-prototype`)
- **Context** — page title + nearest visible heading + scroll percentage
- **Device** and **Browser** — from the user agent

---

## Development

```bash
netlify dev        # serve locally with live function
npm test           # run unit tests (node:test, no dependencies)
```

Tests cover the Netlify function and all parsing helpers. The widget (`widget/layer.js`) has no build step — edit it directly.

---

## Tech

- **Widget** — vanilla JS IIFE, Shadow DOM, no dependencies, no build step
- **Backend** — Netlify Function (Node.js)
- **Storage** — Airtable (REST API + content upload API for screenshots)

---

## License

MIT
