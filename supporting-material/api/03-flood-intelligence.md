# Phase 3 — Flood Intelligence (`internal/floodintel`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Flood Intelligence owns two related but distinct concepts: **`flood_predictions`** (the ML
model's raw output — a risk classification + confidence score for one tile of one model run) and
**`hazard_zones`** (a drawable geographic area currently flagged hazardous, whether it came from
an AI model run or a human — admin or NGO — manually declaring one). Every AI-sourced hazard zone
is paired 1:1 with the flood prediction that produced it; a manually-declared zone has no paired
prediction at all.

| Group | Base path | Middleware |
|---|---|---|
| public citizen-facing routes | `/flood-predictions`, `/map/flood-overlay`, `/hazard-zones/*` (except `/risk-check` and `/{id}` are also public) | none |
| ML ingestion | `/internal/flood-predictions` | `X-Internal-Service-Key` header (see below — **not** a user credential) |
| `admin` | `/admin/hazard-zones`, `/admin/flood-predictions` | `RequireAuth`, `RequireRole("admin", "super_admin")` |
| manual hazard declaration | `/admin/hazard-zones` (`POST` only) | `RequireAuth`, `RequireRole("admin", "super_admin", "ngo_admin")` — **note this is a different, broader role list than the `admin` group above**, even though it shares the same URL path; see that route's own section |

**⚠️ Three different response shapes for "a hazard zone" exist in this module, and they are not
interchangeable — field names genuinely differ between them.** Read the shared section below
before any individual route.

---

## The three hazard-zone response shapes

A `HazardZone` is one aggregate, but three different routes serialize it three different ways,
each suited to a different consumer. Getting these mixed up is the single easiest mistake to make
integrating against this module.

### 1. `hazardZoneResponse` — the full aggregate

Used by: `GET /admin/hazard-zones`, `PATCH /admin/hazard-zones/{id}/resolve`,
`POST /admin/hazard-zones`.

```json
{
  "id": "b7e1...",
  "source": "ai_prediction",
  "risk_level": "high",
  "boundary": { "type": "Polygon", "coordinates": [[[67.5,24.5],[67.6,24.5],[67.6,24.6],[67.5,24.6],[67.5,24.5]]] },
  "region_id": "83754148-...",
  "status": "active",
  "created_by": "48434d1b-...",
  "detected_at": "2026-09-20T06:00:00Z",
  "resolved_at": "2026-09-20T09:00:00Z",
  "flood_prediction_id": "a1b2c3d4-..."
}
```
`source` is one of `ai_prediction`/`manual_admin`/`manual_ngo`. `region_id`, `created_by`, and
`flood_prediction_id` are **omitted entirely** (not `""`) when not applicable — e.g. `created_by`
is absent for every AI-sourced zone (no human declared it), and `flood_prediction_id` is absent
for every manually-declared zone (no paired model output). `resolved_at` is present only once the
zone has actually been resolved.

### 2. `hazardZoneDetailResponse` — the map-tooltip shape

Used by: `GET /hazard-zones/{id}` **only**.

```json
{
  "id": "b7e1...",
  "source": "ai_prediction",
  "risk_level": "high",
  "boundary": { "...": "..." },
  "status": "active",
  "detected_at": "2026-09-20T06:00:00Z",
  "resolved_at": "2026-09-20T09:00:00Z",
  "confidence_score": 0.82,
  "model_version": "convlstm-unet-v3",
  "valid_from": "2026-09-20T00:00:00Z",
  "valid_until": "2026-09-21T00:00:00Z",
  "generated_at": "2026-09-20T05:58:00Z"
}
```
**No `region_id`, no `created_by`, no `flood_prediction_id`** — this shape trades those for the
paired flood prediction's own metadata (`confidence_score`/`model_version`/`valid_from`/
`valid_until`/`generated_at`), flattened directly onto the response, since that's what a map
tooltip actually needs to show. For a **manually-declared** zone (no paired prediction), all five
of those prediction fields are **omitted entirely** — the zone still returns successfully, just
without them.

### 3. `mapOverlayEntryResponse` — the bulk map-rendering shape

Used by: `GET /map/flood-overlay` **only**. Note the ID key is spelled differently here.

