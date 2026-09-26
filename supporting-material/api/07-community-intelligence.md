# Phase 7 — Community Intelligence (`internal/community`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Community Intelligence owns citizen-submitted **incident reports** (with photo/video evidence,
crowdsourced upvote/downvote credibility, AI-assisted classification, and a full admin/NGO review
lifecycle) and **community updates** (short official announcements posted by admins or NGOs). This
is the largest phase documented so far — 17 routes — and the first one with genuine
`multipart/form-data` uploads instead of JSON bodies.

| Group | Base path | Middleware |
|---|---|---|
| incident report submission/media | `/incident-reports`, `/incident-reports/{id}/media` | `RequireAuth` on `POST`; the two `GET`s are public |
| votes | `/incident-reports/{id}/votes`, `/incident-reports/my-votes` | `RequireAuth` |
| status (citizen-facing route) | `/incident-reports/{id}/status` | `RequireAuth`, `RequireRole("admin", "super_admin")` |
| community updates | `/community-updates` | `RequireAuth` + `RequireRole("admin","super_admin","ngo_admin")` on `POST`; `GET` is public |
| AI ingestion | `/internal/incident-reports/{id}/ai-classification` | `X-Internal-Service-Key` header — **not** a user credential |
| `admin` | `/admin/incident-reports*` | `RequireAuth`, `RequireRole("admin", "super_admin")` |
| `ngo` | `/ngo/incident-reports*` | `RequireAuth` (role restrictions vary per route — see each one) |

---

## The shared `incidentReportResponse` shape

Every route that returns an incident report (whether one or a list) uses this **one** shape —
unlike Flood Intelligence's hazard zones, there's no shape-per-route split here:

```json
{
  "id": "5a6b7c8d-...",
  "reporter_account_id": "48434d1b-...",
  "category": "flooding",
  "description": "Water rising fast near the market.",
  "location": { "type": "Point", "coordinates": [67.02, 24.85] },
  "region_id": "83754148-...",
  "status": "reported",
  "ai_classified_category": null,
  "ai_confidence": null,
  "auto_verified": false,
  "upvote_count": 3,
  "downvote_count": 0,
  "verified_at": null,
  "resolved_at": null,
  "created_at": "2026-09-20T06:00:00Z",
  "updated_at": "2026-09-20T06:00:00Z",
  "priority_score": null
}
```
- `category` is one of `flooding`/`blocked_road`/`other_hazard`.
- `status` is one of `reported`/`verified`/`in_progress`/`resolved`/`rejected`.
- `region_id`, `description`, `ai_classified_category`, `ai_confidence`, `verified_at`,
  `resolved_at`, `priority_score` are all **omitted from the JSON entirely** (not `null`) when
  unset — the example above shows them as `null` only to illustrate which fields exist; a real
  response with no AI classification yet simply won't have those keys at all. Check key presence,
  not value, if that distinction matters to your code.
- `auto_verified` is always present as a real boolean (`false` until an AI classification says
  otherwise) — never omitted, unlike almost every other optional field here.

---

## FE-1 (M10) — Submit a geo-tagged incident report

**Routes:** `POST /incident-reports`.

### `POST /incident-reports`

**Auth required:** Yes — any authenticated citizen. This is the crowdsourcing mechanism itself.

**⚠️ This is `multipart/form-data`, not JSON — the only route in this entire API built this
way**, and deliberately so: it's the only way to enforce "at least one photo or video is
mandatory" synchronously in a single request, since a client could crash or lose network between
a hypothetical "create report" call and a separate "attach media" call, and a separate call could
never itself guarantee "at least one" actually landed.

**Request** — `Content-Type: multipart/form-data`, with these parts:

| Field | Type | Required | Notes |
|---|---|---|---|
| `category` | form field | Yes | one of `flooding`/`blocked_road`/`other_hazard` |
| `description` | form field | No | free text |
| `lat` | form field | Yes | a valid float string, e.g. `"24.85"` |
| `lng` | form field | Yes | a valid float string, e.g. `"67.02"` |
| `files` | one or more file parts, **all under the same field name `files`** | Yes, at least one | see the allow-list below |

