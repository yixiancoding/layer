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
