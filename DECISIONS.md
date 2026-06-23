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