**Unlike the JSON-bodied lat/lng routes elsewhere in this API (e.g. Flood Intelligence's
risk-check), `lat`/`lng` here ARE correctly presence-checked** — a form field is either present as
a string or absent, so `""`/missing is unambiguous from a genuine `"0"`; omitting either field
returns a clean `400`, and `lat=0, lng=0` (the equator/prime meridian) is accepted normally as a
real coordinate. This route does not have the zero-value binding bug some other routes in this API
have.

**Accepted file content-types** (anything else is rejected):

| Content-Type | Maps to |
|---|---|
| `image/jpeg`, `image/png`, `image/webp`, `image/heic` | `photo` |
| `video/mp4`, `video/quicktime`, `video/webm` | `video` |

Each individual file must be **≤ 25MB** (default, server-configurable via
`MAX_UPLOAD_SIZE_BYTES`) — checked per file, not as a combined total. **Every file in the request
is validated before any of them is uploaded** — a request that's going to be rejected never
uploads anything to storage. The overall HTTP request body itself is additionally capped at 10× the
per-file limit (250MB by default) purely as a blunt DoS guard, independent of the per-file check.

**Behavior**

Creates the report and its media row(s) together — always `status: "reported"`,
`auto_verified: false`, both vote counts at `0`. There is genuinely no way to create an incident
report through this API without media; this is the *only* place an incident report is ever
created.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| No/invalid access token | `401` | (from `RequireAuth`) |
| `category` missing or not a valid value | `400` | `{"error":"category must be one of: flooding, blocked_road, other_hazard"}` |
| `lat`/`lng` missing | `400` | `{"error":"lat and lng are required"}` |
| `lat`/`lng` present but not a valid number | `400` | `{"error":"lat must be a valid number"}` or `{"error":"lng must be a valid number"}` |
| Malformed multipart body | `400` | `{"error":"invalid multipart form","detail":"..."}` |
| Zero files attached | `400` | `{"error":"at least one photo or video is required"}` |
| A file's content-type isn't in the allow-list | `400` | `{"error":"unsupported file type"}` |
| A file exceeds the per-file size limit | `400` | `{"error":"file exceeds the maximum upload size"}` |

**Response body on success**
```json
{
  "report": { "...": "the full incidentReportResponse shape above" },
  "media": [
    { "id": "6b7c8d9e-...", "incident_report_id": "5a6b7c8d-...", "media_type": "photo", "media_url": "https://...", "created_at": "2026-09-20T06:00:00Z" }
  ]
}
```
**Frontend handling:** build this request with `FormData` (web) or equivalent multipart-encoding
on mobile — do **not** JSON-encode `lat`/`lng`/`category` and try to send them as a single JSON
part; they are plain top-level form fields, siblings of the file parts, not nested inside anything.

---

## FE-2 (M10) — Attach photos/videos (after the fact) + read media history

**Routes:** `POST /incident-reports/{id}/media`, `GET /incident-reports/{id}/media`.

### `POST /incident-reports/{id}/media`

**Auth required:** Yes — **only the original reporter** of this specific report.

**This is NOT the mechanism that satisfies "at least one media required"** — that's entirely
`POST /incident-reports` above. This route is purely for adding *more* media to an existing
report. Same `multipart/form-data` shape, same content-type allow-list and per-file size limit,
except there's no `category`/`lat`/`lng`/`description` — just one or more `files` parts.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | array of new media objects (same shape as `POST /incident-reports`'s `media` field) |
| `id` (path) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |
| Caller isn't the original reporter | `403` | `{"error":"this incident report does not belong to you"}` |
| Zero files, unsupported type, or too large | `400` | same three variants as `POST /incident-reports` above |

---

### `GET /incident-reports/{id}/media`

**Auth required:** No — public.

**Behavior**

**Never 404s on a bad/nonexistent report ID** — same "filter routes don't 404" convention used
throughout this API; just returns `[]`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (well-formed `id`) | `200 OK` | array, possibly empty |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |

---

## FE-3 (M10) — Upvote/downvote

**Routes:** `POST /incident-reports/{id}/votes`, `DELETE /incident-reports/{id}/votes`, `GET /incident-reports/my-votes`.

