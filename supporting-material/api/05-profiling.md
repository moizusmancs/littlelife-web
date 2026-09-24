# Phase 5 — Profiling (`internal/profiling`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Profiling owns two small, always-personal aggregates: a citizen's **display name** (`Profile`) and
their **notification settings** (`AlertPreferences` — which channels reach them, minimum severity
to bother them at all). Every route in this module operates on the **caller's own** data only —
there is no path parameter anywhere in this module, and no way to view or edit anyone else's
profile or preferences through these routes.

| Group | Base path | Middleware |
|---|---|---|
| `profile` | `/profile` | `RequireAuth` (every route) |

**Cross-reference:** Identity's `GET /auth/me` (documented [there](00-identity.md#get-authme))
deliberately stays "thin" — just `id`/`email`/`role`/`status`/`email_verified`, no name, no
preferences. This module's `GET /profile` is the separate call for the rest.

**Both aggregates are created automatically — you will never need to "create" one.** Every account
gets a `Profile` row (name starts as an empty string, not absent) and a fully-defaulted
`AlertPreferences` row the instant it's registered, atomically with the account itself (part of
Identity's own `POST /auth/register` transaction, [documented there](00-identity.md#post-authregister)).
In practice this means `GET /profile` and `GET /profile/alert-preferences` will essentially never
404 for a real, currently-authenticated account — the `404` responses documented below exist as a
defensive fallback in the code, not a state you should expect to actually encounter through normal
use of this API.

---

## FE-3 (partial) — View/edit personal details

**What it covers:** the personal-details half of M1 FE-3 (the deactivate/delete half lives in
Identity, [documented there](00-identity.md#fe-3-partial--deactivate--delete-own-account)).
Currently, "personal details" means exactly one field: `name`.

**Routes:** `GET /profile`, `PATCH /profile`.

### `GET /profile`

**Auth required:** Yes.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | see shape below |
| No profile row exists (should not occur for a real account — see the note above) | `404` | `{"error":"profile not found"}` |

```json
{
  "id": "1a2b3c4d-...",
  "name": "",
  "created_at": "2026-09-20T06:44:36Z",
  "updated_at": "2026-09-20T06:44:36Z"
}
```
**Note there is no `account_id` field in this response** — the caller's identity is implicit
(it's always "your own" profile), not echoed back. A freshly-registered account that has never
called `PATCH /profile` will have `name: ""` — this is the expected initial state, not an error
condition, and your UI should treat it as "name not yet set" (e.g. prompt the user to fill it in)
rather than displaying a literal blank.

---

### `PATCH /profile`

**Auth required:** Yes.

**Request**
```json
{ "name": "Aisha Khan" }
```
`name` is a [partial-patch](README.md#patch-semantics--real-partial-patch-not-full-replace)
pointer field — but since it's currently the **only** field this route accepts, omitting it (an
empty body `{}`, or omitting the key entirely) always fails; there is nothing else to update.

**Behavior**

`name` cannot be set back to blank/whitespace-only — the empty-string initial state from
registration is only ever a transient "not yet set" marker, not something a citizen can
deliberately choose via this edit action.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated profile object (same shape as `GET /profile`) |
| `name` omitted entirely | `400` | `{"error":"at least one field must be provided to update"}` |
| `name` present but blank/whitespace-only | `400` | `{"error":"name is required"}` |
| No profile row exists (see the note above) | `404` | `{"error":"profile not found"}` |

---

## FE-3 (partial) — Alert preferences

**What it covers:** the notification-settings half of M1 FE-3 — which delivery channels are
enabled and the minimum alert severity that should ever reach this account at all.

**Routes:** `GET /profile/alert-preferences`, `PATCH /profile/alert-preferences`.

### `GET /profile/alert-preferences`

**Auth required:** Yes.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | see shape below |
| No alert-preferences row exists (should not occur — see the note above) | `404` | `{"error":"alert preferences not found"}` |

```json
{
  "id": "2b3c4d5e-...",
  "push_enabled": true,
  "sms_enabled": true,
  "whatsapp_enabled": false,
  "voice_call_enabled": true,
  "language": "en",
  "minimum_severity": "general_advisory",
  "created_at": "2026-09-20T06:44:36Z",
  "updated_at": "2026-09-20T06:44:36Z"
}
```
These are the exact defaults every account starts with: push/SMS/voice-call **on**, WhatsApp
**off**, `language: "en"`, `minimum_severity: "general_advisory"` (the lowest tier — everything
gets through by default; a citizen has to explicitly raise this to filter out lower-severity
alerts). `minimum_severity` is one of, from lowest to highest: `general_advisory`, `watch`,
`warning`, `critical_emergency`.

---

### `PATCH /profile/alert-preferences`

**Auth required:** Yes.

**Request** — true [partial patch](README.md#patch-semantics--real-partial-patch-not-full-replace),
all six fields optional/nilable, at least one required:
```json
{ "whatsapp_enabled": true, "minimum_severity": "watch" }
```
- `push_enabled`, `sms_enabled`, `whatsapp_enabled`, `voice_call_enabled` — plain booleans, no
  validation beyond type.
- `language` — if present, cannot be blank/whitespace-only.
- `minimum_severity` — if present, must be one of the four valid values.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated alert-preferences object |
| Every field omitted | `400` | `{"error":"at least one field must be provided to update"}` |
| `language` present but blank | `400` | `{"error":"language is required"}` |
| `minimum_severity` present but not one of the four values | `400` | `{"error":"minimum_severity must be one of: general_advisory, watch, warning, critical_emergency"}` |
| No alert-preferences row exists (see the note above) | `404` | `{"error":"alert preferences not found"}` |

**Frontend handling:** as with every partial patch in this API, only send the fields the user
actually changed in a settings form — omit the rest rather than round-tripping the currently
displayed values, especially for the four boolean channel toggles where an accidental `false`
round-trip would silently disable a channel the user never touched.

---

## Open item, not yet built

Per the source specification, "privacy settings" was called out as part of this module's
responsibility but remains an open design question — no fields or routes exist for it in this API
today. Don't build frontend UI assuming a privacy-settings endpoint exists yet.
