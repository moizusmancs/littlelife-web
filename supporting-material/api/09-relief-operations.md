# Phase 9 — Relief Operations, core (`internal/relief`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Relief Operations owns **aid requests** (a citizen asking for help, tracked through a role-scoped
lifecycle), **donation campaigns** and the **donation lifecycle** that funds them
(collection → allocation → delivery), and **missing person reports** with crowdsourced
**sightings**. This is the newest bounded context in the backend — 21 routes across four
aggregates, all built in one continuous phase, so the design patterns are the most consistent of
any phase documented so far (the same three-way role split, the same `uuid.Nil`-as-sentinel guard,
and the same "existence checked before authorization" ordering repeat across nearly every write
route below).

| Group | Base path | Middleware |
|---|---|---|
| aid requests | `/aid-requests*` | `RequireAuth` on every route — no `RequireRole` anywhere; allowed values/authorization differ by caller role, resolved inside each use case |
| donation campaigns | `/donation-campaigns*` | `RequireAuth` on write routes; both `GET`s are public ("full transparency") |
| donations | `/donation-campaigns/{id}/donations`, `/donations/{id}/*` | `RequireAuth` on every route (including the `GET`, unlike campaigns themselves) |
| missing persons + sightings | `/missing-persons*` | `RequireAuth` on `POST`s and the status `PATCH`; both `GET`s are public |
| `admin` | `/admin/missing-persons`, `/admin/donation-campaigns`, `/admin/aid-requests` | `RequireAuth`, `RequireRole("admin", "super_admin")` |

---

## FE-1 (M13) — Submit/track aid requests

**What it covers:** a citizen (or anyone — this is open to every role, not just citizens) asking
for help, and a three-way-scoped lifecycle for updating its status: the requester can withdraw it,
NGO staff operating in the request's region can progress it, and admins have unrestricted control.

**Routes:** `POST /aid-requests`, `GET /aid-requests/{id}`, `GET /aid-requests?mine=true`,
`PATCH /aid-requests/{id}/status`.

### `POST /aid-requests`

**Auth required:** Yes — **any** authenticated account, not just citizens (admins/NGO staff can
personally need aid too).

**Request**
```json
{ "category": "food", "description": "Need food for a family of 5.", "lat": 24.85, "lng": 67.02, "severity": "high" }
```
- `category` — required, one of `food`/`water`/`shelter`/`medical`/`other`.
- `description` — optional.
- `lat`/`lng` — required (bound as nilable pointers, so `lat: 0, lng: 0` — the equator/prime
  meridian — is correctly accepted as a real coordinate, not rejected as "missing").
- `severity` — required, one of `low`/`medium`/`high`/`critical`.

**Behavior**

Always creates the request as `status: "pending"`. `region_id` is never client-supplied — resolved
live via a spatial join at read time, same convention as every other geo-tagged aggregate in this
API. **Unlike incident reports or missing persons, there is no public "browse all aid requests"
route anywhere in this API** — visibility is role-scoped from the start (see `GET` below).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `category` missing/invalid | `400` | bind-failure shape (missing) or `{"error":"category must be one of: food, water, shelter, medical, other"}` |
| `lat`/`lng` missing | `400` | bind-failure shape |
| `severity` missing/invalid | `400` | bind-failure shape (missing) or `{"error":"severity must be one of: low, medium, high, critical"}` |

**Response body on success**
```json
{
  "id": "1dc0d4f7-...",
  "requester_account_id": "48434d1b-...",
  "category": "food",
  "description": "Need food for a family of 5.",
  "location": { "type": "Point", "coordinates": [67.02, 24.85] },
  "severity": "high",
  "status": "pending",
  "created_at": "2026-09-20T06:00:00Z",
  "updated_at": "2026-09-20T06:00:00Z"
}
```
`region_id` is omitted entirely until resolved (see `GET` below — it's never actually included in
*this specific* response since the row is brand-new and the field is only resolved at read time on
a fresh `SELECT`, not returned from the write itself in every case — treat its absence as normal).

---

### `GET /aid-requests/{id}`

**Auth required:** Yes. **A genuine three-way role split** — this route was extended specifically
because the status route below (which shares the identical split) needs a way for admin/NGO
callers to look a request up before or after acting on it:

- **The requester** (anyone else, by default): only their **own** request — `403` for anyone
  else's.