### `POST /incident-reports/{id}/votes`

**Auth required:** Yes — any authenticated citizen.

**Request**
```json
{ "vote_type": "upvote" }
```
One of `upvote`/`downvote`.

**Behavior**

**An account has at most one vote per report, ever — this is an upsert, not a strict create.**
Calling this: creates a new vote if the caller hasn't voted on this report yet; **switches** an
existing vote if they previously voted the other way; is a **no-op** if they vote the same way
again (still returns `200` with the current vote, no error). This is deliberately **not** a
toggle-off-on-repeat-click design — clicking upvote twice does not remove your upvote; use `DELETE`
for that. Returns `200`, not `201`, since a repeat call isn't always creating something new. The
report's `upvote_count`/`downvote_count` are updated atomically alongside the vote itself — you'll
see the new totals reflected the next time you fetch the report.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success (new vote, switched vote, or unchanged repeat) | `200 OK` | see shape below |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `vote_type` missing or not `upvote`/`downvote` | `400` | bind-failure shape (missing) or `{"error":"vote_type must be one of: upvote, downvote"}` |

```json
{ "id": "7c8d9e0f-...", "incident_report_id": "5a6b7c8d-...", "account_id": "48434d1b-...", "vote_type": "upvote", "created_at": "2026-09-20T06:00:00Z" }
```

---

### `DELETE /incident-reports/{id}/votes`

**Auth required:** Yes.

**Behavior**

Removes the caller's own vote on this report, if one exists. **Idempotent** — calling this when
you have no vote to remove still succeeds.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (well-formed `id`, authenticated) | **`204 No Content`** | *(empty)* — whether or not a vote actually existed |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |

---

### `GET /incident-reports/my-votes?ids=`

**Auth required:** Yes — any authenticated account (whoever can vote can read their own votes).

**Behavior**

Returns **only the caller's own** votes, so a client can draw which way they voted (a pressed
button) after a reload or on another device. `GET /incident-reports` stays public and carries only
the totals.

- `ids` (optional) — comma-separated report ids (spaces around each are tolerated), at most 100.
  Absent = every vote the caller has cast. Present but empty (`?ids=`) matches nothing → `[]`.
- One entry per report the caller has voted on (at most one each). A report the caller hasn't
  voted on, or an unknown id in `ids`, is simply **absent** — never a `404`.
- Newest first. `vote_type` uses the same values `POST …/votes` takes.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success (including no votes) | `200 OK` | array below, `[]` when none |
| No/invalid token | `401` | the usual auth error |
| `ids` present but not comma-separated UUIDs | `400` | `{"error":"ids must be comma-separated uuids"}` |
| More than 100 ids | `400` | `{"error":"at most 100 ids"}` |

```json
[
  { "incident_report_id": "032a2312-...", "vote_type": "upvote",   "created_at": "2026-09-26T11:00:31Z" },
  { "incident_report_id": "d0acfd23-...", "vote_type": "downvote", "created_at": "2026-09-25T08:14:02Z" }
]
```

---

## FE-4 (M10) / FE-4 (M15) — Status lifecycle (admin)

**Routes:** `PATCH /incident-reports/{id}/status`.

### `PATCH /incident-reports/{id}/status`

**Auth required:** Yes, role `admin` or `super_admin` **only** — not even the report's own
reporter can call this.

**Request**
```json
{ "status": "verified" }
```
One of `reported`/`verified`/`in_progress`/`resolved`/`rejected`. **Freely settable to any of the
five values, no restrictive forward-only state machine** — an admin may legitimately need to
reopen a resolved report if the situation recurs (e.g. flooding that recedes then returns).

**Behavior**

`verified_at`/`resolved_at` are only ever **set** the first time the corresponding status is
reached — they record a historical fact ("this was verified/resolved at some point"), never
cleared by a later transition. Reopening a `resolved` report back to `in_progress` does **not**
erase the fact that `resolved_at` was once set.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |
| `status` missing or not one of the five values | `400` | bind-failure shape (missing) or `{"error":"status must be one of: reported, verified, in_progress, resolved, rejected"}` |

