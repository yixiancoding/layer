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
