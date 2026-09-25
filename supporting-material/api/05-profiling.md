# Phase 5 — Profiling (`internal/profiling`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Profiling owns two small, always-personal aggregates: a citizen's **display name and optional home
region** (`Profile`) and their **notification settings** (`AlertPreferences` — which channels reach them, minimum severity
to bother them at all). Every route in this module operates on the **caller's own** data only —
there is no path parameter anywhere in this module, and no way to view or edit anyone else's
profile or preferences through these routes.

It also serves one **read-only view** across other modules' data: the caller's own
[activity timeline](#fe-4--activity-timeline) (`GET /profile/activity-timeline`) — everything the
account has reported, voted on, requested, donated or sighted, newest first.

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
"Personal details" means two fields: `name`, and an **optional** home region — the region the
citizen says they live in (the onboarding "pick your region" step).

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
  "name": "Aisha Khan",
  "home_region_id": "a17c22d0-...",
  "home_region_name": "Sukkur City",
  "home_region_level": "tehsil",
  "home_region_path": "Sindh › Sukkur › Sukkur City",
  "created_at": "2026-09-20T06:44:36Z",
  "updated_at": "2026-09-20T06:44:36Z"
}
```
**The four `home_region_*` keys are omitted entirely — not `null`, not `""` — while the citizen has
not picked a home region.** That is a normal, complete profile (see
[Home region is optional](#home-region-is-optional) below), and a citizen who never sets one gets
exactly the response shape this route had before the field existed:
```json
{ "id": "1a2b3c4d-...", "name": "", "created_at": "...", "updated_at": "..." }
```
Check for the key's presence rather than assuming it.

- `home_region_name` / `home_region_level` — the region's name and level (`province`, `district` or
  `tehsil`), so the UI can show it without loading the region list.
- `home_region_path` — the region's name preceded by its ancestors', root first, joined with ` › `
  (a space, U+203A, a space); a top-level region's path is just its own name. It exists so a header
  like "Sukkur City, Sukkur" can be built without a second request — split it on ` › ` and take the
  last two parts (or the last, for a province).

**Note there is no `account_id` field in this response** — the caller's identity is implicit
(it's always "your own" profile), not echoed back. A freshly-registered account that has never
called `PATCH /profile` will have `name: ""` — this is the expected initial state, not an error
condition, and your UI should treat it as "name not yet set" (e.g. prompt the user to fill it in)
rather than displaying a literal blank.

---

### `PATCH /profile`

**Auth required:** Yes.

**Request** — a true [partial patch](README.md#patch-semantics--real-partial-patch-not-full-replace);
send only what changed:
```json
{ "name": "Aisha Khan", "home_region_id": "a17c22d0-..." }
```
- `name` — optional.
- `home_region_id` — optional, and has three states (same convention as `parent_region_id` on
  [`PATCH /admin/regions/{id}`](01-geo.md#patch-adminregionsid)):
  - **omit it** (or send JSON `null` — indistinguishable from omitting) → unchanged;
  - **`""`** → clear it, back to "no home region";
  - **a region UUID** → set or change it. **Any level is accepted** (province, district or tehsil);
    the backend does not require the deepest one.

At least one of the two must be present.

**Behavior**

`name` cannot be set back to blank/whitespace-only — the empty-string initial state from
registration is only ever a transient "not yet set" marker, not something a citizen can
deliberately choose via this edit action.

**Validation happens before anything is written**, so a request that pairs a good field with a bad
one changes nothing — e.g. a valid `name` with a malformed or unknown `home_region_id` does **not**
save the name. On success the response is the freshly re-read profile, so it already carries the new
region's name, level and path.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated profile object (same shape as `GET /profile`) |
| Neither field present (empty body, or only `null`s) | `400` | `{"error":"at least one field must be provided to update"}` |
| `name` present but blank/whitespace-only | `400` | `{"error":"name is required"}` |
| `home_region_id` present, non-empty, not a valid UUID | `400` | `{"error":"home_region_id must be a valid uuid"}` |
| `home_region_id` a well-formed UUID but no such region | `404` | `{"error":"region not found"}` |
| A field has the wrong JSON type (e.g. a number for `home_region_id`) | `400` | bind-failure shape |
| No profile row exists (see the note above) | `404` | `{"error":"profile not found"}` |

### Home region is optional

**Picking a home region is optional and skippable.** The backend has no notion of a "complete"
profile: nothing is blocked, gated or degraded for a citizen who has no home region, every existing
profile started without one, and the onboarding step can simply be skipped (the mockup's region
picker has a "Skip"). If your product wants to nudge people to set it, do that in the client — the
API will never require it.

- Build the picker from the public [`GET /regions`](01-geo.md#get-regionslevelparent_region_id)
  (drill down province → district → tehsil with `?parent_region_id=`); save the choice with
  `PATCH /profile`.
- **Show it from the profile response alone** — `home_region_name` and `home_region_path` mean you do
  not need to load the region list just to display it.
- If a region is later removed from the system, citizens who had chosen it silently go back to "no
  home region" (their profile is otherwise untouched, and `GET /profile` keeps returning `200`).

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

## FE-4 — Activity timeline

**What it covers:** M1 FE-4, the chronological "what have I done" list on a citizen's profile.
It is **read-only** and belongs to no single module: it merges the caller's own rows from seven
tables that Community Intelligence, Facilities and Relief Operations own, into one list ordered by
time. Nothing here writes anything.

**Route:** `GET /profile/activity-timeline`.

### `GET /profile/activity-timeline`

**Auth required:** Yes — any role. It returns the **caller's own** activity only: there is no path
or query parameter that names an account, so there is no way to ask for anyone else's.

**Query parameters** (all optional)

| Param | Meaning | Default / limits |
|---|---|---|
| `limit` | events per page | default `25`, max `100` |
| `offset` | events to skip | default `0` |
| `type` | show only one kind of event (one of the values in the table below) | absent (or empty) = every kind |

`limit` / `offset` follow the API's [usual pagination](README.md#pagination): a non-numeric,
zero, negative or over-max `limit` is reset to `25` (so `limit=1000` returns 25, **not** 100), and
a negative or non-numeric `offset` is reset to `0` — never a `400`. `type` is matched exactly:
`Donation` or `donation,incident_report` is a `400`, not a filter that matches nothing.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success — including an account with no activity at all, and an `offset` past the end | `200 OK` | a JSON array (`[]` when empty), never `null` and never a `404` |
| `type` is not one of the seven values | `400` | `{"error":"type must be one of: incident_report, incident_vote, aid_request, donation, status_report, missing_person_report, missing_person_sighting"}` |
| Not signed in / bad token | `401` | the usual |

```json
[
  {
    "id": "incident_report:4e5f6a7b-...",
    "type": "incident_report",
    "occurred_at": "2026-09-20T06:00:00Z",
    "subject_id": "4e5f6a7b-...",
    "detail": { "category": "flooding", "status": "verified" }
  },
  {
    "id": "incident_vote:9a8b7c6d-...",
    "type": "incident_vote",
    "occurred_at": "2026-09-19T17:12:00Z",
    "subject_id": "4e5f6a7b-...",
    "detail": { "vote_type": "upvote" }
  }
]
```

- `id` — `"<type>:<id of the source row>"`. Unique and stable: key a list on it, and use it to dedupe
  across pages.
- `type` — one of the seven values below.
- `occurred_at` — the source row's own timestamp, RFC 3339 in **UTC** (`Z`). It can carry
  fractional seconds (`2026-09-24T17:50:32.269676Z`); any RFC 3339 parser accepts both forms.
- `subject_id` — the id of the thing the event is *about*, so the screen can link to it. Always
  present (a UUID string).
- `detail` — always an object, holding the few facts worth printing as **structured values, not
  prose** (the client builds the sentence, so it can be translated). Keys are listed per type
  below. **Ignore keys you don't know** — a key may be added later.
- Nothing about any other account is included: no other account's id, name or email.

| `type` | Comes from | `occurred_at` is | `subject_id` is | `detail` keys |
|---|---|---|---|---|
| `incident_report` | a report the caller filed | the report's `created_at` | the report | `category` (`flooding` / `blocked_road` / `other_hazard`), `status` (`reported` / `verified` / `in_progress` / `resolved` / `rejected`) |
| `incident_vote` | a vote the caller cast on a report | the vote's `created_at` | the report voted on | `vote_type` (`upvote` / `downvote`) |
| `aid_request` | an aid request the caller made | its `created_at` | the aid request | `category` (`food` / `water` / `shelter` / `medical` / `other`), `severity` (`low` / `medium` / `high` / `critical`), `status` (`pending` / `in_progress` / `fulfilled` / `cancelled`) |
| `donation` | a donation the caller made | its `collected_at` | the **campaign** donated to | `amount` (a JSON number), `status` (`collected` / `allocated` / `delivered`) |
| `status_report` | an open/closed status report the caller filed on a place | the report's `created_at` | the **place** — a shelter or an essential location | `status` (`open` / `closed`), `place_type` (`shelter` / `essential_location`) |
| `missing_person_report` | a missing-person report the caller filed | its `created_at` | the missing person | `status` (`missing` / `found` / `deceased`) |
| `missing_person_sighting` | a sighting the caller reported | the sighting's `created_at` | the missing person seen | *(none — `{}`)* |

**Ordering.** Newest first by `occurred_at`; two events at the same instant are ordered by `id`,
descending, so paging is stable — walking a list page by page never repeats or skips an event, even
when many events share a timestamp.

**Filtering.** `type` filters *before* paging, so `type=donation&limit=10` is the caller's ten most
recent donations, not "donations among the ten most recent events".

**Not included.** Messages (the roadmap's "interactions") aren't in the list — the Communication
module isn't built yet. Adding a type later is additive: a client that ignores unknown `type`
values keeps working.

**Frontend handling**
- **`place_type` is an addition** to the frontend's original request. A `status_report`'s
  `subject_id` is either a shelter's id or an essential location's id — the two live in different
  tables — and the id alone can't tell you which screen to link to. `place_type` does.
- **`subject_id` may not open.** The event records something the caller did, so it stays in the
  list even if its subject is later hidden or made unavailable; a link to it can then lead to a
  not-found or forbidden screen. Treat that as normal. Only link where the target screen exists;
  otherwise show the event as plain text.
- **"Load more"** = re-request with `offset` increased by the number of events you already hold. An
  empty array (or one shorter than `limit`) means there is no more.

---

## Open item, not yet built

Per the source specification, "privacy settings" was called out as part of this module's
responsibility but remains an open design question — no fields or routes exist for it in this API
today. Don't build frontend UI assuming a privacy-settings endpoint exists yet.