M15 FE-4 ("incident lifecycle, admin-driven") reuses this exact route — no separate endpoint
exists for it.

---

## FE-6 (M10) — AI classification/verification of incoming reports

**Routes:** `POST /internal/incident-reports/{id}/ai-classification`.

**This is not a frontend route** — documented for completeness, since it explains where
`ai_classified_category`/`ai_confidence`/`auto_verified`/`priority_score` come from on every
report response.

### `POST /internal/incident-reports/{id}/ai-classification`

**Auth:** `X-Internal-Service-Key: <shared secret>` header, same mechanism as Flood Intelligence's
own ingestion route — no JWT, not tied to any account.

**Request**
```json
{ "ai_classified_category": "flooding", "ai_confidence": 0.91, "priority_score": 7.2 }
```
- `ai_classified_category` — required, free text (**not** validated against the `category` enum —
  an external model's own labels won't necessarily match this app's three-value enum, and this
  route accepts whatever label the classifier gives).
- `ai_confidence` — required, `0`–`1` inclusive (bound as a nilable pointer so an actual `0`
  confidence is correctly distinguished from "field omitted").
- `priority_score` — **genuinely optional**. Omitting it means "this call has no risk score to
  report," and — unlike a normal partial patch — **omitting it on a later call actively clears any
  previously-set score back to absent**, since this route represents the AI service's complete
  current assessment, not an incremental update. Only validated for being non-negative.

**Behavior**

If `ai_confidence >= 0.85`, the report **also** auto-transitions to `status: "verified"` in the
same call — **but only if the report is still in its original `reported` state.** A report an
admin has already manually progressed to `in_progress`/`resolved`/`rejected` will **not** be
silently pulled back to `verified` by a late-arriving high-confidence classification.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report |
| Wrong/missing service key | `401` | `{"error":"invalid or missing service key"}` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |
| `ai_classified_category` missing/blank | `400` | `{"error":"ai_classified_category is required"}` or bind-failure shape |
| `ai_confidence` missing, or outside `[0,1]` | `400` | bind-failure shape (missing) or `{"error":"ai_confidence must be between 0 and 1"}` |
| `priority_score` present and negative | `400` | `{"error":"priority_score must not be negative"}` |

---

## FE-7 (M10) — NGO/admin official community updates

**Routes:** `POST /community-updates`, `GET /community-updates?region_id=`.

### `POST /community-updates`

**Auth required:** Yes, role `admin`, `super_admin`, or `ngo_admin`.

**Request**
```json
{ "region_id": "83754148-...", "title": "Road Closure Notice", "content": "The bridge on Main St is closed until further notice." }
```
`content` required, non-blank. `title` optional. `region_id` optional — **its meaning and
requirement genuinely differ by caller role**:

- **`admin`/`super_admin`**: `region_id` may be omitted entirely for a **platform-wide** post
  (every citizen sees it, in every region), or set to any real region.
- **`ngo_admin`**: `region_id` is **required**, and must be one the caller's own NGO actually
  operates in (its `ngo_regions`) — an NGO cannot post to an arbitrary region, and cannot post
  platform-wide at all.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `content` missing/blank | `400` | `{"error":"content is required"}` or bind-failure shape |
| Malformed `region_id` string | `400` | `{"error":"region_id must be a valid uuid"}` |
| `region_id` is **the literal all-zero UUID** | `400` | `{"error":"region_id must be a valid uuid"}` (proactively rejected — the same zero-UUID-as-sentinel bug class caught elsewhere in this API, headed off here before it could collapse into "platform-wide") |
| `region_id` well-formed, non-zero, but references a genuinely nonexistent region | `404` | `{"error":"region not found"}` |
| Caller is `ngo_admin` and omitted `region_id` | `400` | `{"error":"region_id is required for an ngo-posted update"}` |
| Caller is `ngo_admin` posting to a region their NGO does **not** operate in | `403` | `{"error":"your ngo does not operate in this region"}` |
| Caller has role `ngo_admin` but no actual NGO membership (should not normally occur) | `400` | `{"error":"account has no ngo membership"}` |
| Caller role isn't one of the three allowed | `403` | `{"error":"insufficient permissions"}` (from `RequireRole`, before the handler runs) |

