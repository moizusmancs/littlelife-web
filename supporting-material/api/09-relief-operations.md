# Phase 9 — Relief Operations, core (`internal/relief`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Relief Operations owns **aid requests** (a citizen asking for help, tracked through a role-scoped
lifecycle), **donation campaigns** and the **donation lifecycle** that funds them
(collection → allocation → delivery), and **missing person reports** with crowdsourced
**sightings**, plus **feedback** on aid quality. This is the newest bounded context in the backend — 25 routes across five
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
| `ngo` | `/ngo/aid-requests`, `/ngo/missing-persons`, `/ngo/feedback` | `RequireAuth` only — no `RequireRole`; open to any NGO staff member, authorization comes from the NGO-region / NGO-ownership check inside the route |
| feedback | `POST /feedback` | `RequireAuth`; what the caller may rate depends on the target, resolved inside the use case |
| `admin` | `/admin/missing-persons`, `/admin/donation-campaigns`, `/admin/aid-requests` | `RequireAuth`, `RequireRole("admin", "super_admin")` |

### Who filed it: `requester_name` and `reported_by_name`

Every aid request carries `requester_account_id`, and every missing-person report carries
`reported_by_account_id`. Wherever a record is returned to someone **other than the person who
filed it** — NGO staff and admins — the response also carries that person's **display name**:
`requester_name` on aid requests, `reported_by_name` on missing-person reports (the latter is the
*reporter's* name; the missing person's own name is the report's `name`).

| Route | Name included? |
|---|---|
| `GET /ngo/aid-requests`, `GET /ngo/missing-persons` | yes |
| `GET /admin/aid-requests`, `GET /admin/missing-persons` | yes |
| `GET /aid-requests/{id}` | yes for NGO staff and admins; **no** for the requester |
| `PATCH /aid-requests/{id}/status`, `PATCH /missing-persons/{id}/status` | yes in the response to NGO staff and admins; **no** in the response to the requester / reporter |
| `POST /aid-requests`, `GET /aid-requests?mine=true`, `POST /missing-persons` | no — these are the caller's own records |
| `GET /missing-persons?region_id=` (public) | **never** — the public list does not reveal who reported someone missing |

- **A name, nothing more.** No email, phone or other contact detail is returned anywhere; NGO
  staff have no route that turns an account id into one.
- **The key is omitted, not `""`,** when there is no name to show: the person never set one (an
  account starts with a blank name) or their account no longer exists. Treat "absent" as "name not
  provided" and pick your own fallback text; it is not an error.
- **A deleted account is never named.** Its requests and reports stay in the lists (with the
  account id), but the name is no longer returned.
- **Names are read at request time,** not stored on the record. If the person renames themselves,
  the next fetch shows the new name — so don't cache names beyond the screen that displays them.
- On the `PATCH` routes the name is included in the response so a client that replaces a list row
  with the response does not lose the name it was showing.

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
| Success | `200 OK` | the request, same shape as `POST`'s response; NGO staff and admins additionally get [`requester_name`](#who-filed-it-requester_name-and-reported_by_name) |
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
self-scoped; there is no way to list someone else's requests through this route. NGO staff list
the requests inside their own regions with
[`GET /ngo/aid-requests?region_id=`](#get-ngoaid-requestsregion_id), and admins list everything with
`GET /admin/aid-requests` ([documented below](#fe-8-m15--admin-monitoring)).

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
| Success | `200 OK` | the updated request; the response to NGO staff and admins includes [`requester_name`](#who-filed-it-requester_name-and-reported_by_name), the requester's own does not |
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

NGO staff have their own variant of this list,
[`GET /ngo/missing-persons?region_id=`](#get-ngomissing-personsregion_id), which returns the same
rows but only for regions the caller's NGO operates in, and adds the reporter's name. **This public
list never includes `reported_by_name`.**

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
| Success | `200 OK` | the updated report; the response to NGO staff and admins includes [`reported_by_name`](#who-filed-it-requester_name-and-reported_by_name), the reporter's own does not |
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
reuse the same response shape as their non-admin counterparts documented above — with one addition:
the aid-request and missing-person lists also carry
[the name of whoever filed each record](#who-filed-it-requester_name-and-reported_by_name).

### `GET /admin/aid-requests?status=`

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, same shape as `POST /aid-requests`'s response plus `requester_name` |
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
| Success | `200 OK` | array, possibly empty, same shape as `POST /missing-persons`'s response plus `reported_by_name` |
| `status` present but not `missing`/`found`/`deceased` | `400` | `{"error":"status must be one of: missing, found, deceased"}` |

Unlike `GET /missing-persons?region_id=`, this has no `region_id` requirement — admin sees every
report, any region, any status.

---

## FE-2 (M16) — NGO region-scoped tracking (aid requests + missing persons)

**What it covers:** NGO staff seeing every aid request and every missing-person report located
inside a region their NGO operates in — the "what needs doing in my area" lists behind an NGO
dashboard. This is the aid/missing-person half of M16 FE-2. The incident-report half is
[`GET /ngo/incident-reports?region_id=`](07-community-intelligence.md#get-ngoincident-reportsregion_id)
in Phase 7 and follows the same contract (same auth, same `region_id` rules, same `400`/`403`
bodies), so one region picker and one error handler can serve all three lists.

**Why the aid list matters most:** before this route there was **no way for NGO staff to discover
an aid request at all**. `GET /aid-requests?mine=true` returns only the caller's own requests, and
`GET /aid-requests/{id}` needs an id the NGO has no way to learn. The missing-person list is
different — it returns the same rows as the public [`GET /missing-persons?region_id=`](#get-missing-personsregion_id)
for that region; what the NGO route adds is the authorization contract (only regions the NGO
operates in) and the reporter's name, which the public list never shows.

**Routes:** `GET /ngo/aid-requests?region_id=`, `GET /ngo/missing-persons?region_id=`.

### Behaviour shared by both routes

**Auth required:** Yes (`RequireAuth`). Open to **any** NGO staff member — `ngo_admin` and
`ngo_volunteer` get identical results. There is no `RequireRole`; authorization comes from the
NGO-membership and region check itself. A citizen, a platform `admin`/`super_admin`, and a citizen
whose NGO registration is still `pending_approval` all have no NGO membership (admins use the
[`/admin/*` lists](#fe-8-m15--admin-monitoring) instead).

**Query parameter:** `region_id` — **required**, a UUID. There is no unscoped variant, and no
`bbox` alternative (this is regional tracking, not a map viewport). Upper- and lower-case UUID
strings are both accepted.

**The order checks run in** (the first failure wins):

1. Token — `401` from middleware, before the route runs.
2. `region_id` present and a valid UUID — `400`.
3. The caller belongs to an NGO — `400 account has no ngo membership`.
4. `region_id` is one of the regions **assigned to that NGO** — `403`.
5. Only then is the table queried.

Because step 3 comes before step 4, a caller with no NGO gets `400` (not `403`) even for a region
that exists.

**Which regions the NGO may ask about** are exactly the rows in its `ngo_regions` — the list
returned by `GET /ngo/me/regions` (see [Phase 1](01-geo.md)), managed by its `ngo_admin` through
`POST`/`DELETE /ngo/me/regions`. It is an **exact match**: being assigned a district does not
authorize its parent province or its child tehsils, and being assigned a province does not
authorize its districts. A `region_id` that does not exist at all gets the **same `403` body** as a
real region the NGO isn't assigned to, so the response never reveals which region ids exist. An
approved NGO with zero assigned regions gets `403` for every region.

**What "inside a region" means.** Membership is decided when you call, by testing whether the
record's location intersects the region's boundary polygon — the same live spatial test the rest of
the API uses. Consequences the frontend should plan for:

- **Boundaries are inclusive.** A record exactly on a region's edge is inside it. A record on a
  border shared by two regions appears in both regions' lists if the NGO is assigned both.
- **Geometry, not hierarchy.** An NGO assigned a province sees records located anywhere inside that
  province's boundary, including records that are also in a district or tehsil beneath it. An NGO
  assigned both a district and one of its tehsils sees a record in that tehsil in **both** lists.
  If you fetch several regions and merge them, **de-duplicate by `id`**.
- **A record located inside no region at all** appears in no list, for any NGO.
- `region_id` is **never present** on the items returned by these routes (it is not stored; it is
  only used to select the list), so do not read a region off the item.

**What comes back:** every record in the region in **any status** (an aid request that is
`cancelled` or `fulfilled` is included, as is a missing person who is `found` or `deceased`),
**newest first** by `created_at` (the order between records created at the same instant is
unspecified). There is **no pagination and no `status` filter** on these routes today — filter and
sort (for example by `severity`) in the client.

**An item in this list is one the NGO can act on.** The status routes authorize with the same
location-against-the-NGO's-regions test these lists use, so any item returned here can be updated
by the caller's NGO through
[`PATCH /aid-requests/{id}/status`](#patch-aid-requestsidstatus) (`in_progress` / `fulfilled`) or
[`PATCH /missing-persons/{id}/status`](#patch-missing-personsidstatus) (`found` / `deceased`).

**Who filed it.** Each item carries the requester's / reporter's account id **and their display
name** (`requester_name` on aid requests, `reported_by_name` on missing-person reports), so a
dashboard can show who is asking. The rules — when the key is present, when it is omitted, that it
is a live read and never a stored copy — are in
[Who filed it](#who-filed-it-requester_name-and-reported_by_name) at the top of this document.

**What is deliberately not here:** any way to *reach* that person. The name is all NGO staff get:
no email, no phone, and no route in this API resolves an account id into a contact detail.
Contacting a requester is planned as part of Communication (a later phase), which is not built.

---

### `GET /ngo/aid-requests?region_id=`

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array of aid requests, possibly `[]` |
| No / malformed / expired token | `401` | see [README](README.md#authentication) |
| `region_id` missing or empty | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |
| Caller belongs to no NGO (citizen, platform admin, pending NGO applicant) | `400` | `{"error":"account has no ngo membership"}` |
| Region not assigned to the caller's NGO, region does not exist, or the all-zero UUID | `403` | `{"error":"your ngo does not operate in this region"}` |

**Response body on success** — each item has the same shape as `POST /aid-requests`'s response,
plus `requester_name`:
```json
[
  {
    "id": "1dc0d4f7-...",
    "requester_account_id": "48434d1b-...",
    "requester_name": "Ali Raza",
    "category": "food",
    "description": "Need food for a family of 5.",
    "location": { "type": "Point", "coordinates": [68.85, 27.7] },
    "severity": "high",
    "status": "pending",
    "created_at": "2026-09-26T06:00:00Z",
    "updated_at": "2026-09-26T06:00:00Z"
  }
]
```
`description` is omitted when the requester gave none, and `requester_name` when they have no name
to show. `location` is GeoJSON with coordinates in `[lng, lat]` order.

---

### `GET /ngo/missing-persons?region_id=`

The region test uses the person's **last-seen location**. Responses and checks are identical to the
aid-request route above.

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array of missing-person reports, possibly `[]` |
| `region_id` missing / malformed | `400` | same two bodies as above |
| Caller belongs to no NGO | `400` | `{"error":"account has no ngo membership"}` |
| Region not assigned to the caller's NGO (or does not exist) | `403` | `{"error":"your ngo does not operate in this region"}` |

**Response body on success** — each item has the same shape as `POST /missing-persons`'s response,
plus `reported_by_name`:
```json
[
  {
    "id": "9c1e5a20-...",
    "reported_by_account_id": "48434d1b-...",
    "reported_by_name": "Ali Raza",
    "name": "Ali Khan",
    "age": 34,
    "description": "Last seen near riverbank",
    "photo_url": "https://...",
    "last_seen_location": { "type": "Point", "coordinates": [68.85, 27.7] },
    "last_seen_at": "2026-09-18T10:00:00Z",
    "status": "missing",
    "created_at": "2026-09-26T06:00:00Z",
    "updated_at": "2026-09-26T06:00:00Z"
  }
]
```
`age`, `description` and `photo_url` are omitted when not provided, and `reported_by_name` when the
reporter has no name to show. Sightings for a person are not
included — fetch them with the public `GET /missing-persons/{id}/sightings`.

---

### How the frontend should use these routes

1. **Show `requester_name` / `reported_by_name` next to the record, with a fallback.** The key is
   absent when the person never set a name or has deleted their account, so render your own
   placeholder ("Name not provided") rather than an empty cell. There is no contact detail to
   show beside it.
2. **Populate the region picker from `GET /ngo/me/regions`**, not from the full region list, so the
   NGO can only choose regions it can actually query. For an NGO with several regions, either let
   the user pick one, or call once per region and merge (de-duplicating by `id`, see above).
3. **`200` with `[]` is a normal empty state** ("nothing reported in this region"), not an error.
4. **`403`** means the NGO is not (or is no longer) assigned that region — an `ngo_admin` may have
   removed it since the picker was loaded. Reload `GET /ngo/me/regions` and reset the picker rather
   than showing a generic failure.
5. **`400 account has no ngo membership`** means the signed-in user is not NGO staff (or their NGO
   is not yet approved). Hide the NGO dashboard for that user rather than surfacing the error text.
6. **Do not paginate or filter server-side — you can't.** Load the whole list and filter by `status`
   or `severity` in the client; refetch after a status `PATCH` to see the change reflected (a
   `cancelled` or `fulfilled` request stays in the list).
7. **Acting on an item** uses the existing status routes linked above; you do not need to re-check
   region authority in the client.

---

## FE-11 (M16) — Feedback on aid quality

**What it covers:** the people aid is *for* (or who funded it) rating how it went, and NGO staff
reading those ratings. A rating is a whole number from 1 to 5 with an optional comment, about
**either** an aid request **or** a donation campaign.

**Routes:** `POST /feedback`, `GET /ngo/feedback?aid_request_id=`,
`GET /ngo/feedback?donation_campaign_id=` (one route; the query parameter says which kind of target).

### `POST /feedback`

**Auth required:** Yes — any authenticated account, any role (`RequireAuth` only). What you may
rate depends on the target, below.

**Request**
```json
{ "aid_request_id": "1dc0d4f7-...", "rating": 5, "comments": "Volunteers reached us within a day." }
```
or, for a campaign:
```json
{ "donation_campaign_id": "c8c0bc57-...", "rating": 4, "comments": "Clear updates on where the money went." }
```
- `aid_request_id` / `donation_campaign_id` — **exactly one** must be sent. Sending neither, or
  both, is `400`. A field sent as JSON `null` counts as **not sent**, so `{"aid_request_id": null,
  "rating": 5}` is "neither". A value that is present but empty, malformed, or the all-zero UUID is
  `400 "<field> must be a valid uuid"`.
- `rating` — required, a whole number `1`–`5`. Omitted, `0`, `6`, negative: `400` with the message
  below. A fractional (`4.5`) or string (`"5"`) value is rejected as `400` with the generic
  `{"error":"invalid request","detail":...}` binding shape.
- `comments` — optional. Trimmed; **at most 2000 characters** (characters, not bytes — 2000 Urdu
  characters are accepted). Empty or whitespace-only comments are stored as no comment.

**Who may rate what**

| Target | Allowed | Condition |
|---|---|---|
| an aid request | **only the person who submitted it** — including an NGO staff member rating their *own* request; nobody else, staff included | the request must be `in_progress` or `fulfilled`. A `pending` request has had no aid and a `cancelled` one was withdrawn, so there is nothing to rate |
| a donation campaign | **participants only**: someone who donated to it, **or** who submitted an aid request that one of its donations was allocated to | none on the campaign's own status — a `closed` campaign still accepts feedback, and so does a campaign organized by a citizen rather than an NGO |

Participation is read at the moment of the request: a person who has not yet donated, or whose aid
request has not yet been allocated funds from the campaign, gets `403`, and the same call succeeds
after they have.

**One rating per person per target.** A second attempt is `409`, whatever rating it carries, and it
leaves the first untouched. This is enforced by a database unique index, so two simultaneous
submissions cannot both succeed. There is **no edit and no delete route** — a rating is final.

**The order checks run in** (the first failure wins):

1. Token — `401`.
2. Request shape — exactly one target, valid UUID, rating `1`–`5`, comment length — `400`. This
   runs first on purpose, so a malformed request never reveals whether a target exists.
3. The target exists — `404` (before any permission check, so a missing id is never a misleading `403`).
4. The caller may rate it — `403`.
5. The aid request has started — `400`.
6. Not already rated — `409`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the entry, below |
| No / invalid token | `401` | see [README](README.md#authentication) |
| Malformed JSON, or `rating` not a JSON integer | `400` | `{"error":"invalid request","detail":"..."}` |
| Neither target sent (a `null` counts as not sent), or both | `400` | `{"error":"exactly one of aid_request_id or donation_campaign_id is required"}` |
| A target id empty, malformed, or all-zero | `400` | `{"error":"aid_request_id must be a valid uuid"}` / `{"error":"donation_campaign_id must be a valid uuid"}` |
| `rating` missing, `0`, `> 5`, or negative | `400` | `{"error":"rating must be a whole number from 1 to 5"}` |
| `comments` over 2000 characters | `400` | `{"error":"comments must be at most 2000 characters"}` |
| Aid request is `pending` or `cancelled` | `400` | `{"error":"feedback can only be left once the aid request is in progress or fulfilled"}` |
| No such aid request | `404` | `{"error":"aid request not found"}` |
| No such campaign | `404` | `{"error":"donation campaign not found"}` |
| Aid request belongs to someone else | `403` | `{"error":"this aid request does not belong to you"}` |
| Caller did not take part in the campaign | `403` | `{"error":"only people who donated to this campaign, or received aid funded by it, can leave feedback on it"}` |
| Already rated this target | `409` | `{"error":"you have already left feedback on this"}` |

**Response body on success**
```json
{
  "id": "9a3c7e10-...",
  "aid_request_id": "1dc0d4f7-...",
  "rating": 5,
  "comments": "Volunteers reached us within a day.",
  "created_at": "2026-09-26T09:00:00Z"
}
```
A campaign entry carries `donation_campaign_id` instead of `aid_request_id`. `comments` is omitted
when there is none. **The response never includes who submitted it** — nothing in this API returns
that.

---

### `GET /ngo/feedback?aid_request_id=` and `GET /ngo/feedback?donation_campaign_id=`

**Auth required:** Yes. Open to **any NGO staff member** (`ngo_admin` or `ngo_volunteer`, identical
results) — there is no `RequireRole`; authorization comes from NGO membership plus the check below.
A citizen, a platform `admin`/`super_admin`, or an applicant whose NGO is still pending have no NGO
membership and get `400`.

**Query parameters:** send **exactly one** of `aid_request_id` or `donation_campaign_id`. An empty
value counts as not sent.

**Who may read what**

| Target | The caller's NGO must |
|---|---|
| an aid request | cover the request's location with one of its regions — the same test the aid-request list and status routes use, so any request listed by [`GET /ngo/aid-requests`](#get-ngoaid-requestsregion_id) can have its feedback read here |
| a donation campaign | be the NGO that **organized** the campaign. A campaign organized by a citizen has no NGO behind it, so **no NGO staff can read its feedback** |

The target's existence is checked before authorization (`404`, never a misleading `403`).

**Behavior**

Returns the ratings for that target, **newest first**, together with a summary computed from the
same entries. There is **no pagination**. **Ratings are anonymous:** an entry has no submitter, no
name and no account id — for an aid request, the NGO already knows who asked from the aid request
itself ([`requester_name`](#who-filed-it-requester_name-and-reported_by_name)); for a campaign, who
donated stays private.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | see below; `feedback` is `[]` when there is none |
| No / invalid token | `401` | see [README](README.md#authentication) |
| Neither parameter, or both | `400` | `{"error":"exactly one of aid_request_id or donation_campaign_id is required"}` |
| A parameter malformed or all-zero | `400` | `{"error":"aid_request_id must be a valid uuid"}` / `{"error":"donation_campaign_id must be a valid uuid"}` |
| Caller belongs to no NGO | `400` | `{"error":"account has no ngo membership"}` |
| No such aid request / campaign | `404` | `{"error":"aid request not found"}` / `{"error":"donation campaign not found"}` |
| Aid request outside the caller's NGO's regions | `403` | `{"error":"this aid request is outside any region your ngo operates in"}` |
| Campaign not organized by the caller's NGO (another NGO's, or a citizen's) | `403` | `{"error":"this donation campaign is not managed by you"}` |

**Response body on success**
```json
{
  "summary": {
    "count": 3,
    "average_rating": 4.67,
    "distribution": { "1": 0, "2": 0, "3": 0, "4": 1, "5": 2 }
  },
  "feedback": [
    { "id": "9a3c7e10-...", "donation_campaign_id": "c8c0bc57-...", "rating": 5,
      "comments": "Transparent, thank you.", "created_at": "2026-09-26T09:00:00Z" },
    { "id": "5b1d02aa-...", "donation_campaign_id": "c8c0bc57-...", "rating": 4,
      "created_at": "2026-09-26T08:58:00Z" }
  ]
}
```
- `count` is the number of entries, and equals the length of `feedback`.
- `average_rating` is rounded to **two decimals** and is **omitted when `count` is `0`** — do not
  treat a missing average as `0`.
- `distribution` always has all five keys `"1"`–`"5"`, each the number of entries with that rating.
- When there is no feedback the body is exactly
  `{"summary":{"count":0,"distribution":{"1":0,"2":0,"3":0,"4":0,"5":0}},"feedback":[]}`.

### How the frontend should use these routes

1. **Offer "rate this aid" only where it can succeed.** For a requester: on their own requests in
   `in_progress` or `fulfilled`. For a campaign: to people who donated or were helped by it.
   The API is the authority (`400`/`403` above), so treat those as "hide the button", not as
   failures.
2. **`409` means already rated** — show their rating read-only; there is nothing to edit.
3. **Send `rating` as a JSON integer** and cap the comment box at 2000 characters.
4. **The NGO dashboard** shows `summary` (count, average, the five bars from `distribution`) above
   the list. Handle `count: 0` by hiding the average rather than showing `0`.
5. **Campaign feedback is only readable by the organizing NGO.** For citizen-organized campaigns
   there is nothing for NGO staff to load; `403` there is expected, not an error to report.
6. **Do not try to attribute a rating.** Entries carry no submitter, by design.
