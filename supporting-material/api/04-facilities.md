# Phase 4 — Facilities (`internal/facilities`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Facilities owns four related but independent aggregates: **shelters/relief centers**
(capacity, certification, open/closed), **infrastructure** (hospitals/bridges/utilities and their
safety status), **essential locations** (ATMs, grocery stores, pharmacies — low-touch,
high-cardinality points of interest, mostly meant to be bulk-imported rather than hand-curated),
and **offline map packages** (a pointer to an already-generated downloadable map bundle — this
backend does not generate the bundle itself). A fifth concept, **essential location status
reports**, is the crowdsourced open/closed signal citizens submit against either an essential
location or a shelter.

| Group | Base path | Middleware |
|---|---|---|
| public map/reference reads | `/infrastructure`, `/shelters`, `/essential-locations`, `/regions/{id}/offline-map` | none |
| crowdsourced status reports | `/essential-locations/{id}/status-reports`, `/shelters/{id}/status-reports` (`POST` only) | `RequireAuth` — any authenticated account, not NGO/admin-restricted |
| `ngo` | `/ngo/shelters` | `RequireAuth` (`POST` additionally requires `RequireRole("ngo_admin")`) |
| shelter occupancy/certification | `/shelters/{id}/occupancy`, `/shelters/{id}` (`PATCH`) | `RequireAuth` (`PATCH /shelters/{id}` additionally requires `RequireRole("ngo_admin")`) |
| `admin` | `/admin/infrastructure`, `/admin/essential-locations`, `/admin/offline-map-packages` | `RequireAuth`, `RequireRole("admin", "super_admin")` |

**Shared convention across this whole module:** `location` fields (on shelters, infrastructure,
essential locations) are embedded GeoJSON `Point` objects — `{"type":"Point","coordinates":[lng,lat]}`
— same real-nested-object convention as `boundary` in Geo/Flood Intelligence, not a
JSON-encoded string. `region_id` is **never** client-supplied for any of these three
location-bearing aggregates — it's always resolved live via a spatial join at read time, same
convention as `flood_predictions`/`hazard_zones`. The one deliberate exception is
`offline_map_packages`, which has no location column at all (it represents a *file*, not a point
on a map) — its `region_id` **is** a direct, required, client-supplied field, and a bad one
produces a genuinely different error/status than every other module's spatial `region_id` filters.
See that route's own section.

---

## FE-2 (M8) — Infrastructure overlays: hospitals/bridges/utilities, safe/at-risk

**What it covers:** admin-curated reference data for critical infrastructure — no NGO ownership
concept at all here, unlike shelters.

**Routes:** `GET /infrastructure?region_id=`, `POST /admin/infrastructure`,
`PATCH /admin/infrastructure/{id}/status`.

### `GET /infrastructure?region_id=`

**Auth required:** No — public.

**Query parameter:** `region_id` — **required**, same "no unscoped nationwide query" convention as
`GET /flood-predictions`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

```json
[
  {
    "id": "c1d2e3f4-...",
    "name": "General Hospital",
    "type": "hospital",
    "location": { "type": "Point", "coordinates": [67.05, 24.86] },
    "region_id": "83754148-...",
    "status": "safe",
    "last_status_update": "2026-09-20T06:00:00Z",
    "created_at": "2026-09-18T00:00:00Z"
  }
]
```
`type` is one of `hospital`/`bridge`/`utility`. `status` is one of `safe`/`at_risk`/`damaged`.

---

### `POST /admin/infrastructure`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request**
```json
{ "name": "General Hospital", "type": "hospital", "location": { "type": "Point", "coordinates": [67.05, 24.86] } }
```
`name`/`type`/`location` all required. `type` must be one of `hospital`/`bridge`/`utility`.

**Behavior**

Always creates the entry as `status: "safe"` — there is no way to set an initial status other than
safe through this route; call `PATCH .../status` immediately after if it's already known to be
otherwise.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the new infrastructure object (same shape as a list entry) |
| `name` missing/blank | `400` | `{"error":"name is required"}` or bind-failure shape |
| `type` missing or invalid | `400` | bind-failure shape (missing) or `{"error":"type must be one of: hospital, bridge, utility"}` |
| `location` missing | `400` | bind-failure shape |