**Response body on success**
```json
{ "id": "8d9e0f1a-...", "author_account_id": "4ac58f97-...", "region_id": "83754148-...", "title": "Road Closure Notice", "content": "The bridge on Main St is closed until further notice.", "created_at": "2026-09-20T06:00:00Z" }
```
`region_id` is **omitted entirely** (not `null`) for a platform-wide post — a genuine, intentional
"no region" value, not "not yet resolved" (this table has no location column to resolve one live
from — unlike incident reports, `region_id` here is always exactly what was written at creation
time). `title` is omitted if not provided.

Also reused as-is by **M16 FE-7**'s community-channel half — an `ngo_admin` posting to a region
their NGO operates in *is* a targeted community-channel update; nothing new to build for that FE.

---

### `GET /community-updates?region_id=`

**Auth required:** No — public.

**Query parameter:** `region_id` — required.

**Behavior**

Returns every update targeted at this specific region **plus every platform-wide update** — a
nationwide advisory should surface in every region's feed, not just an unscoped query nobody would
think to call.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

A brand-new region that's never had an update targeted at it directly will still return every
platform-wide post — it is never a genuinely empty `[]` once at least one platform-wide update
exists anywhere in the system.

---

## FE-7 (M8) — Community incidents overlay (credibility + verification status)

**Routes:** `GET /incident-reports?region_id=|bbox=`.

### `GET /incident-reports?region_id=|bbox=`