```json
{
  "hazard_zone_id": "b7e1...",
  "risk_level": "high",
  "boundary": { "...": "..." },
  "confidence_score": 0.82,
  "detected_at": "2026-09-20T06:00:00Z"
}
```
The ID field is `hazard_zone_id`, **not `id`** — this is the one shape in this module that doesn't
call it `id`. `confidence_score` is omitted for a manually-declared zone (no paired prediction) —
your map rendering should fall back to a flat color rather than a probability-driven opacity
gradient when this key is absent.

**Frontend handling:** if you're writing a single TypeScript/etc. type for "a hazard zone" and
reusing it across all three routes, you will get real bugs (wrong field present/absent, `id` vs
`hazard_zone_id`). Define three separate response types, or a union, matching exactly what's
above.

---

## FE-1, FE-2, FE-3 (M7) — Flood probability, risk classification, confidence/uncertainty

**What it covers:** these three FEs are one resource viewed three ways in the source spec, and
this backend treats them as exactly that — one route ingests the model's output, one route reads
it back. `risk_level` (FE-2) and `confidence_score`/`uncertainty_score` (FE-3) are just fields on
the same `FloodPrediction` object FE-1 already returns; there is no separate route for either.

**Routes:** `POST /internal/flood-predictions` (ML service only), `GET /flood-predictions?region_id=`.

### `POST /internal/flood-predictions`

**This is not a frontend route.** It exists for the ML pipeline to push a model run's results
into this backend. Documented here for completeness (and because a frontend engineer debugging
"why is there no new hazard zone on the map" needs to understand this is how one gets created), not
because a web/mobile client should ever call it.

**Auth:** an `X-Internal-Service-Key: <shared secret>` header — a single, out-of-band-configured
value, compared with a constant-time comparison. **Not** a JWT, not tied to any account. A
missing or wrong key returns `401 {"error":"invalid or missing service key"}`.

**Request**
```json
{
  "model_version": "convlstm-unet-v3",
  "valid_from": "2026-09-20T00:00:00Z",
  "valid_until": "2026-09-21T00:00:00Z",
  "tiles": [
    {
      "boundary": { "type": "Polygon", "coordinates": [[[67.5,24.5],[67.6,24.5],[67.6,24.6],[67.5,24.6],[67.5,24.5]]] },
      "confidence_score": 0.82,
      "probability_raster_url": null,
      "uncertainty_score": null
    }
  ]
}
```
- `model_version`, `valid_from`, `valid_until` — required, shared across every tile in the batch
  (one model run = one set of these three values, many tiles).
- `tiles` — required, non-empty array (a missing key or an explicitly empty `[]` both fail the
  request binder itself before the service layer's own "at least one tile" check would ever run —
  in practice you cannot observe that domain-level error through this route). **Capped at 500
  tiles per request** — a full nationwide run (potentially thousands of tiles) must be split into
  multiple requests of at most 500 each; the server's own write timeout would otherwise kill an
  oversized single request mid-transaction anyway, so this cap turns that into an immediate,
  explicit error instead.
- Per tile: `boundary` required (GeoJSON, real object). `confidence_score` — **a plain number with
  no required-field validation at all**; omitting it from a tile is not an error and silently
  defaults to `0.0` (bucketed to `risk_level: "low"`, see below) rather than being rejected as
  missing. `probability_raster_url`/`uncertainty_score` — both genuinely optional, `null`/omitted
  is fine.
- **`risk_level` is never a request field anywhere in this payload.** The backend computes it
  itself from `confidence_score`: `< 0.34` → `low`, `0.34–0.67` → `medium`, `≥ 0.67` → `high`. The
  ML service cannot set this directly even if it tried.

**Behavior**

One request ingests an entire batch atomically — every tile's `flood_predictions` +
`hazard_zones` row pair is created in one database transaction; if any tile in the batch fails
validation, **nothing** from that request is persisted, not even the tiles that were individually
valid.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | `{"ingested": [...]}`, one entry per tile |
| Wrong/missing service key | `401` | `{"error":"invalid or missing service key"}` |
| Malformed body, or `tiles` missing/empty | `400` | bind-failure shape |
| More than 500 tiles | `400` | `{"error":"too many tiles in one request — submit in smaller batches"}` |
| Any tile's `confidence_score` outside `[0, 1]` | `400` | `{"error":"confidence_score must be between 0 and 1"}` |
| `model_version` blank | `400` | `{"error":"model_version is required"}` |
| `valid_from` not strictly before `valid_until` | `400` | `{"error":"valid_from must be before valid_until"}` |
| Any tile's `boundary` blank/missing | `400` | `{"error":"boundary is required"}` |

