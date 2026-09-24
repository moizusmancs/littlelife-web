# Phase 1 — Geo (`internal/geo`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Geo owns the canonical set of administrative boundaries (`regions` — provinces, districts,
tehsils) and each NGO's operational-coverage footprint (which regions it claims to serve). Every
other bounded context that needs "does this point/report/campaign fall inside a region" or "which
regions does this NGO operate in" ultimately reads through this module.

| Group | Base path | Middleware |
|---|---|---|
| public region reads | `/regions` | none |
| `ngo` | `/ngo` | `RequireAuth` (assign/remove additionally require `RequireRole("ngo_admin")`) |
| `admin` | `/admin` | `RequireAuth`, `RequireRole("admin", "super_admin")` |

**One deviation from the standard error shape to know about up front:** `POST /ngo/me/regions`
(`AssignRegionToNGO`) does **not** use this API's usual bind-failure body. A malformed/missing
JSON body on that one route returns `400 {"error":"region_id is required"}` with no `detail`
field, regardless of what was actually wrong with the request — verified directly against
`internal/geo/http/assign_region_to_ngo.go`. Every other route in this module (including this
one's own `region_id` UUID-format check, and everything in `POST`/`PATCH /admin/regions`) uses the
standard `{"error":"invalid request","detail":"..."}` shape described in the conventions doc.

---

## `boundary` — the one field every route below shares

Every `Region` object carries a `boundary` field: GeoJSON, embedded as a **real nested JSON
object** (not a JSON-encoded string you have to parse a second time) — e.g.
`"boundary": {"type":"Polygon","coordinates":[[[67,24],[68,24],[68,25],[67,25],[67,24]]]}`.
Coordinates are `[longitude, latitude]` pairs, standard GeoJSON ordering (**not** `[lat, lng]`) —
plug this directly into Leaflet/Mapbox GL/any GeoJSON-aware mapping library without reformatting.

When **writing** a region (`POST`/`PATCH /admin/regions`), send `boundary` the same way — a real
GeoJSON `Polygon` object, not a string. The backend attaches the coordinate system itself; you
never need to specify SRID or any Postgres-specific detail. Malformed GeoJSON that the binder
accepts as valid JSON but PostGIS itself rejects (self-intersecting rings, wrong geometry type,
etc.) surfaces as a generic `500 {"error":"internal server error"}` — the backend does not
currently translate PostGIS geometry errors into a clean `400`. If you get an unexplained `500` on
a region write, check the polygon is a valid, closed, non-self-intersecting ring before assuming
it's a backend bug.

---

## Foundational reference data (not tied to one specific FE)

**What it covers:** the canonical, publicly-browsable list of administrative regions every other
module's location picker, map overlay, and region-scoped filter depends on, plus the admin CRUD
that maintains it.

**Routes:** `GET /regions`, `GET /regions/{id}`, `POST /admin/regions`,
`PATCH /admin/regions/{id}`.

### `GET /regions?level=&parent_region_id=`

**Auth required:** No — public. Administrative boundaries aren't sensitive, and a location picker
(e.g. on the NGO registration form) needs this before a user is necessarily logged in.

**Query parameters:** both optional, and independent (combine freely).
- `level` — one of `province`, `district`, `tehsil`. Filters to that level only.
- `parent_region_id` — a region UUID. Filters to direct children of that region only (e.g. every
  district inside a given province). Not recursive — a `tehsil`'s grandparent province will not
  match its own `parent_region_id` filter; you'd query one level at a time for drill-down UI.

Omitting both returns every region in the system, flat, no pagination.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array (possibly all regions, possibly empty) |
| `level` present but not one of the three valid values | `400` | `{"error":"level must be one of: province, district, tehsil"}` |
| `parent_region_id` present but not a valid UUID | `400` | `{"error":"parent_region_id must be a valid uuid"}` |

```json
[
  {
    "id": "83754148-e767-40c9-b49b-254819429342",
    "name": "Test Province",
    "level": "province",
    "boundary": { "type": "Polygon", "coordinates": [[[67,24],[68,24],[68,25],[67,25],[67,24]]] },
    "created_at": "2026-09-13T03:38:31.453612Z",
    "updated_at": "2026-09-13T03:38:31.453612Z"
  }
]
```
`parent_region_id` is **omitted entirely** from the JSON (not sent as `""` or `null`) for a
top-level region with no parent (e.g. a province) — check for key presence if that distinction
matters, same convention as every other optional-UUID field in this API.

**Frontend handling:** for a province → district → tehsil drill-down UI, call this route once per
level as the user picks a parent (`GET /regions?level=district&parent_region_id=<province id>`),
rather than fetching everything up front and filtering client-side — there's no volume concern
either way at this schema's scale, but it keeps your UI's data needs explicit.

---

### `GET /regions/{id}`

**Auth required:** No — public.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | one region object, same shape as a list entry above |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No region with that ID | `404` | `{"error":"region not found"}` |

---

### `POST /admin/regions`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request**
```json
{
  "name": "Sindh",
  "level": "province",
  "parent_region_id": "",
  "boundary": { "type": "Polygon", "coordinates": [[[67,24],[68,24],[68,25],[67,25],[67,24]]] }
}
```
- `name` — required (binder), must be non-blank after trimming (domain).
- `level` — required (binder, as a non-empty string), then validated against the real enum
  (`province`/`district`/`tehsil`) at the domain layer.
- `parent_region_id` — optional. Omit the field or send `""` for a top-level region (e.g. a
  province). A non-empty value must be a valid UUID.
- `boundary` — required, a real GeoJSON object (see the note above).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the new region object |
| `name` missing or blank | `400` | `{"error":"region name is required"}` or bind-failure shape |
| `level` missing, or not one of the three valid values | `400` | bind-failure shape (missing) or `{"error":"level must be one of: province, district, tehsil"}` (invalid value) |
| `boundary` missing | `400` | bind-failure shape |
| `parent_region_id` present but not a valid UUID | `400` | `{"error":"parent_region_id is not a valid uuid"}` |
| `parent_region_id` is a well-formed UUID but no such region exists | `400` | `{"error":"parent region not found"}` |
| `boundary` is syntactically valid JSON but not valid GeoJSON geometry PostGIS accepts | `500` | `{"error":"internal server error"}` (see the note above — not currently translated to a clean `400`) |

**Frontend handling — note the status code on a bad parent reference:** a nonexistent
`parent_region_id` returns `400`, **not** `404` — worth remembering if you're branching UI logic
on status code alone, since almost every other "reference to a resource that doesn't exist"
failure elsewhere in this API (e.g. `GET /regions/{id}` itself, or a bad `region_id` when an NGO
assigns a region to itself, below) is a `404`. This one specific case is `400` because the backend
treats an invalid parent as a validation failure of the request, not a missing-resource lookup.

---

### `PATCH /admin/regions/{id}`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request** — true [partial patch](README.md#patch-semantics--real-partial-patch-not-full-replace):
```json
{ "name": "New Name" }
```
All four fields (`name`, `level`, `parent_region_id`, `boundary`) are optional/nilable — omit
anything you don't want to change. `parent_region_id` has three distinct states on this route: omit
it (unchanged), send `""` (clear to "no parent" — makes this region top-level), or send a real UUID
(set/change the parent). A region **cannot be set as its own parent** — sending this region's own
`id` as `parent_region_id` fails.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated region object |
| `id` (path) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No region with that `id` | `404` | `{"error":"region not found"}` |
| Every field omitted | `400` | `{"error":"at least one field must be provided to update"}` |
| `name` present but blank | `400` | `{"error":"region name is required"}` |
| `level` present but not a valid value | `400` | `{"error":"level must be one of: province, district, tehsil"}` |
| `boundary` present but empty/blank | `400` | `{"error":"boundary is required"}` |
| `parent_region_id` present, non-empty, not a valid UUID | `400` | `{"error":"parent_region_id is not a valid uuid"}` |
| `parent_region_id` set to this region's own `id` | `400` | `{"error":"region cannot be its own parent"}` |
| `parent_region_id` well-formed but references a nonexistent region | `400` | `{"error":"parent region not found"}` |

**Frontend handling:** because this is a real partial patch, if your admin UI shows a full "edit
region" form, only include fields the user actually changed in the PATCH body — do not round-trip
every field on every save (harmless for `name`/`level`/`boundary` since re-sending the current
value is a no-op, but re-sending `parent_region_id: ""` when the user didn't touch that field would
incorrectly detach the region from its real parent).

---

## FE-8 (partial) — NGO operational-regions coverage

**What it covers:** which regions an NGO claims to actively serve — a citizen picking an NGO to
donate to, or an admin evaluating NGO coverage, ultimately reads this; the routes below are how an
`ngo_admin` maintains it. (The org profile/contact-info/deactivate half of FE-8 lives in Identity,
[documented there](00-identity.md#fe-8-partial--ngo-organization-profile).)

**Routes:** `GET /ngo/me/regions`, `POST /ngo/me/regions`, `DELETE /ngo/me/regions/{regionID}`.

All three resolve "which NGO" from the caller's **own account**, the same way Identity's
`GET /ngo/me` does — there is no path parameter for the NGO itself, and no way to view or edit
another NGO's regions through these routes.

### `GET /ngo/me/regions`

**Auth required:** Yes. Open to **any** NGO staff — both `ngo_admin` and `ngo_volunteer` (no
`RequireRole` on this specific route, unlike assign/remove below — reading your own org's coverage
isn't a privileged action the way changing it is).

**Behavior**

Returns every region currently assigned to the caller's NGO, alphabetical by name. `[]` if none
have been assigned yet.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array of region objects, possibly empty |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |

---

### `POST /ngo/me/regions`

**Auth required:** Yes, role `ngo_admin` only — assigning/removing coverage is a bigger call than
viewing it, same restriction level as editing the org's profile.

**Request**
```json
{ "region_id": "83754148-e767-40c9-b49b-254819429342" }
```
**Reminder:** this route's bind-failure response does not match the standard shape — see the note
at the top of this document.

**Behavior**

Adds one region to the caller's NGO's operational coverage.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the full assigned region object |
| Malformed/missing JSON body | `400` | `{"error":"region_id is required"}` (non-standard shape — no `detail`) |
| `region_id` present but not a valid UUID | `400` | `{"error":"region_id must be a valid uuid"}` |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |
| Region already assigned to this NGO | `409 Conflict` | `{"error":"region already assigned to this ngo"}` |
| `region_id` well-formed but no such region exists | `404` | `{"error":"region not found"}` |

**Frontend handling:** note this is the opposite status code from `POST /admin/regions`' own bad
`parent_region_id` (`400` there, `404` here) — both stem from the same underlying "region doesn't
exist" fact, but are surfaced through two different domain errors depending on which route hit it.
Branch on the documented status per route, not on a generalized "bad reference = X" assumption.

---

### `DELETE /ngo/me/regions/{regionID}`

**Auth required:** Yes, role `ngo_admin` only.

**Behavior**

Removes one region from the caller's NGO's coverage. On success, returns **`204 No Content` with
an empty body** — do not attempt to parse a JSON response on success for this specific route.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `204 No Content` | *(empty)* |
| `regionID` (path) not a valid UUID | `400` | `{"error":"regionID must be a valid uuid"}` |
| Caller has no NGO affiliation | `403` | `{"error":"account is not affiliated with an ngo"}` |
| The pair (this NGO, this region) doesn't currently exist — either never assigned, or already removed, **or the region itself doesn't exist at all** | `404` | `{"error":"region is not assigned to this ngo"}` |

Note the last row: unlike `POST`, this route does **not** distinguish "region doesn't exist" from
"region exists but isn't assigned to your NGO" — both produce the identical `404`, since the
`DELETE` just matches zero rows either way and there's no separate existence check first.

---

## M16 FE-1 — Region-scoping (no dedicated route)

Region-scoping itself has no route here. It's a query-parameter convention (`?region_id=`) that
other modules' own list endpoints apply — e.g. Facilities' `GET /shelters?region_id=`, Relief
Operations' `GET /donation-campaigns?region_id=`. Consult each of those modules' own documentation
for how they resolve/require it; Geo only supplies the `region_id` values themselves via the
routes above.