**Auth required:** No — public. This is the same route documented in the roadmap as M8 FE-7's
incident half (the credibility half is Trust's `GET /accounts/{id}/trust-score`,
[documented there](06-trust.md#fe-10-m1--ngosadmins-view-any-citizens-credibility-score)).

**Query parameters — `region_id` and `bbox` are mutually exclusive, and exactly one is required:**

| Condition | Status | Body |
|---|---|---|
| Both provided | `400` | `{"error":"region_id and bbox are mutually exclusive"}` |
| Neither provided | `400` | `{"error":"region_id or bbox is required"}` |
| `region_id` provided, not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |
| `bbox` provided, malformed (not exactly 4 comma-separated numbers, or fails range/order checks) | `400` | same family of messages as Flood Intelligence's own `GET /map/flood-overlay?bbox=` — see [that route's own table](03-flood-intelligence.md#get-mapflood-overlaybboxwestsoutheastnorthmin_risk) for the exact per-case wording |
| Success (either filter) | `200 OK` | array, possibly empty, the shared `incidentReportResponse` shape |

There is **no unscoped "every report in the country" mode** on this route — one of the two spatial
filters is always required. `bbox` uses the same `west,south,east,north` ordering (matching
Leaflet's `getBounds().toBBoxString()`) as every other bbox filter in this API.

---

## The shared admin list route (M15 FE-2, FE-3, FE-5)

**One route serves three different roadmap FEs** — an unscoped heatmap view, a status-filtered
triage queue, and an AI-risk-ranked list are all the same underlying "list every report, optionally
filtered/sorted" query, just with different query parameters. Rather than three routes, there's
one: `GET /admin/incident-reports?status=&sort=`.

### `GET /admin/incident-reports?status=&sort=`

**Auth required:** Yes, role `admin` or `super_admin`.

**Query parameters — both optional and independent, combine freely (e.g.
`?status=verified&sort=priority_score`):**
- `status` — one of `reported`/`verified`/`in_progress`/`resolved`/`rejected`. Omitted = every
  status (this is **M15 FE-2**'s system-wide admin heatmap use).
- `sort` — the only valid value is `priority_score`. When set, orders by `priority_score`
  descending, with **unscored reports (`priority_score` never set) sorting last, not first and not
  excluded** (`NULLS LAST`). Omitted, the default order is newest-first
  (this is **M15 FE-5**'s risk-ranking use; `status` alone, without `sort`, is **M15 FE-3**'s
  triage queue).

**No `region_id`/`bbox` requirement at all** — this is deliberately the "everything" view, gated
by role rather than by a spatial filter, and is a genuinely **separate route** from the public
`GET /incident-reports` (not a role-based bypass folded into that public route).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success (any combination of params, including neither) | `200 OK` | array, possibly empty, shared `incidentReportResponse` shape |
| `status` present but not one of the five values | `400` | `{"error":"status must be one of: reported, verified, in_progress, resolved, rejected"}` |
| `sort` present but not `priority_score` | `400` | `{"error":"sort must be one of: priority_score"}` |

---

### `PATCH /admin/incident-reports/{id}/verify`

**Auth required:** Yes, role `admin` or `super_admin`. No request body.

**Behavior** — M15 FE-3's "approve" action. Not a separate use case: this calls the exact same
status mutator as `PATCH /incident-reports/{id}/status` above, fixed to `status: "verified"`. Same
success/error shape as that route (see above), just with no `status` field to send.

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report, `status: "verified"` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |

---

### `PATCH /admin/incident-reports/{id}/reject`

**Auth required:** Yes, role `admin` or `super_admin`. No request body.

**Behavior** — M15 FE-3's "reject" action. Same shape as `verify` above, fixed to
`status: "rejected"`.

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report, `status: "rejected"` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |

---

## FE-2 (M16) — Incident tracking, region-scoped (NGO)

**Routes:** `GET /ngo/incident-reports?region_id=`.

### `GET /ngo/incident-reports?region_id=`

**Auth required:** Yes. Open to **any** NGO staff (admin or volunteer) — no `RequireRole`;
authorization comes entirely from the NGO-region-membership check itself.

**Query parameter:** `region_id` — required, and must be one the caller's own NGO actually
operates in (no `bbox` alternative — this is regional tracking, not a map viewport).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, shared `incidentReportResponse` shape |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |
| Caller has no NGO membership | `400` | `{"error":"account has no ngo membership"}` |
| Caller's NGO does not operate in this region | `403` | `{"error":"your ngo does not operate in this region"}` |

---

## FE-3 (M16) — NGO review/verify within operational authority

**Routes:** `PATCH /ngo/incident-reports/{id}/verify`.

### `PATCH /ngo/incident-reports/{id}/verify`

**Auth required:** Yes, role `ngo_admin` **only** — a credibility judgment call, same "bigger call
than routine tracking" split as shelter certification. No request body.

**Behavior**

Same underlying status mutator as the admin `verify` route, restricted to reports whose location
falls within the caller's own NGO's operational regions. **Existence is checked before
authorization** — a nonexistent report ID always surfaces as `404`, never a misleading `403`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report, `status: "verified"` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| Caller role isn't `ngo_admin` | `403` | `{"error":"insufficient permissions"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |
| Caller has no NGO membership | `400` | `{"error":"account has no ngo membership"}` |
| Report exists, but its location is outside every region the caller's NGO operates in | `403` | `{"error":"this incident report is outside any region your ngo operates in"}` |

---

## FE-4 (M16) — NGO updates incident states within region

**Routes:** `PATCH /ngo/incident-reports/{id}/status`.

### `PATCH /ngo/incident-reports/{id}/status`

**Auth required:** Yes. Open to **any** NGO staff (admin or volunteer) — routine operational
tracking, not a judgment call like `verify`.

**Request**
```json
{ "status": "in_progress" }
```
**Restricted to exactly `verified`/`in_progress`/`resolved`** — narrower than the admin-only
generic route's full five-value set. An NGO **cannot** reopen a report back to `reported`, and
**cannot** reject one (`rejected` is specifically an admin credibility judgment, M15 FE-3, not an
NGO's call).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated report |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `status` missing, or not one of the three allowed values (including a well-formed but disallowed value like `reported`/`rejected`) | `400` | bind-failure shape (missing) or `{"error":"status must be one of: verified, in_progress, resolved"}` |
| No report with that ID | `404` | `{"error":"incident report not found"}` |
| Caller has no NGO membership | `400` | `{"error":"account has no ngo membership"}` |
| Report's location is outside every region the caller's NGO operates in | `403` | `{"error":"this incident report is outside any region your ngo operates in"}` |