- **`ngo_admin`/`ngo_volunteer`**: only if the request's location falls within their own NGO's
  operational regions.
- **`admin`/`super_admin`**: unrestricted — any request.

**Existence is always checked before authorization** — a nonexistent `id` is always `404`, never a
misleading `403`, for all three caller types.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the request, same shape as `POST`'s response |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No request with that ID | `404` | `{"error":"aid request not found"}` |
| Requester viewing someone else's request | `403` | `{"error":"this aid request does not belong to you"}` |
| NGO staff, request outside their NGO's operational regions | `403` | `{"error":"this aid request is outside any region your ngo operates in"}` |
| NGO staff, caller has no NGO membership (should not normally occur) | `400` | `{"error":"account has no ngo membership"}` |

---

### `GET /aid-requests?mine=true`

**Auth required:** Yes.

**Query parameter:** `mine=true` — **required**, the literal string `"true"`. There is no unscoped
variant of this route.

**Behavior**

Returns every request the **caller themselves** submitted, newest first — this is always
self-scoped; there is no way to list someone else's requests through this route (NGO/admin
oversight uses `GET /admin/aid-requests` instead, [documented below](#fe-8-m15--admin-monitoring)).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `mine` missing or not exactly `"true"` | `400` | `{"error":"mine=true is required"}` |

---

### `PATCH /aid-requests/{id}/status`

**Auth required:** Yes. **The same three-way role split as `GET /aid-requests/{id}` above, but
each caller type is also restricted to a different set of allowed target values:**

| Caller | Allowed `status` values | Region/ownership restriction |
|---|---|---|
| `admin`/`super_admin` | any of `pending`/`in_progress`/`fulfilled`/`cancelled` | none |
| `ngo_admin`/`ngo_volunteer` | **only** `in_progress` or `fulfilled` | only if the request is within their own NGO's operational regions |
| the requester themselves | **only** `cancelled` | must be their own request |

**Request**
```json
{ "status": "in_progress" }
```

**Behavior**

The requester can withdraw their own request (`cancelled`) but cannot declare it fulfilled
themselves — only whoever is actually delivering aid (NGO staff or admin) can make that call.
Existence is checked before authorization, same as `GET`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated request |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `status` missing | `400` | bind-failure shape |
| No request with that ID | `404` | `{"error":"aid request not found"}` (checked before any of the role-specific checks below) |
| Requester attempts a value other than `cancelled` | `400` | `{"error":"you may only cancel your own aid request, not set it to another status"}` |
| Requester acts on someone else's request | `403` | `{"error":"this aid request does not belong to you"}` |
| NGO staff sets a value outside `{in_progress, fulfilled}` | `400` | `{"error":"status must be one of: in_progress, fulfilled"}` |
| NGO staff, request outside their operational regions | `403` | `{"error":"this aid request is outside any region your ngo operates in"}` |
| Any caller, `status` not a real enum value at all | `400` | `{"error":"status must be one of: pending, in_progress, fulfilled, cancelled"}` |

---

## FE-2 (M13) — Create/join/manage donation campaigns

**What it covers:** citizens and NGOs create fundraising campaigns; "joining" one (donating to it)
is covered by [FE-5 below](#fe-5-m13--donation-lifecycle-collection--allocation--delivery); this
FE covers create, public browse, and manage (edit/close).

**Routes:** `POST /donation-campaigns`, `GET /donation-campaigns?region_id=`,
`GET /donation-campaigns/{id}`, `PATCH /donation-campaigns/{id}`,
`POST /donation-campaigns/{id}/close`.

### `POST /donation-campaigns`

**Auth required:** Yes — any authenticated account.

**Request**
```json
{ "title": "Flood Relief Fund", "description": "Raising funds for flood victims.", "goal_amount": 500000, "region_id": "83754148-..." }
```
- `title` — required, non-blank.
- `description` — optional.
- `goal_amount` — optional; if provided, must be positive.
- `region_id` — optional. **Omitted or `null` means nationwide** (a genuine, intentional value —
  this table has no location column, so `region_id` is a direct fact, not resolved live). The
  literal all-zero UUID string is explicitly rejected (see the error table).

**Behavior — who "organizes" the campaign is derived from your role, never a request choice:**
- **`ngo_admin`**: the campaign is organized on behalf of the caller's own NGO. **`ngo_volunteer`
  is deliberately excluded from this** — a volunteer calling this route organizes **personally**
  (same as any other citizen), not on behalf of their NGO.
- **Everyone else** (including `ngo_volunteer`, `admin`, `super_admin`, and plain citizens):
  organizes personally — the caller's own account is the organizer.

There is no request field to choose between these — it's entirely determined by your JWT role.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `title` missing/blank | `400` | `{"error":"title is required"}` or bind-failure shape |
| `goal_amount` present and `<= 0` | `400` | `{"error":"goal_amount must be positive"}` |
| `region_id` is the literal all-zero UUID | `400` | `{"error":"region_id must be a valid uuid"}` (proactively rejected before it could collapse into "nationwide") |
| `region_id` malformed | `400` | `{"error":"region_id must be a valid uuid"}` |
| `region_id` well-formed, non-zero, but no such region exists | `404` | `{"error":"region not found"}` |

**Response body on success**
```json
{
  "id": "ac331280-...",
  "organizer_account_id": "079c358c-...",
  "title": "Flood Relief Fund",
  "description": "Raising funds for flood victims.",
  "goal_amount": 500000,
  "raised_amount": 0,
  "region_id": "83754148-...",
  "status": "active",
  "created_at": "2026-09-20T06:00:00Z",
  "updated_at": "2026-09-20T06:00:00Z"
}
```
**Exactly one of `organizer_account_id`/`ngo_id` is ever present** — the other is omitted entirely
(never both, never neither). `region_id` is omitted entirely for a nationwide campaign.
`raised_amount` always starts at `0` — see [FE-5 below](#fe-5-m13--donation-lifecycle-collection--allocation--delivery)
for the only way it ever increases.

---

### `GET /donation-campaigns?region_id=`

**Auth required:** No — public. This is deliberately "full transparency," unlike aid requests.

**Query parameter:** `region_id` — required.

**Behavior**

Returns every campaign targeted at this region **plus every nationwide campaign** — same
"include the unscoped ones too" convention as `GET /community-updates`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

---

### `GET /donation-campaigns/{id}`

**Auth required:** No — public.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | one campaign, same shape as `POST`'s response |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No campaign with that ID | `404` | `{"error":"donation campaign not found"}` |

---

### `PATCH /donation-campaigns/{id}`

**Auth required:** Yes. **Only the campaign's own manager** — for a citizen-organized campaign,
that's exactly the organizing account; for an NGO-organized one, that's `ngo_admin`(s) of that
specific NGO only (**not** any staff — confirmed a same-NGO `ngo_volunteer` cannot manage a
campaign their own NGO organized). **There is no admin override on this route** — a platform admin
cannot edit someone else's campaign through this endpoint (contrast with the donation-lifecycle
routes below, which deliberately do add an admin override).

**Request** — true [partial patch](README.md#patch-semantics--real-partial-patch-not-full-replace):
```json
{ "title": "Updated Title", "goal_amount": 750000 }
```
`title`, `description`, `goal_amount` — all optional/nilable, at least one required. `title`
cannot be cleared to blank. `goal_amount`, if provided, always **replaces** the existing goal
outright (there's no way to clear an existing goal back to "none" via this route).
**`region_id` is deliberately not patchable at all** — not even present as a field on this
request.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated campaign |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No campaign with that ID | `404` | `{"error":"donation campaign not found"}` |
| Caller doesn't manage this campaign (wrong citizen, or NGO staff who isn't `ngo_admin` of the organizing NGO) | `403` | `{"error":"this donation campaign is not managed by you"}` |
| Every field omitted | `400` | `{"error":"at least one field must be provided"}` |
| `title` present but blank | `400` | `{"error":"title is required"}` |
| `goal_amount` present and `<= 0` | `400` | `{"error":"goal_amount must be positive"}` |

---

### `POST /donation-campaigns/{id}/close`

**Auth required:** Yes. Same manager-only authorization as `PATCH` above. No request body.

**Behavior**

**A genuine one-way terminal action** — there is no "reopen" route for a donation campaign
anywhere in this API. Guards against double-closing.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated campaign, `status: "closed"` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No campaign with that ID | `404` | `{"error":"donation campaign not found"}` |
| Caller doesn't manage this campaign | `403` | `{"error":"this donation campaign is not managed by you"}` |
| Campaign is already closed | `400` | `{"error":"donation campaign is already closed"}` — **note this is `400`, not `409`**, unlike some other "already in that state" errors elsewhere in this API |

---

## FE-5 (M13) — Donation lifecycle: collection → allocation → delivery

**What it covers:** the actual money/goods flow behind a campaign — a donor contributing
(donating **is** how a citizen "joins" a campaign, per the source spec's own wording), and
tracking each individual donation through a strict, sequential, one-way pipeline:
`collected → allocated → delivered`.

**Routes:** `POST /donation-campaigns/{id}/donations`, `GET /donation-campaigns/{id}/donations`,
`PATCH /donations/{id}/allocate`, `PATCH /donations/{id}/deliver`.

**⚠️ Unlike almost every other status field in this whole API (aid requests, incident reports,
missing persons — all freely re-settable, "no restrictive state machine"), a donation's lifecycle
genuinely IS a strict one-way pipeline.** You cannot skip a stage (deliver a still-`collected`
donation directly), and you cannot go backward. This is the one aggregate in the entire backend
that behaves this way alongside donation campaigns' own one-way `close`.

### `POST /donation-campaigns/{id}/donations`

**Auth required:** Yes — any authenticated account.

**Request**
```json
{ "amount": 5000 }
```
`amount` must be positive — `0`, negative, or omitted are all rejected (via the domain layer's own
check, not a binder `required` tag, since `0` is never legitimate here — unlike `lat`/`lng`
elsewhere, there's no zero-value-vs-omitted ambiguity to guard against).

**Behavior**

The new `donations` row **and** the campaign's `raised_amount` increment happen atomically in one
transaction — you will never observe a donation recorded without the campaign's total reflecting
it, or vice versa. `donor_account_id` is always the caller, never a request field. **Donating to
an already-closed campaign is rejected** — reuses the exact same "already closed" error as the
campaign's own `close` route.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `id` (path, campaign) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No campaign with that ID | `404` | `{"error":"donation campaign not found"}` |
| Campaign is closed | `400` | `{"error":"donation campaign is already closed"}` |
| `amount` zero, negative, or omitted | `400` | `{"error":"amount must be positive"}` |

**Response body on success**
```json
{
  "id": "2aa22c3f-...",
  "campaign_id": "ac331280-...",
  "donor_account_id": "1a8381fc-...",
  "amount": 5000,
  "status": "collected",
  "collected_at": "2026-09-20T06:00:00Z"
}
```
`allocated_to_aid_request_id`, `allocated_at`, `delivered_at` are all omitted until the donation
progresses through the pipeline.

---

### `GET /donation-campaigns/{id}/donations`

**Auth required:** Yes. **Not one of this FE's three originally-named routes — added because
without it, a campaign manager would have no way to discover a donation's ID to allocate/deliver
in the first place.** Deliberately **not public**, unlike the campaign routes themselves — donor
identity and individual amounts are financial data, kept private.

**Auth scope:** the campaign's own manager, **or** `admin`/`super_admin` (an explicit oversight
override this route family has that `PATCH`/`close` on the campaign itself deliberately does not).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, same shape as `POST`'s response |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No campaign with that ID | `404` | `{"error":"donation campaign not found"}` |
| Caller neither manages this campaign nor is an admin | `403` | `{"error":"this donation campaign is not managed by you"}` |

---

### `PATCH /donations/{id}/allocate`

**Auth required:** Yes. Same "campaign manager or admin" authorization as the `GET` above.

**Request**
```json
{ "aid_request_id": "47fa58ea-..." }
```

**Behavior**

Earmarks a **`collected`** donation for a specific aid request — only valid from that exact
status. The target `aid_request_id` must actually exist. The literal all-zero UUID is proactively
rejected as invalid, same guard as elsewhere in this API.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated donation, `status: "allocated"` |
| `id` (path, donation) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `aid_request_id` missing | `400` | bind-failure shape |
| `aid_request_id` is the literal all-zero UUID, or otherwise malformed | `400` | `{"error":"aid_request_id must be a valid uuid"}` |
| No donation with that ID | `404` | `{"error":"donation not found"}` |
| Caller neither manages the donation's campaign nor is an admin | `403` | `{"error":"this donation campaign is not managed by you"}` |
| `aid_request_id` well-formed but no such aid request exists | `404` | `{"error":"aid request not found"}` |
| Donation isn't currently `collected` (already allocated or delivered) | `400` | `{"error":"donation must be in 'collected' status to be allocated"}` |

---

### `PATCH /donations/{id}/deliver`

**Auth required:** Yes. Same authorization as `allocate`. No request body.

**Behavior**

Only valid from **`allocated`** — confirms the donation actually reached whoever it was earmarked
for.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated donation, `status: "delivered"` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No donation with that ID | `404` | `{"error":"donation not found"}` |
| Caller neither manages the donation's campaign nor is an admin | `403` | `{"error":"this donation campaign is not managed by you"}` |
| Donation isn't currently `allocated` (still `collected`, or already `delivered`) | `400` | `{"error":"donation must be in 'allocated' status to be delivered"}` |

---

## FE-3 (M13) — Missing person reporting + sightings + status updates

**What it covers:** reporting someone missing, crowdsourced sightings from anyone (not just the
original reporter), and a status lifecycle split across three caller types, similar in shape to
aid requests but with a different value split.

**Routes:** `POST /missing-persons`, `GET /missing-persons?region_id=`,
`PATCH /missing-persons/{id}/status`, `POST /missing-persons/{id}/sightings`,
`GET /missing-persons/{id}/sightings`.

### `POST /missing-persons`

**Auth required:** Yes — any authenticated account.

**Request**
```json
{ "name": "Ali Khan", "age": 34, "description": "Last seen near riverbank", "photo_url": "https://...", "lat": 24.5, "lng": 67.5, "last_seen_at": "2026-09-18T10:00:00Z" }
```
- `name` — required, non-blank.
- `age` — optional; if provided, must be positive.
- `description`, `photo_url` — optional.
- `lat`/`lng` — required (nilable pointers, same zero-coordinate-safe treatment as aid requests).
- `last_seen_at` — required (a plain `time.Time`, not a pointer — Go's binder has a built-in
  special case treating a zero timestamp as "missing," so this doesn't share the same
  zero-value risk numeric fields have).

**Behavior**

Always creates the report as `status: "missing"`. `region_id` resolves live via spatial join, same
as aid requests (this table **does** have a location column, unlike donation campaigns).
**`missing_persons` genuinely has a public map FE** (M13 FE-6, below) — unlike aid requests, so
both `GET`s here are public.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `name` missing/blank | `400` | `{"error":"name is required"}` or bind-failure shape |
| `age` present and `<= 0` | `400` | `{"error":"age must be positive"}` |
| `lat`/`lng` missing | `400` | bind-failure shape |
| `last_seen_at` missing | `400` | bind-failure shape |

**Response body on success**
```json
{
  "id": "ca6917c6-...",
  "reported_by_account_id": "48434d1b-...",
  "name": "Ali Khan",
  "age": 34,
  "description": "Last seen near riverbank",
  "photo_url": "https://...",
  "last_seen_location": { "type": "Point", "coordinates": [67.5, 24.5] },
  "last_seen_at": "2026-09-18T10:00:00Z",
  "status": "missing",
  "created_at": "2026-09-20T06:00:00Z",
  "updated_at": "2026-09-20T06:00:00Z"
}
```
`age`, `description`, `photo_url`, `region_id` are all omitted entirely when unset.

---

### `GET /missing-persons?region_id=`

**Auth required:** No — public.

**Query parameter:** `region_id` — required.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

---

### `PATCH /missing-persons/{id}/status`

**Auth required:** Yes. **A three-way role split, different from aid requests' shape** — here two
of the three caller types share the same restricted value set:

| Caller | Allowed `status` values | Region/ownership restriction |
|---|---|---|
| `admin`/`super_admin` | any of `missing`/`found`/`deceased` | none |
| `ngo_admin`/`ngo_volunteer` | **only** `found` or `deceased` | only if the person's last-seen location is within their own NGO's operational regions |
| the original reporter | **only** `found` or `deceased` | must be their own report — they can update it once they learn the outcome, but cannot unilaterally reopen it back to `missing` themselves |

Existence is checked before authorization for all three caller types.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `status` missing | `400` | bind-failure shape |
| No report with that ID | `404` | `{"error":"missing person not found"}` |
| Reporter attempts `missing` (or anything other than `found`/`deceased`) | `400` | `{"error":"you may only set status to found or deceased"}` |
| Reporter acts on someone else's report | `403` | `{"error":"this missing person report does not belong to you"}` |
| NGO staff sets a value outside `{found, deceased}` | `400` | `{"error":"status must be one of: found, deceased"}` |
| NGO staff, report outside their operational regions | `403` | `{"error":"this missing person report is outside any region your ngo operates in"}` |
| Any caller, `status` not a real enum value at all | `400` | `{"error":"status must be one of: missing, found, deceased"}` |

---

### `POST /missing-persons/{id}/sightings`

**Auth required:** Yes — **any** authenticated account, no ownership check at all. This IS the
crowdsourcing mechanism — a sighting is almost never going to come from the original reporter.

**Request**
```json
{ "lat": 24.55, "lng": 67.55, "description": "Saw him near the market", "sighted_at": "2026-09-19T12:00:00Z" }
```
`lat`/`lng` required (nilable, zero-safe). `sighted_at` required. `description` optional.

**Behavior**

Confirms the missing person exists first — a bad `id` surfaces as a clean `404`, not a raw
constraint violation.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `id` (path) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `lat`/`lng` missing | `400` | bind-failure shape |
| `sighted_at` missing | `400` | bind-failure shape |
| No missing person with that ID | `404` | `{"error":"missing person not found"}` |

**Response body on success**
```json
{
  "id": "aa494988-...",
  "missing_person_id": "ca6917c6-...",
  "reported_by_account_id": "086fa55a-...",
  "location": { "type": "Point", "coordinates": [67.55, 24.55] },
  "description": "Saw him near the market",
  "sighted_at": "2026-09-19T12:00:00Z",
  "created_at": "2026-09-20T06:00:00Z"
}
```

---

### `GET /missing-persons/{id}/sightings`

**Auth required:** No — public.

**Behavior**

**Never 404s on a bad/nonexistent missing-person ID** — same "filter routes don't 404" convention
used throughout this API; returns `[]`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (well-formed `id`) | `200 OK` | array, possibly empty, newest-sighting-first |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |

---

## FE-6 (M13) — Interactive map of missing persons/movement

No new route — reuses `GET /missing-persons?region_id=` and `GET /missing-persons/{id}/sightings`
directly, both documented above. Both were deliberately made public specifically because this FE
exists; plotting `last_seen_location` and each sighting's own `location` on a map, and animating
movement over `sighted_at` timestamps, is a client-side rendering concern — nothing further to
build on the backend.

---

## FE-8 (M15) — Admin monitoring

**What it covers:** three genuinely new, unscoped, admin-only list routes — not role-based bypasses
on the public/self-scoped routes above.

**Routes:** `GET /admin/missing-persons?status=`, `GET /admin/donation-campaigns?status=`,
`GET /admin/aid-requests?status=`.

All three follow an identical shape: `RequireRole("admin", "super_admin")`, an **optional**
`status` query parameter (omitted = every status, no region/ownership scoping of any kind), and
reuse the exact same response shape as their non-admin counterparts documented above.

### `GET /admin/aid-requests?status=`

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, same shape as `POST /aid-requests`'s response |
| `status` present but not one of `pending`/`in_progress`/`fulfilled`/`cancelled` | `400` | `{"error":"status must be one of: pending, in_progress, fulfilled, cancelled"}` |

Unlike `GET /aid-requests?mine=true`, this is genuinely unscoped — aid requests have no other
unscoped list route anywhere in this API.

---

### `GET /admin/donation-campaigns?status=`

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, same shape as `POST /donation-campaigns`'s response |
| `status` present but not `active`/`closed` | `400` | `{"error":"status must be one of: active, closed"}` |

Unlike `GET /donation-campaigns?region_id=`, this has **no `region_id` requirement at all** —
admin sees every campaign, any region, any status, in one call.

---

### `GET /admin/missing-persons?status=`

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, same shape as `POST /missing-persons`'s response |
| `status` present but not `missing`/`found`/`deceased` | `400` | `{"error":"status must be one of: missing, found, deceased"}` |

Unlike `GET /missing-persons?region_id=`, this has no `region_id` requirement — admin sees every
report, any region, any status.