**Response body on success**
```json
{
  "ingested": [
    {
      "flood_prediction_id": "a1b2c3d4-...",
      "hazard_zone_id": "b7e1...",
      "risk_level": "high",
      "confidence_score": 0.82,
      "boundary": { "...": "..." }
    }
  ]
}
```

---

### `GET /flood-predictions?region_id=`

**Auth required:** No — public, same reasoning as `GET /regions`: citizen map data, needed before
login.

**Query parameter:** `region_id` — **required**. There is no unscoped "every prediction
nationwide" query on this route.

**Behavior**

`flood_predictions.region_id` is never populated at ingestion time (see the ingestion route
above — it always stays `NULL`); membership is resolved **live** on every call via a spatial join:
`flood_predictions → hazard_zones` (by their paired FK) `→ regions` (`ST_Intersects`). Also
filters to **currently-valid** predictions only (`valid_from <= now() <= valid_until`) — an
expired or not-yet-valid prediction never shows up here, regardless of region.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `region_id` missing | `400` | `{"error":"region_id is required"}` |
| `region_id` present but not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |

```json
[
  {
    "id": "a1b2c3d4-...",
    "risk_level": "high",
    "confidence_score": 0.82,
    "uncertainty_score": null,
    "probability_raster_url": null,
    "model_version": "convlstm-unet-v3",
    "valid_from": "2026-09-20T00:00:00Z",
    "valid_until": "2026-09-21T00:00:00Z",
    "generated_at": "2026-09-20T05:58:00Z"
  }
]
```
`uncertainty_score`/`probability_raster_url` are omitted entirely when null — this deployment's
model (a single deterministic ConvLSTM + U-Net, not an ensemble) never actually produces an
uncertainty score in practice, so expect this key to be consistently absent rather than sometimes
present with a real number.

---

## FE-1 (M8) — Dynamic heatmaps / risk overlays / confidence opacity

**Routes:** `GET /map/flood-overlay?bbox=`.

### `GET /map/flood-overlay?bbox=west,south,east,north`

**Auth required:** No — public.

**Query parameter:** `bbox` — **required**, exactly 4 comma-separated numbers:
`west,south,east,north` (i.e. `min_lng,min_lat,max_lng,max_lat`). **This ordering matches
Leaflet's own `getBounds().toBBoxString()` output exactly** — a Leaflet-based frontend can pass its
current viewport straight through with no reformatting.

**Behavior**