---

### `PATCH /admin/infrastructure/{id}/status`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request**
```json
{ "status": "at_risk" }
```
`status` required, one of `safe`/`at_risk`/`damaged`. **Not** a partial patch — this route's only
job is setting the status.

**Behavior**

**No guard against re-setting the same status, and no restriction on transition direction** — going
`at_risk → safe → at_risk` again as conditions change is a normal, expected cycle for this
aggregate, unlike hazard zones' one-way `resolve`. Every call just validates and overwrites.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated infrastructure object |
| `id` (path) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No infrastructure entry with that ID | `404` | `{"error":"infrastructure not found"}` |
| `status` missing, or not one of the three values | `400` | bind-failure shape (missing) or `{"error":"status must be one of: safe, at_risk, damaged"}` |

---

## FE-6 (M8) — Shelter/safe point overlay: capacity, certification, availability

**What it covers:** the public, read-only half of shelters — capacity, certification status, and
open/closed availability, for citizen map consumption. (The NGO-side write half —
registering/managing a shelter — is a separate FE, M16 FE-9, [documented below](#fe-9-m16--shelterrelief-center-occupancy-facilities-certification--ngo-view).)

**Routes:** `GET /shelters?region_id=`, `GET /shelters/{id}`.

### `GET /shelters?region_id=`

**Auth required:** No — public.

**Query parameter:** `region_id` — required, same convention as `GET /infrastructure`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

```json
[
  {
    "id": "d4e5f6a7-...",
    "name": "Community Center Shelter",
    "type": "shelter",
    "location": { "type": "Point", "coordinates": [67.1, 24.9] },
    "region_id": "83754148-...",
    "capacity_total": 200,
    "capacity_current": 45,
    "certification_status": "certified",
    "status": "open",
    "managed_by_ngo_id": "397674ec-...",
    "created_at": "2026-09-18T00:00:00Z",
    "updated_at": "2026-09-20T06:00:00Z"
  }
]
```
`type` is `shelter`/`relief_center`. `certification_status` is `certified`/`pending`/`uncertified`.
`status` is `open`/`closed` (this is the shelter's own operational status — a separate concept
from the crowdsourced status reports described below). `managed_by_ngo_id` is omitted entirely if
the shelter was somehow registered with no managing NGO (not possible through the normal
registration route, which always requires one, but the schema technically allows it).

---

### `GET /shelters/{id}`

**Auth required:** No — public.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | one shelter object, same shape as above |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No shelter with that ID | `404` | `{"error":"shelter not found"}` |

---

## FE-5 (M10) — Open/closed status of essential locations (incl. shelters)

**What it covers:** the crowdsourced "is this place actually open right now" signal — separate
from a shelter's own `status` field (which the managing NGO controls) or the fact that essential
locations have no status field of their own at all.

**Routes:** `GET /essential-locations?region_id=`, `POST /admin/essential-locations`,
`POST /essential-locations/{id}/status-reports`, `POST /shelters/{id}/status-reports`,
`GET /essential-locations/{id}/status-reports`.

### `GET /essential-locations?region_id=`

**Auth required:** No — public.

**Query parameter:** `region_id` — required, same convention as above.

**Behavior**

Each entry is enriched with its **most recent** status report, if any exists — a single extra
lookup per location, not a full history. A location that has never had a report submitted against
it **omits `current_status`/`status_reported_at` entirely** rather than defaulting to `"open"` —
treat their absence as genuinely "unknown," not "assumed open."

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

```json
[
  {
    "id": "e5f6a7b8-...",
    "name": "Corner Pharmacy",
    "type": "pharmacy",
    "location": { "type": "Point", "coordinates": [67.02, 24.85] },
    "region_id": "83754148-...",
    "current_status": "open",
    "status_reported_at": "2026-09-20T05:30:00Z",
    "created_at": "2026-09-01T00:00:00Z"
  }
]
```
`type` is one of `atm`/`grocery_store`/`pharmacy`. A never-reported location's JSON simply lacks
the `current_status`/`status_reported_at` keys.

---

### `POST /admin/essential-locations`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request**
```json
{ "name": "Corner Pharmacy", "type": "pharmacy", "location": { "type": "Point", "coordinates": [67.02, 24.85] } }
```
`name`/`type`/`location` all required; `type` one of `atm`/`grocery_store`/`pharmacy`.

**Behavior**

This is the **manual fallback only** — the primary way essential locations are meant to populate
is a bulk OSM/Overpass import (a separate, out-of-scope script), not this route. Note this
aggregate has **no status field at all** — you cannot set an initial open/closed state here; that
only ever comes from a status report (below).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the new essential location object |
| `name` missing/blank | `400` | `{"error":"name is required"}` or bind-failure shape |
| `type` missing or invalid | `400` | bind-failure shape (missing) or `{"error":"type must be one of: atm, grocery_store, pharmacy"}` |
| `location` missing | `400` | bind-failure shape |

---

### `POST /essential-locations/{id}/status-reports`

**Auth required:** Yes — **any** authenticated account. This is the crowdsourcing mechanism
itself, deliberately open to every citizen, not admin/NGO-restricted.

**Request**
```json
{ "status": "open" }
```
`status` required, one of `open`/`closed`.

**Behavior**

**No uniqueness constraint** — the same account can submit multiple reports against the same
location over time as real-world conditions change (this is a time-series log, not a one-time
vote). The submitting account's identity **is stored** server-side (kept for potential future
credibility-scoring use) but is **never returned in any response, ever** — reporting is
effectively anonymous from the caller's own point of view; there is no way to retrieve "my own
report history" through this API.

A malformed/nonexistent-but-well-formed-as-the-literal-all-zero-UUID `{id}` path parameter is
explicitly rejected with a clean `400` rather than allowed to reach the database — this was a real
bug fixed during development (a client-supplied all-zero UUID previously satisfied Go's `uuid.Parse`
and would have silently violated a database constraint, surfacing as an opaque `500`; it's now
caught before the query ever runs).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `id` (path) malformed, or the literal all-zero UUID | `400` | `{"error":"id must be a valid uuid"}` (malformed) or `{"error":"a valid target id is required"}` (all-zero) |
| `status` missing, or not `open`/`closed` | `400` | bind-failure shape (missing) or `{"error":"status must be one of: open, closed"}` |

```json
{ "id": "f6a7b8c9-...", "essential_location_id": "e5f6a7b8-...", "status": "open", "created_at": "2026-09-20T05:30:00Z" }
```
Note: this response has **no existence check on the target** — submitting a report against a
well-formed but genuinely nonexistent (non-zero) essential-location ID is not explicitly guarded
against at this layer; if you need to confirm a location exists first, call
`GET /essential-locations?region_id=` or handle a resulting database-level failure gracefully.

---

### `POST /shelters/{id}/status-reports`

**Auth required:** Yes — any authenticated account. Identical shape, behavior, and the same
proactive all-zero-UUID guard as the essential-location version above — the only difference is the
target (`shelter_id` instead of `essential_location_id`) and the response field name.

**This is advisory-only** — it never touches the shelter's own `status` field directly (that
remains entirely under the managing NGO's control via `PATCH /shelters/{id}`). **There is
currently no route to read this history back for a shelter** — unlike essential locations, no
`GET /shelters/{id}/status-reports` exists yet, so this data is write-only from the frontend's
perspective today.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | `{"id","shelter_id","status","created_at"}` |
| `id` (path) malformed, or the literal all-zero UUID | `400` | same two variants as above |
| `status` missing, or not `open`/`closed` | `400` | same as above |

---

### `GET /essential-locations/{id}/status-reports`

**Auth required:** No — public. The report history itself isn't sensitive; only the reporter's
identity is, and that never leaves the server (see above).

**Behavior**

**Never 404s, even for a nonexistent essential-location ID** — same "a filter route doesn't 404 on
a bad filter" convention used throughout this API; it simply returns `[]`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (well-formed `id`) | `200 OK` | array, possibly empty |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |

```json
[ { "id": "f6a7b8c9-...", "status": "open", "created_at": "2026-09-20T05:30:00Z" } ]
```
Note: **no `essential_location_id` field and no reporter identity** in this specific response
shape — leaner than the `POST` response above, and deliberately so.

---

## FE-5 (M11) — Download offline map data

**What it covers:** a pointer to an already-generated, downloadable offline map bundle for a
region — **this backend does not generate map tiles, does not bundle a `.mbtiles` file, and does
not know anything about how a mobile client actually reads one offline.** All of that is a
separate pipeline and mobile-side concern, entirely out of scope here. This is metadata only: a
URL, a version string, and an optional size.

**Routes:** `GET /regions/{id}/offline-map`, `POST /admin/offline-map-packages`.

### `GET /regions/{id}/offline-map`

**Auth required:** No — public. Meant to be called while a citizen is still online, ahead of
actually needing offline data.

**Behavior**

Always returns the single **most recent** package registered for the region (`ORDER BY
generated_at DESC`, first match) — registering a new (e.g. v2) package supersedes the previous one
in this response without deleting the old row; the old version remains in the database as history,
just no longer returned here.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | see shape below |
| `id` (path, the region's UUID) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No package has ever been registered for this region | `404` | `{"error":"no offline map package found for this region"}` |

```json
{
  "id": "a7b8c9d0-...",
  "region_id": "83754148-...",
  "package_url": "https://cdn.example.com/maps/sindh-v2.mbtiles",
  "version": "v2",
  "size_bytes": 15728640,
  "generated_at": "2026-09-19T00:00:00Z"
}
```
`size_bytes` is omitted entirely when unknown — genuinely optional at registration time, not
always present.

---

### `POST /admin/offline-map-packages`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request**
```json
{ "region_id": "83754148-...", "package_url": "https://cdn.example.com/maps/sindh-v2.mbtiles", "version": "v2", "size_bytes": 15728640 }
```
- `region_id` — required, **direct, client-supplied FK** (a genuine, deliberate exception to this
  module's own "resolve region_id live via spatial join" rule elsewhere — this row has no location
  column at all, nothing to spatially intersect against; it's simply a stated fact).
- `package_url`, `version` — required, non-blank after trimming.
- `size_bytes` — optional, rejected if negative.

**Behavior**

**Always inserts a brand-new row — never overwrites or replaces a previous version.** A region
naturally accumulates one row per generation over time, a built-in version history, even though
only the latest is ever surfaced by the `GET` route above.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the new package object (same shape as the `GET` response above) |
| `region_id` missing, or **the literal all-zero UUID** | `400` | `{"error":"region_id is required"}` (proactively guarded in the domain constructor before ever reaching SQL — the same zero-UUID bug class caught elsewhere in this API) |
| `region_id` well-formed but not a valid UUID string | `400` | `{"error":"region_id must be a valid uuid"}` (caught at the HTTP layer) |
| `region_id` well-formed, non-zero, but references a genuinely nonexistent region | `404` | `{"error":"region not found"}` (via the foreign-key violation) |
| `package_url` missing/blank | `400` | `{"error":"package_url is required"}` or bind-failure shape |
| `version` missing/blank | `400` | `{"error":"version is required"}` or bind-failure shape |
| `size_bytes` negative | `400` | `{"error":"size_bytes cannot be negative"}` |

**Frontend handling:** note this route's `region_id` failure modes are genuinely different from
every spatial `region_id` filter elsewhere in this API — here a bad reference is a real foreign-key
lookup (can 404), not a live spatial join (which never 404s, it just returns fewer results). Don't
assume `region_id` always behaves identically across this whole API; check whether the specific
aggregate stores it directly (this route, and Relief Operations' `donation_campaigns`) or resolves
it live (almost everything else).

---

## FE-9 (M16) — Shelter/relief center occupancy, facilities, certification — NGO view

**What it covers:** the NGO-facing half of shelter management — registering a shelter your own
NGO runs, tracking day-to-day occupancy, and the bigger calls (certification, opening/closing).

**Routes:** `GET /ngo/shelters`, `POST /ngo/shelters`, `PATCH /shelters/{id}/occupancy`,
`PATCH /shelters/{id}`.

Every route below resolves "which NGO" from the caller's own account (same pattern as Identity's
`GET /ngo/me` and Geo's `GET /ngo/me/regions`) — there is no path parameter for the NGO itself.

### `GET /ngo/shelters`

**Auth required:** Yes. Open to **any** NGO staff — both `ngo_admin` and `ngo_volunteer`.

**Behavior**

Returns every shelter with `managed_by_ngo_id` equal to the caller's own NGO — a direct filter,
**not** a spatial query (unlike the public `GET /shelters?region_id=`).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty, same shelter shape as the public routes |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |

---

### `POST /ngo/shelters`

**Auth required:** Yes, role `ngo_admin` only.

**Request**
```json
{ "name": "Community Center Shelter", "type": "shelter", "location": { "type": "Point", "coordinates": [67.1, 24.9] }, "capacity_total": 200 }
```
All four fields required. `type` one of `shelter`/`relief_center`. `capacity_total` must be a
positive integer — note a literal `0` (or an omitted field) is rejected by the **request binder
itself** (a generic bind-failure response), not the domain's own friendlier "capacity_total must
be greater than zero" message, since `binding:"required"` on a plain Go `int` treats zero the same
as "field absent." Either way you get a `400`; only the exact error body differs.

**Behavior**

`managed_by_ngo_id` is **never** a request field — always resolved server-side from the caller's
own account, so an NGO can only ever register a shelter under itself. Always starts
`certification_status: "pending"`, `status: "open"`, `capacity_current: 0` — self-registration is
explicitly **not** self-certification; only `PATCH /shelters/{id}` can later move certification to
`"certified"`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the new shelter object |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |
| `name` missing/blank | `400` | `{"error":"name is required"}` or bind-failure shape |
| `type` missing/invalid | `400` | bind-failure shape (missing) or `{"error":"type must be one of: shelter, relief_center"}` |
| `location` missing | `400` | bind-failure shape |
| `capacity_total` zero, negative, or omitted | `400` | bind-failure shape (see note above) |

---

### `PATCH /shelters/{id}/occupancy`

**Auth required:** Yes. Open to **any** NGO staff (admin or volunteer) — day-to-day headcount
tracking, not a structural change, so it's deliberately not `ngo_admin`-restricted.

**Request**
```json
{ "capacity_current": 87 }
```
Required, **not** a partial patch — this route's entire purpose is setting this one value.
Bounded to `[0, capacity_total]` — you cannot report more occupants than the shelter's own
registered total capacity.

**Behavior**

Ownership is checked in the application layer, not just by role: the caller must belong to the
**specific NGO that manages this shelter**, not just be NGO staff somewhere. Registering a shelter
gives an NGO no authority over anyone else's.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated shelter object |
| `id` (path) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |
| No shelter with that ID | `404` | `{"error":"shelter not found"}` |
| Shelter exists but is managed by a **different** NGO | `403` | `{"error":"this shelter is not managed by your ngo"}` |
| `capacity_current` negative, or greater than `capacity_total` | `400` | `{"error":"capacity_current must be between 0 and capacity_total"}` |

---

### `PATCH /shelters/{id}`

**Auth required:** Yes, role `ngo_admin` only — a bigger call than occupancy tracking (closing a
shelter, or changing its certification), same restriction level as registering one.

**Request** — true [partial patch](README.md#patch-semantics--real-partial-patch-not-full-replace):
```json
{ "certification_status": "certified" }
```
Exactly two possible fields, both optional/nilable, but **at least one must be provided**:
`certification_status` (one of `certified`/`pending`/`uncertified`), `status` (one of
`open`/`closed`).

**Behavior**

Same ownership check as occupancy above.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated shelter object |
| `id` (path) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |
| No shelter with that ID | `404` | `{"error":"shelter not found"}` |
| Shelter managed by a different NGO | `403` | `{"error":"this shelter is not managed by your ngo"}` |
| Both fields omitted | `400` | `{"error":"at least one of certification_status or status must be provided"}` |
| `certification_status` present but invalid | `400` | `{"error":"certification_status must be one of: certified, pending, uncertified"}` |
| `status` present but invalid | `400` | `{"error":"status must be one of: open, closed"}` |