Returns only **`status: "active"`** hazard zones intersecting the given rectangle — this is a
viewport query, not a stored/named place, so it works even before `regions` has been seeded with
any real administrative boundaries. Uses the [bulk map-rendering response shape](#3-mapoverlayentryresponse--the-bulk-map-rendering-shape)
(`hazard_zone_id`, not `id`).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `bbox` missing | `400` | `{"error":"bbox is required (west,south,east,north)"}` |
| Not exactly 4 comma-separated values | `400` | `{"error":"bbox must have exactly 4 comma-separated values: west,south,east,north"}` |
| A value isn't a valid number | `400` | `{"error":"bbox values must be numbers"}` |
| Out-of-range lon/lat, or `west >= east` / `south >= north` | `400` | `{"error":"bbox must be west,south,east,north with west<east, south<north, and valid lon/lat ranges"}` |

An absurdly large bbox (e.g. the whole planet) is **not** rejected — it just returns a lot of
data. There is no server-side size cap on this route.

---

## FE-3 (M8) — Real-time personal risk score from GPS

**Routes:** `POST /hazard-zones/risk-check`.

### `POST /hazard-zones/risk-check`

**Auth required:** No — public. Deliberately a `POST`, not a `GET`, even though nothing is written
— a `GET` would put the caller's live GPS coordinate in the URL, which proxies/access
logs/browser history would then retain; a `POST` body avoids that. **Nothing from this call is
ever persisted** — a fresh spatial computation on every request.

**Request**
```json
{ "lat": 24.85, "lng": 67.02 }
```

**⚠️ `lat`/`lng` have no `required` validation at all — not even a presence check.** Omitting
either field from the request body is **not an error**: it silently defaults to `0` (via Go's
JSON-unmarshaling zero value), which is itself a valid coordinate (the equator/prime meridian) and
passes the domain's own range check without complaint. **The frontend is entirely responsible for
confirming it's actually sending real coordinates before calling this route** — a client-side bug
that fails to populate `lat`/`lng` will get back a normal `200` response for `(0, 0)`, not an
error telling you something's wrong.

**Behavior**

Three-tier lookup, in order: (1) is the point **inside** an active hazard zone (`ST_Contains`) —
if more than one overlapping zone matches, the **highest-severity** one wins (`high` > `medium` >
`low`); (2) if not inside any, what's the **nearest** active hazard zone, and its real distance in
meters; (3) if there are no active hazard zones anywhere in the entire system, a "nothing to
report" result.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Point inside a zone / nearest found / no zones exist at all | `200 OK` | see three shapes below — **all three are `200`, never an error** |
| `lat` outside `[-90, 90]` or `lng` outside `[-180, 180]` | `400` | `{"error":"lat must be between -90 and 90, lng must be between -180 and 180"}` |
| Malformed JSON body | `400` | bind-failure shape |

**Response — inside a zone**
```json
{ "inside_hazard_zone": true, "hazard_zone_id": "b7e1...", "risk_level": "high", "distance_meters": 0 }
```

**Response — outside every zone, but at least one exists somewhere**
```json
{ "inside_hazard_zone": false, "hazard_zone_id": "b7e1...", "risk_level": "high", "distance_meters": 842.3 }
```

**Response — no active hazard zones exist anywhere in the system**
```json
{ "inside_hazard_zone": false, "distance_meters": 0 }
```
Note `hazard_zone_id`/`risk_level` are **omitted entirely** in this last case (there is no zone to
reference) — check for their presence, don't assume they're always there just because
`inside_hazard_zone` is a boolean field.

---

## FE-5 (M8) — Tooltip: severity, confidence%, last update, metadata

**Routes:** `GET /hazard-zones/{id}`.

### `GET /hazard-zones/{id}`

**Auth required:** No — public.

**Behavior**

Uses the [map-tooltip response shape](#2-hazardzonedetailresponse--the-map-tooltip-shape) — see
that section for the exact fields and which are omitted for a manually-declared zone.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | see shape #2 above |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No hazard zone with that ID | `404` | `{"error":"hazard zone not found"}` |

---

## M9 FE-1 — AI-sourced half of alert fusion

No public route. This is an internal call this module is expected to eventually make into the
Alerting module (`alerting.NotifyFromHazardZone(...)`) whenever a new/escalated hazard zone
appears — not built as of this document, since `internal/alerting` doesn't exist yet. Nothing for
a frontend to call here.

---

## M15 FE-1 — Admin real-time hazard dashboard

**What it covers:** an admin-only, unfiltered-by-default table view — every hazard zone/prediction
regardless of status, with optional date-range and status filtering. Distinct from the citizen map
routes above, which only ever show `active` zones for the *current* time.

**Routes:** `GET /admin/hazard-zones?from=&to=&status=`, `GET /admin/flood-predictions?from=&to=`.

### `GET /admin/hazard-zones?from=&to=&status=`

**Auth required:** Yes, role `admin` or `super_admin`.

**Query parameters:** all optional.
- `from`, `to` — RFC3339 timestamps, filtering on `detected_at`. **Unlike the pagination
  params elsewhere in this API, an invalid value here is a hard `400`, not a silent fallback.**
- `status` — one of `active`/`resolved`.

**Behavior**

Uses the [full-aggregate response shape](#1-hazardzoneresponse--the-full-aggregate) — richer than
the citizen map's overlay shape, since an admin table needs the full picture (`source`,
`created_by`, `region_id`, `flood_prediction_id`), not just a drawable polygon. No implicit
`status: "active"` filter the way the citizen routes have — omitting `status` here returns
**every** zone, active and resolved alike.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `from`/`to` present but not valid RFC3339 | `400` | `{"error":"from must be a valid RFC3339 timestamp"}` / `{"error":"to must be a valid RFC3339 timestamp"}` |
| `status` present but not `active`/`resolved` | `400` | `{"error":"status must be one of: active, resolved"}` |

---

### `GET /admin/flood-predictions?from=&to=`

**Auth required:** Yes, role `admin` or `super_admin`.

**Query parameters:** `from`/`to` — optional RFC3339, filtering on `generated_at`. No `status`
param (predictions have no status field). **No "current validity window" restriction** — unlike
the citizen-facing `GET /flood-predictions`, this returns the full history regardless of
`valid_from`/`valid_until`.

Response shape is identical to `GET /flood-predictions` (the plain `floodPredictionResponse`
shape) — same fields, just an unscoped/unfiltered-by-region query instead.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| `from`/`to` present but not valid RFC3339 | `400` | same as above |

---

## M15 FE-2 — Hazard half of the system-wide admin heatmap

No new route — reuses `GET /admin/hazard-zones?status=active` directly (documented above). Do
**not** reuse `GET /map/flood-overlay?bbox=` for this purpose despite it also returning active
zones — that route is deliberately viewport-scoped (a map bounding box), the opposite of what a
system-wide, nationwide heatmap needs.

---

## Manual hazard-zone declaration + resolution (not tied to one specific FE, but needed)

**What it covers:** letting a human — an admin, or an NGO admin — directly declare a hazard zone
without waiting for a model run (e.g. eyewitness/ground-truth reports of flooding), and letting an
admin mark a hazard zone resolved once it's no longer relevant.

**Routes:** `POST /admin/hazard-zones`, `PATCH /admin/hazard-zones/{id}/resolve`.

### `POST /admin/hazard-zones`

**Auth required:** Yes — role `admin`, `super_admin`, **or `ngo_admin`**.

**⚠️ Despite the `/admin/...` path, this is NOT gated by the same middleware as the `admin` route
group documented above.** It's registered with its own, broader role list
(`RequireRole("admin", "super_admin", "ngo_admin")`) specifically because an NGO admin declaring a
hazard zone is a legitimate, expected action — not an admin-only one — even though the URL shares
the `/admin/hazard-zones` prefix with the genuinely admin-only `GET` route above. Do not assume
every route under `/admin/...` in this module requires the platform `admin`/`super_admin` role;
check each route's own documented role list.

**Request**
```json
{
  "boundary": { "type": "Polygon", "coordinates": [[[67.5,24.5],[67.6,24.5],[67.6,24.6],[67.5,24.6],[67.5,24.5]]] },
  "risk_level": "high"
}
```
- `boundary` — required, real GeoJSON object.
- `risk_level` — required, one of `low`/`medium`/`high`. **Unlike the AI ingestion path, this
  value genuinely comes from the caller** — a human directly asserting severity, since there's no
  model probability to threshold for a manual declaration.
- **`source` is never a request field.** It's derived entirely from the caller's own JWT role:
  `admin`/`super_admin` → `source: "manual_admin"`; `ngo_admin` → `source: "manual_ngo"`. You
  cannot set this yourself even by including a `source` key in the body — it's simply ignored (not
  even read by the request struct).

**Behavior**

Always creates the zone as `status: "active"`, with `created_by` set to the calling account and
`flood_prediction_id` absent (no paired model output — this is a human declaration).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | full-aggregate shape (#1 above) |
| Caller authenticated but role isn't one of the three allowed (defense-in-depth; `RequireRole` in `module.go` should already block this) | `403` | `{"error":"insufficient permissions"}` |
| `boundary` missing | `400` | bind-failure shape |
| `risk_level` missing, or not one of `low`/`medium`/`high` | `400` | bind-failure shape (missing) or `{"error":"risk_level must be one of: low, medium, high"}` (invalid value) |

---

### `PATCH /admin/hazard-zones/{id}/resolve`

**Auth required:** Yes, role `admin` or `super_admin` **only** — narrower than declaring one
(`ngo_admin` cannot resolve a zone, even one their own NGO declared). No request body.

**Behavior**

Transitions the zone from `active` to `resolved`, setting `resolved_at`. **Guards against
double-resolving** — a zone that's already resolved cannot be resolved again.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | full-aggregate shape (#1 above) |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No hazard zone with that ID | `404` | `{"error":"hazard zone not found"}` |
| Zone is already `resolved` | `400` | `{"error":"hazard zone is not active"}` |

**Frontend handling:** note this is `400`, **not** `409 Conflict` — unlike most other
"already-in-that-state" failures elsewhere in this API (e.g. Identity's `account already
suspended` is a `409`). Branch on the documented status per route rather than assuming every
double-transition error uses the same code across modules.
