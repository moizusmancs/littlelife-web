# LittleLife Backend — Implementation Roadmap

This is the build order for the rest of the backend, following on from `internal/identity`
(already ~80% built) and grounded directly in `littlelife_schema_fe_mapping.md` — every table
name, FK, FE description, and bounded-context assignment below is pulled from that document (Part
1's module-by-module FE list, Part 2's bounded-context ownership map, Part 3's table glossary), not
reconstructed from memory. Cross-checked FE-by-FE against every `**FE-N**` line across all 16
modules so nothing is silently dropped — the "No Single Owner" section near the end exists
specifically to catch the FEs that don't belong to any one domain, and Modules 2–6 and 14 are
listed explicitly as out of scope/deferred rather than omitted.

**Reminder — don't forget this one:** `regions` needs to be seeded with REAL Pakistan
administrative boundaries (province/district/tehsil), not hand-drawn or placeholder polygons.
These already exist as downloadable data — the Humanitarian Data Exchange (HDX, data.humdata.org)
publishes Pakistan's official boundaries specifically curated for disaster-response projects like
this one; OpenStreetMap is a fallback source. This is a one-time import script (download the file,
insert one row per area) — not a route on this API, and it doesn't block building Phase 1's
routes — but nothing that depends on real region shapes (the flood-zone → region lookup via
`ST_Intersects` in Phase 3, accurate NGO operational-region coverage, any region-scoped dashboard)
will be meaningful until it's actually done.

**Architecture:** DDD monolith throughout — every bounded context below gets its own Go package
under `internal/`, built the same way `internal/identity` already is: `domain/` (aggregates,
ports, domain errors), `app/` (use cases), `infra/{postgres,redis,...}` (adapters), `http/`
(handlers + DTOs). No modular-monolith/vertical-slice style anywhere going forward.

**Migrations:** one small migration per logical unit of work, created *as you build that piece* —
never the whole schema up front.

**Routes:** every phase below lists every FE it's responsible for (including partial/shared FEs —
Part 2 itself lists several FEs under two domains when the write responsibility genuinely splits,
and this document does the same), the concrete route(s) that implement it, and, where an FE has no
dedicated route (pure client-side rendering, or a read composed from routes already listed
elsewhere), an explicit note saying so instead of silence.

---

## Why this order (the dependency graph)

1. **`regions` is the single most-depended-on table in the entire schema.** It has to exist early.
2. **`ngo_regions` needs `regions`**, so NGO support lands *after* Geo, not bundled into Identity's
   first pass.
3. **Cross-context FKs force follow-up migrations**: `alerts` needs `hazard_zones` +
   `incident_reports` + `missing_persons`; `escalations` additionally needs `messages`;
   `task_assignments` needs `incident_reports`; `credibility_events` needs `incident_reports`.
   Each lands as a follow-up on an already-built context.

---

## Quick-reference: full migration sequence (16 migrations, 40 tables)

**Migration filenames below are the ORIGINAL plan's numbering, not necessarily what's actually on
disk** — golang-migrate requires each new migration's version number to be higher than the last
one *applied*, not the one *planned*, so the real number depends on build order, not this table's
order. Every phase built so far has needed at least one renumbering (Facilities: `000006`→`000008`;
Trust: `000008`→`000009`, plus an unplanned `000010_add_location_trail` follow-up; Community
Intelligence: `000009`→`000011`, plus an unplanned `000012_add_incident_status_rejected`
follow-up) — each phase's own section states its real, applied filename; treat those as
authoritative, not this table.

| # | Migration name (as planned) | Tables created | New Go package | Depends on |
|---|---|---|---|---|
| 1 | `000001_create_accounts` | `accounts` | `internal/identity` | — (done) |
| 2 | `000002_create_refresh_tokens` | `refresh_tokens` | `internal/identity` | #1 |
| 3 | `000003_create_regions` | `regions` | `internal/geo` | #1 |
| 4 | `000004_add_ngo_support` | `ngos`, `ngo_regions`, `ngo_volunteer_invitations` + ALTER `accounts` | `internal/identity` | #1, #3 |
| 5 | `000005_create_flood_intelligence` | `hazard_zones`, `flood_predictions` | `internal/floodintel` | #1, #3 |
| 6 | `000006_create_facilities` (applied as `000008`) | `shelters`, `infrastructure`, `essential_locations`, `essential_location_status_reports`, `offline_map_packages` | `internal/facilities` | #1, #3, #4 |
| 7 | `000007_create_profiling` | `profiles`, `alert_preferences` | `internal/profiling` | #1 |
| 8 | `000008_create_trust_core` (applied as `000009`) | `safety_connections`, `trust_scores`, `moderation_actions` | `internal/trust` | #1 |
| 9 | `000009_create_community_intelligence` (applied as `000011`) | `incident_reports`, `incident_report_media`, `incident_report_votes`, `community_updates` | `internal/community` | #1, #3 |
| — | `000010_add_location_trail` (unplanned — see Phase 6) | `location_trail` | `internal/trust` (follow-up) | #8 |
| 10 | `000010_add_credibility_events` | `credibility_events` | `internal/trust` (follow-up) | #8, #9 |
| — | `000012_add_incident_status_rejected` (unplanned — see Phase 7) | ALTER `incident_status` enum | `internal/community` (follow-up) | #9 |
| 11 | `000011_create_relief_operations_core` | `aid_requests`, `donation_campaigns`, `donations`, `missing_persons`, `missing_person_sightings`, `field_observations`, `feedback` | `internal/relief` | #1, #3, #4 |
| 12 | `000012_create_alerting` | `alerts`, `alert_deliveries` | `internal/alerting` | #5, #9, #11 |
| 13 | `000013_add_task_assignments` | `task_assignments` | `internal/relief` (follow-up) | #9, #11 |
| 14 | `000014_create_communication` | `conversations`, `conversation_participants`, `messages`, `calls`, `call_participants` | `internal/communication` | #9, #11 |
| 15 | `000015_add_escalations` | `escalations` | `internal/relief` (follow-up) | #5, #9, #14 |
| 16 | `000016_create_reporting_and_audit` | `generated_reports`, `audit_log` | `internal/reporting` | #1, #3, #4 |

Plus two cross-cutting pieces that own **no migration of their own** — `internal/navigation`
(Module 11's live routing compute, reads Facilities + Flood Intelligence) and the "my activity
timeline" / "NGO regional overview" read-composition handlers (Module 1 FE-4, Module 16 FE-14) —
covered in the **No Single Owner** section at the end.

---

# Phase 0 — Finish Identity

### Migrations

**`000002_create_refresh_tokens`**
```sql
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_account_id ON refresh_tokens (account_id);
```

**`000004_add_ngo_support`** (after Geo — see Phase 1; `ngo_regions.region_id` needs `regions`) —
**done, as actually built.** `'deactivated'` was folded directly into this migration's enum rather
than added as a separate one, since FE-8's deactivate route landed before this migration had ever
shipped — no reason to split it into two:
```sql
CREATE TYPE ngo_status AS ENUM ('pending_approval', 'active', 'suspended', 'rejected', 'deactivated');

CREATE TABLE ngos (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT        NOT NULL,
    status         ngo_status  NOT NULL DEFAULT 'pending_approval',
    contact_email  TEXT,
    contact_phone  TEXT,
    created_by     UUID        NOT NULL REFERENCES accounts(id),
    approved_by    UUID        REFERENCES accounts(id),
    approved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- a citizen can have at most one pending/active NGO credited to them at a
-- time — this is what actually stops "approve a second NGO while already
-- ngo_admin of a first one," at the earliest possible point (insert time)
CREATE UNIQUE INDEX idx_ngos_created_by_unique
    ON ngos (created_by)
    WHERE status IN ('pending_approval', 'active');

CREATE TABLE ngo_regions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ngo_id      UUID        NOT NULL REFERENCES ngos(id),
    region_id   UUID        NOT NULL REFERENCES regions(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ngo_id, region_id)
);

CREATE TYPE ngo_volunteer_invitation_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE ngo_volunteer_invitations (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ngo_id              UUID        NOT NULL REFERENCES ngos(id),
    invited_account_id  UUID        NOT NULL REFERENCES accounts(id),
    invited_by          UUID        NOT NULL REFERENCES accounts(id),
    status              ngo_volunteer_invitation_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at        TIMESTAMPTZ
);

CREATE INDEX idx_ngo_volunteer_invitations_invited_account_id ON ngo_volunteer_invitations (invited_account_id);
CREATE INDEX idx_ngo_volunteer_invitations_ngo_id ON ngo_volunteer_invitations (ngo_id);

ALTER TABLE accounts
    ADD COLUMN ngo_id     UUID REFERENCES ngos(id),
    ADD COLUMN created_by UUID REFERENCES accounts(id);

CREATE INDEX idx_accounts_ngo_id ON accounts (ngo_id) WHERE ngo_id IS NOT NULL;
```

**Done:** swapped `docker-compose.yml`'s postgres image to `postgis/postgis:17-3.4` and added
`CREATE EXTENSION IF NOT EXISTS postgis;` as the first line of `000003_create_regions` (Phase 1) —
`regions` is the first `GEOMETRY` column in the whole schema.

**Done:** added a transaction utility to `internal/platform/postgres/` — a `Querier` interface
(`Exec`/`Query`/`QueryRow`) satisfied by both `*pgxpool.Pool` and `pgx.Tx`, plus
`WithTx(ctx, pool, func(ctx context.Context) error) error` (stashes the transaction on `ctx`) and
`QuerierFromContext(ctx, pool) Querier` (resolves it back out, falling back to `pool` if `ctx`
carries none). A repository method that needs to participate in a caller's transaction calls
`QuerierFromContext` at the top instead of using `r.pool` directly — every other method is
untouched. Identity wraps this as its own `domain.Transactor` port (`WithinTransaction`), backed by
`infra/postgres.Transactor`, so `Service` still depends only on ports, never pgx directly. FE-7's
`ApproveNGO` is the first real use (writes `ngos` + `accounts` atomically, then revokes the
promoted account's refresh tokens as a non-atomic best-effort follow-up) — every future
cross-table write in later phases reuses the same platform-level helper, not a bespoke one.
No `ALTER TYPE account_role` was needed — `000001_create_accounts` already defines all five role
values (`user`, `ngo_admin`, `ngo_volunteer`, `admin`, `super_admin`), confirmed against the actual
migration file.

### Routes — every FE Identity is responsible for

Already built (for reference — these exist today):

| FE | Route(s) already built |
|---|---|
| M1 FE-1 (account creation + OTP) | `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification` |
| M1 FE-2 (login/logout, session mgmt, password rules) | `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `PATCH /api/v1/auth/password`, `POST /api/v1/auth/password/forgot`, `POST /api/v1/auth/password/reset` |
| M1 FE-3 (deactivate/delete portion — the personal-details/alert-preferences portion is Profiling's, Phase 5) | `POST /api/v1/auth/me/deactivate`, `POST /api/v1/auth/me/delete` | `POST`, not a bodied `DELETE` — delete needs a `current_password` field and `POST` has no ambiguity about body support. Deactivate is self-service and reversible via a subsequent login (`ErrAccountDeactivated` → `Reactivate()`, both sessions' tokens revoked either way); delete is a password-confirmed soft delete (`accounts.deleted_at`), irreversible. |
| M1 FE-11 (admin login) | same `POST /api/v1/auth/login` — one login flow for every role, RBAC enforced downstream via the JWT's `role` claim |
| M1 FE-7 (NGO self-registration + admin approval/rejection — no admin-direct NGO creation) | `POST /api/v1/ngos/register` (logged-in citizen submits, `status='pending_approval'`, `created_by=self`), `POST /api/v1/admin/ngos/{ngoID}/approve`, `POST /api/v1/admin/ngos/{ngoID}/reject` | Approving doesn't create an account — it promotes `ngos.created_by`'s existing account to `ngo_admin` via `Repository.SetNGOMembership`, atomically with the `ngos` status change (`domain.Transactor`), then revokes that account's refresh tokens so its next token carries the new role. One citizen can only ever be credited with one pending/active NGO, enforced at two independent layers: `idx_ngos_created_by_unique` at insert time (`ErrNGOAlreadyRegistered`) and `ApproveNGO`'s own `NGOIDForAccount` check at approval time (`ErrCreatorAlreadyHasNGO`) — deliberate defense in depth, not redundant dead code. |
| M1 FE-8 (org profile/contact-info/deactivate portion — operational-regions portion is Geo's, Phase 1) | `GET /api/v1/ngo/me`, `PATCH /api/v1/ngo/me` (admin-only), `POST /api/v1/ngo/me/deactivate` (admin-only) | `PATCH` is a real partial patch — `*string` request fields, `nil` means unchanged, an explicit `""` clears an optional field, and an all-nil body is rejected outright (`ErrNoNGOFieldsProvided`) rather than silently no-opping. `name` can never be cleared (`ErrInvalidNGOName`), only `contact_email`/`contact_phone` can. Deactivate only flips `ngos.status` — no cascading effect on NGO staff accounts, no session revocation for the calling admin (this changes what the *org* can do, not the admin's own account), and no reactivate route yet since FE-8 never asked for one. "Active campaigns" (also mentioned in FE-8) is a filtered read of Relief Operations' `donation_campaigns` — no new route here, see Phase 9. |
| M1 FE-9 (volunteer invite/accept portion — the "assign" verb is Relief Operations', Phase 11) | `POST /api/v1/ngo/volunteers/invitations`, `GET /api/v1/volunteer-invitations`, `PATCH /api/v1/volunteer-invitations/{id}/accept`, `PATCH /api/v1/volunteer-invitations/{id}/decline`, `GET /api/v1/ngo/volunteers`, `PATCH /api/v1/ngo/volunteers/{id}/deactivate` | "Create" is an invitation, not account creation — only acceptance sets `role='ngo_volunteer'`/`ngo_id` (same atomic-promotion + session-revocation pattern as FE-7's approval, via `Repository.SetNGOMembership`); declining leaves the account untouched. `ListMyPendingInvitations` enriches each invitation with the NGO's name via an app-layer read composition, not a repository join. Removing a volunteer (`DeactivateVolunteer`) does *not* touch `accounts.status` — it clears `ngo_id`/resets `role` to `user` via a dedicated `Repository.ClearNGOMembership` (kept separate from `SetNGOMembership` since `uuid.Nil` is a real UUID value, not SQL `NULL`), then revokes their sessions. Monitoring volunteer *activity* (not just the account list) is `internal/relief`'s `task_assignments`/`field_observations`, Phase 9/11. |
| M1 FE-12 (account status portion — the moderation/fraud portion is Trust's, Phase 6) | `GET /api/v1/admin/accounts`, `GET /api/v1/admin/accounts/{id}`, `PATCH /api/v1/admin/accounts/{id}/status` (NGO approve/reject already listed under FE-7, shared) | `GET /admin/accounts` is the first paginated list endpoint in the codebase (`limit`/`offset`, capped at 100, with a `total` count alongside). `PATCH .../status` treats `block`/`suspend` as one transition (`Account.Suspend()`) and `unblock`/`reactivate` as the other (`Account.Reactivate()`, now guarded against re-activating an already-active account) — the schema only has one restricted state, `suspended`; a finer `block` vs `suspend` distinction belongs to Trust's future `moderation_actions` log, not `accounts.status`. Suspending revokes all refresh tokens immediately; reactivating doesn't need to, since a suspended/deactivated account has no live sessions to revoke in the first place. |

**Phase 0 (Identity) is now fully built** — every FE it's responsible for has a shipped, tested route.

---

# Phase 1 — Geo (`internal/geo`)

### `000003_create_regions`
```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE region_level AS ENUM ('province', 'district', 'tehsil');

CREATE TABLE regions (
    id                UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT                     NOT NULL,
    level             region_level             NOT NULL,
    parent_region_id  UUID                     REFERENCES regions(id),
    boundary          GEOMETRY(POLYGON, 4326)  NOT NULL,
    created_at        TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ              NOT NULL DEFAULT now()
);
```

### Routes — every FE Geo is responsible for

Already built (for reference — these exist today):

| FE | Route(s) already built | Notes |
|---|---|---|
| **M1 FE-8** (operational-regions portion) | `GET /api/v1/ngo/me/regions`, `POST /api/v1/ngo/me/regions`, `DELETE /api/v1/ngo/me/regions/{regionID}` | `GET` is open to any authenticated NGO staff member (admin or volunteer); assigning/removing a region is `ngo_admin`-only, same restriction level as `PATCH /ngo/me`. `POST` inserts into `ngo_regions` and joins straight back to `regions` in one round trip via a CTE, returning the full region — `ngo_regions`' own `UNIQUE(ngo_id, region_id)` becomes `ErrRegionAlreadyAssigned` (409), a bad/nonexistent `region_id` becomes `ErrRegionNotFound` (404) via the FK violation. `DELETE` returns `ErrRegionNotAssigned` (404) if the pair doesn't exist. Resolving "which NGO does the caller belong to" calls Identity's own exported `Module.NGOIDForAccount` rather than Geo querying `accounts` directly — a deliberate, one-way, compile-time Go dependency (`geo` → `identity`), not a duplicated-SQL shortcut, since NGO membership's business logic (soft-deletes, etc.) has exactly one authoritative home. |
| **M16 FE-1** (region-scoping portion) | *no new route* | Region-scoping is a query parameter/middleware other domains' list endpoints apply (`?region_id=` filters, or an NGO-scoped variant that resolves `ngo_regions` server-side) — not its own endpoint. |
| *(foundational, not its own FE)* | `GET /api/v1/regions`, `GET /api/v1/regions/{id}`, `POST /api/v1/admin/regions`, `PATCH /api/v1/admin/regions/{id}` | Reference-data CRUD every other context's location picker depends on. The two `GET`s are public — no auth — since administrative boundaries aren't sensitive and clients need them before a user is necessarily logged in; `GET /regions` filters on `level` and/or `parent_region_id` for hierarchical drill-down (province → district → tehsil). `POST`/`PATCH` are `admin`/`super_admin`-only. Boundary travels the wire as GeoJSON in both directions (`ST_AsGeoJSON` on read, `ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)` on write — the explicit SRID is required, GeoJSON itself carries none). `PATCH` is a real partial patch (`*string` fields, same convention as `PATCH /ngo/me`), rejects an all-nil body (`ErrNoRegionFieldsProvided`), and rejects a region being set as its own parent (`ErrRegionCannotBeOwnParent`). |

**Phase 1 (Geo) is now fully built** — every FE it's responsible for has a shipped, tested route.

---

# Phase 2 — Identity NGO support

Covered in Phase 0 (`000004_add_ngo_support`) — sequenced here only because it lands
chronologically after Geo.

---

# Phase 3 — Flood Intelligence (`internal/floodintel`)

### `000005_create_flood_intelligence`
```sql
CREATE TYPE flood_risk_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE hazard_zone_source AS ENUM ('ai_prediction', 'manual_admin', 'manual_ngo');
CREATE TYPE hazard_zone_status AS ENUM ('active', 'resolved');

CREATE TABLE flood_predictions (
    id                       UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id                UUID              REFERENCES regions(id),
    probability_raster_url   TEXT,
    risk_level               flood_risk_level  NOT NULL,
    confidence_score         NUMERIC           NOT NULL,
    uncertainty_score        NUMERIC,
    model_version            TEXT              NOT NULL,
    valid_from               TIMESTAMPTZ       NOT NULL,
    valid_until              TIMESTAMPTZ       NOT NULL,
    generated_at             TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE TABLE hazard_zones (
    id                    UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    source                hazard_zone_source       NOT NULL,
    risk_level            flood_risk_level         NOT NULL,
    boundary              GEOMETRY(POLYGON, 4326)  NOT NULL,
    region_id             UUID                     REFERENCES regions(id),
    status                hazard_zone_status       NOT NULL DEFAULT 'active',
    created_by            UUID                     REFERENCES accounts(id),
    detected_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ,
    flood_prediction_id   UUID                     REFERENCES flood_predictions(id)
);
```

**Updated against the real model output** (confirmed directly from the actual notebooks/scripts in
`flood forecasting model related/`, not the original spec assumption): `probability_raster_url`
and `uncertainty_score` are nullable now, not `NOT NULL`. No raster/PNG hosting is needed at all —
that file was only ever the ML teammate's personal debugging output, never meant to ship — and the
model architecture (a single deterministic ConvLSTM + U-Net, not an ensemble) has no second number
to give you for uncertainty. Everything else here is unchanged.

**Structural note for the ingestion endpoint:** one model run produces *many* tiles, not one — so
one run means *many* `flood_predictions` + `hazard_zones` row pairs (one pair per tile), all
sharing the same `model_version`/`valid_from`/`valid_until`, not a single `flood_predictions` row
for the whole run.

**Resolved:** the ML service pushes predictions via an authenticated ingestion endpoint on this
API, keeping write-ownership inside the Go process — not direct Postgres access. Built as
`internal/shared/serviceauth`, a shared-secret header (`X-Internal-Service-Key`), reusable by any
future internal ingestion route (e.g. Community Intelligence's AI-classification endpoint, Phase 7).

### Routes

Already built (for reference — these exist today):

| FE | Route(s) already built | Notes |
|---|---|---|
| **M7 FE-1** (pixel-level flood probability maps) | `POST /api/v1/internal/flood-predictions` (ML service ingestion, service-to-service auth)<br>`GET /api/v1/flood-predictions?region_id=` | `POST`: guarded by a shared-secret header (`X-Internal-Service-Key`, `internal/shared/serviceauth`, constant-time comparison) — no account, no JWT, since the caller is the ML pipeline, not a user. One request = one model run's tiles, ingested as one Postgres transaction — each tile becomes an atomically-created `flood_predictions` + `hazard_zones` row pair (`domain.DeclareAIHazardZone` always sets `source='ai_prediction'`, `status='active'`, `created_by=NULL`). `risk_level` is never accepted from the caller — the request has no such field at all — it's computed server-side by thresholding `confidence_score` (`domain.IngestFloodPrediction`: <0.34 low, 0.34–0.67 medium, ≥0.67 high). `region_id` is left `NULL` on both tables at ingestion, deliberately — see the `GET` route below for how it's resolved. Capped at `domain.MaxTilesPerRequest` (500) tiles per request: a full nationwide run (thousands of tiles) must be submitted as multiple smaller requests, since one oversized request/transaction would otherwise exceed the server's 15s `WriteTimeout`, get its connection killed mid-transaction, and roll back everything ingested so far with no clear error — the cap turns that failure mode into an immediate, explicit `400` instead.<br>`GET`: public, no auth (same reasoning as `GET /regions`). `region_id` is required, not optional — this route doesn't support an unscoped "every prediction in the country" query, and has no pagination built for that case. Since `region_id` is never populated at write time, membership is resolved live via a spatial join every request: `flood_predictions → hazard_zones` (via `flood_prediction_id`) `→ regions` (via `ST_Intersects(hazard_zones.boundary, regions.boundary)`), backed by the GIST indexes both tables already carry. Also filters to currently-valid predictions only (`valid_from <= now() <= valid_until`) — the same "citizen sees current state, not history" principle already applied to the admin-vs-citizen hazard-zone split below. |
| **M7 FE-2** (classify region low/medium/high) | *no separate route* | Same resource as FE-1 — `risk_level` is a field on `flood_predictions`, not a distinct concept. |
| **M7 FE-3** (confidence + uncertainty bounds) | *no separate route* | Same resource again — `confidence_score`/`uncertainty_score` fields, already returned by `GET /api/v1/flood-predictions`. |
| **M8 FE-1** (dynamic heatmaps/risk overlays/confidence opacity) | `GET /api/v1/map/flood-overlay?bbox=` | Public, no auth. Queries `hazard_zones` — not `flood_predictions` — since only `hazard_zones` has the drawable `boundary`; `LEFT JOIN`ed to `flood_predictions` for `confidence_score` (nullable — a manually-declared zone has no paired prediction, and should still render, just without an opacity-driving number). Filters to `status='active'` and `ST_Intersects` against a rectangle built on the fly via `ST_MakeEnvelope` — no dependency on `regions` being seeded with real boundaries, unlike `region_id` filtering. |
| **M8 FE-3** (real-time personal risk score from GPS, never persisted) | `POST /api/v1/hazard-zones/risk-check` `{lat, lng}` | Public, no auth. `POST`, not `GET`, deliberately — this carries a live GPS coordinate, and a `GET` would put it in the URL (logged by proxies/access logs/browser history); a `POST` body doesn't leak that way. Nothing is ever written — a live spatial check, computed fresh per call. `ST_Contains` determines "inside a zone" (highest-severity zone wins if more than one matches); if not inside any, falls back to the GIST-accelerated `<->` KNN operator to find the nearest active zone fast, then `ST_Distance` on `::geography` for a real distance in meters. |
| **M8 FE-4** (color intensity/opacity gradients — pure rendering) | *no route* | Client-side rendering of `confidence_score`/`risk_level` already in the FE-1 response. |
| **M8 FE-5** (tooltip: severity, confidence%, last update, metadata) | `GET /api/v1/hazard-zones/{id}` | Public, no auth. `LEFT JOIN`s `hazard_zones` to `flood_predictions` for the tooltip's extra fields (`confidence_score`, `model_version`, `valid_from`/`valid_until`, `generated_at`) — all `nil` for a manually-declared zone with no paired prediction, same reasoning as the bbox overlay route. |
| **M9 FE-1** (AI-sourced half of alert fusion) | *no public route* | Internal call into Alerting when a new/escalated `hazard_zones` row appears — `alerting.NotifyFromHazardZone(...)`, same cross-domain-call pattern as `credibility_events` in Phase 8. Genuinely not part of Phase 3's own scope: `internal/alerting` doesn't exist yet (Phase 10) — this call gets added as a follow-up *on* Alerting once that phase is built, the same way `trust.RecordCredibilityEvent` was added as a Phase 8 follow-up on top of an already-built Community Intelligence, not required for Phase 7 itself to be complete. |
| **M15 FE-1** (admin real-time hazard dashboard) | `GET /api/v1/admin/hazard-zones?from=&to=&status=`<br>`GET /api/v1/admin/flood-predictions?from=&to=` | `admin`/`super_admin`-only (`internal/floodintel/http/list_hazard_zones_for_admin.go` + `list_flood_predictions_for_admin.go`). These query the *same underlying tables* (`hazard_zones`/`flood_predictions`) the citizen-facing routes do, not the *same endpoints* — `GET /admin/hazard-zones` is its own handler (`ListHazardZonesForAdmin`), separate from the map's `ListFloodOverlay`, with no `status='active'` restriction (admin sees resolved/historical zones too, filtered by `from`/`to`/`status` instead) and a richer response shape (the full `HazardZone` aggregate — `source`, `created_by`, `region_id`, `flood_prediction_id` — not the lightweight `MapOverlayEntry` a map only needs the drawable shape for). Not a separate route per time-window: the map view should always render one time-slice at a time (defaulting to "active now," same set citizens see) rather than dumping every historical zone onto one map at once — that would just produce overlapping polygons over the same flood-prone areas across different dates. Full unfiltered history belongs in this table/list route instead, not the map. |
| **M15 FE-2** (hazard half of system-wide heatmap) | *reuses* `GET /api/v1/admin/hazard-zones?status=active` | Incident half is Community Intelligence's, Phase 7. Originally planned against a bare `GET /api/v1/hazard-zones` that was never actually built — once the map-vs-table distinction above got established, the unscoped, nationwide, admin-facing list a system-wide heatmap needs turned out to be `GET /admin/hazard-zones` (built for M15 FE-1) with `status=active` applied, not a new route. `GET /map/flood-overlay?bbox=` would be the wrong thing to reuse here despite also returning hazard zones — it's deliberately viewport-scoped, the opposite of system-wide. |
| *(not its own FE, but needed)* | `POST /api/v1/admin/hazard-zones` (manual admin/NGO-declared zone)<br>`PATCH /api/v1/admin/hazard-zones/{id}/resolve` | `POST`: allowed roles `admin`/`super_admin`/`ngo_admin` — its own middleware chain, not the `/admin` group's blanket admin-only rule, since declaring a zone isn't exclusively an admin action. `source` is never a request field — derived from the caller's actual JWT role (`admin`/`super_admin` → `manual_admin`, `ngo_admin` → `manual_ngo`), same anti-spoofing principle as `risk_level` being server-computed on the AI ingestion path. `risk_level` here *is* caller-provided, unlike the AI path — a human declaring a zone is the direct source of truth on severity, there's no probability to threshold. `PATCH .../resolve`: `admin`/`super_admin` only — narrower than creation, since closing out a hazard alert is a more consequential oversight action than declaring one; guards against double-resolving (`ErrHazardZoneNotActive`). Building this surfaced and fixed a real bug in `HazardZoneRepository.Save`: `created_by` was missing from the `INSERT` column list entirely, and `flood_prediction_id` was passed as a raw `uuid.UUID` rather than a nullable pointer — meaning a manually-declared zone (no paired prediction) would have inserted a bogus zero-UUID into that FK column instead of `NULL`, violating the constraint outright. |

**Phase 3 (Flood Intelligence) is now fully built** — every FE it's responsible for has a shipped,
tested route. M9 FE-1's Alerting hook is the one intentional exception, deferred to Phase 10 by
design (see its note above), not an oversight.

---

# Phase 4 — Facilities (`internal/facilities`)

### `000006_create_facilities`
```sql
CREATE TYPE shelter_type AS ENUM ('shelter', 'relief_center');
CREATE TYPE shelter_certification_status AS ENUM ('certified', 'pending', 'uncertified');
CREATE TYPE shelter_status AS ENUM ('open', 'closed');
CREATE TYPE infrastructure_type AS ENUM ('hospital', 'bridge', 'utility');
CREATE TYPE infrastructure_status AS ENUM ('safe', 'at_risk', 'damaged');
CREATE TYPE essential_location_type AS ENUM ('atm', 'grocery_store', 'pharmacy');
CREATE TYPE essential_location_open_status AS ENUM ('open', 'closed');

CREATE TABLE shelters (
    id                     UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT                          NOT NULL,
    type                   shelter_type                  NOT NULL,
    location               GEOMETRY(POINT, 4326)         NOT NULL,
    region_id              UUID                          REFERENCES regions(id),
    capacity_total         INTEGER                       NOT NULL,
    capacity_current       INTEGER                       NOT NULL DEFAULT 0,
    certification_status   shelter_certification_status  NOT NULL,
    status                 shelter_status                NOT NULL DEFAULT 'open',
    managed_by_ngo_id      UUID                          REFERENCES ngos(id),
    created_at             TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ                   NOT NULL DEFAULT now()
);

CREATE TABLE infrastructure (
    id                   UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT                    NOT NULL,
    type                 infrastructure_type     NOT NULL,
    location             GEOMETRY(POINT, 4326)   NOT NULL,
    region_id            UUID                    REFERENCES regions(id),
    status               infrastructure_status   NOT NULL,
    last_status_update   TIMESTAMPTZ             NOT NULL DEFAULT now(),
    created_at           TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE TABLE essential_locations (
    id           UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT                      NOT NULL,
    type         essential_location_type   NOT NULL,
    location     GEOMETRY(POINT, 4326)     NOT NULL,
    region_id    UUID                      REFERENCES regions(id),
    created_at   TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE TABLE essential_location_status_reports (
    id                       UUID                             PRIMARY KEY DEFAULT gen_random_uuid(),
    essential_location_id    UUID                             REFERENCES essential_locations(id),
    reported_by_account_id   UUID                             NOT NULL REFERENCES accounts(id),
    status                   essential_location_open_status   NOT NULL,
    created_at               TIMESTAMPTZ                      NOT NULL DEFAULT now(),
    shelter_id               UUID                             REFERENCES shelters(id),
    CHECK (num_nonnulls(essential_location_id, shelter_id) = 1)
);

CREATE TABLE offline_map_packages (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id     UUID         NOT NULL REFERENCES regions(id),
    package_url   TEXT         NOT NULL,
    version       TEXT         NOT NULL,
    size_bytes    BIGINT,
    generated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M8 FE-2** (infrastructure overlays: hospitals/bridges/utilities, safe/at-risk) | `GET /api/v1/infrastructure?region_id=`<br>`POST /api/v1/admin/infrastructure`<br>`PATCH /api/v1/admin/infrastructure/{id}/status` | Pure admin-curated reference data — no NGO ownership concept at all, unlike Shelter. `region_id` is left NULL at write time and resolved live via `ST_Intersects` at read time (`GET`'s `ListForRegion`), the default convention almost every geo-tagged aggregate in this app follows. `POST` always starts a new record at `status='safe'` (`RegisterInfrastructure` — no client control over the initial value); `PATCH .../status` is narrow (status + `last_status_update` only) and deliberately has **no guard** against re-setting the same status — going `at_risk → safe → at_risk` again as flood conditions change is a normal cycle, not an error, unlike Hazard Zones' `Resolve()` which does guard against double-resolution. No soft-delete/hidden state either: showing safe vs. at-risk vs. damaged side by side *is* the overlay's whole purpose. |
| **M8 FE-6** (shelter/safe point overlay: capacity, certification, availability) | `GET /api/v1/shelters?region_id=`<br>`GET /api/v1/shelters/{id}` | Both public, no auth — same reasoning as every other citizen-facing map `GET`. Built *before* M16 FE-9, so at the time `Shelter` had no validated constructor yet — only `RehydrateShelter` (infra-only reconstruction); `RegisterShelter` was added later once a write route actually existed. `ListForRegion` joins via `ST_Intersects` like Infrastructure's; `GetShelter` is a plain PK lookup, no spatial join. |
| **M10 FE-5** (open/closed status of essential locations incl. shelters) | `GET /api/v1/essential-locations?region_id=`<br>`POST /api/v1/admin/essential-locations`<br>`POST /api/v1/essential-locations/{id}/status-reports`<br>`POST /api/v1/shelters/{id}/status-reports`<br>`GET /api/v1/essential-locations/{id}/status-reports` | `essential_locations` deliberately carries **no status field of its own** — open/closed lives entirely in `essential_location_status_reports`, since these rows (ATMs, grocery stores, pharmacies) are meant to be bulk-imported from OSM/Overpass and rarely change once created; `POST /admin/essential-locations` is just the manual fallback alongside that (not-built) import script. One report endpoint per target because the FK is XOR (`CHECK (num_nonnulls(essential_location_id, shelter_id) = 1)`) — rather than splitting into two aggregate types, `EssentialLocationStatusReport` is reused for both via two constructors (`SubmitEssentialLocationStatusReport` / `SubmitShelterStatusReport`) producing the same struct shape, since it's genuinely one concept (a status observation) applied to two kinds of target. **Real bug found and fixed here**: both constructors now explicitly reject a `uuid.Nil` target id. Originally they didn't — a client-supplied nonexistent-but-well-formed id that happened to equal the literal all-zero UUID converted *both* FK columns to SQL `NULL` (instead of one `NULL` + one real value), which violated the table's `CHECK` constraint (`23514`) rather than a foreign-key violation (`23503`), an error code `mapError` didn't handle, so it fell through to a generic `500`. Now it's a clean `400` (`ErrInvalidStatusReportTarget`) before the query ever runs. Reports are open to **any authenticated citizen**, not admin-only — this *is* the crowdsourcing mechanism. Identity of the reporter is stored (`reported_by_account_id`) but deliberately **not exposed** in the history response (`GET .../status-reports` only returns id/status/created_at) — kept for future internal credibility-scoring use (Trust module, not built yet), not shown publicly, so reporting is anonymous from the citizen's point of view. `GET /essential-locations?region_id=` embeds each location's *current* status via a `LEFT JOIN LATERAL` (most recent report only, avoiding N+1 queries) — a location with zero reports omits `current_status`/`status_reported_at` from the response entirely rather than defaulting to "open"; the status is advisory-only and never gates anything. The shelter status-report `POST` was built despite having no consumer yet (no shelter-side history `GET` exists) — a deliberate call by the project owner to capture the data now even without an immediate read path. |
| **M11 FE-5** (download offline map data) | `GET /api/v1/regions/{id}/offline-map`<br>`POST /api/v1/admin/offline-map-packages` (registers a generated package — the generation itself is a background job, not this request) | **Scope is narrow on purpose**: this backend only stores a *pointer* to an already-generated download bundle (a URL + version + size). It does **not** generate map tiles, does **not** bundle a `.mbtiles` file, and does **not** know anything about how a mobile client reads one offline — all three are out of scope, left for a separate pipeline/background job and the mobile team respectively. `offline_map_packages.region_id` is a **deliberate, genuine exception** to the "resolve `region_id` live via `ST_Intersects`" convention every other geo-tagged aggregate in Facilities follows (Infrastructure, Shelter, EssentialLocation) — here it's `NOT NULL` and stored directly at write time, because this table has no geometry column at all; a file has no shape to spatially intersect against. `POST` (admin-only) always **inserts a new row**, never overwrites — a region accumulates one row per generation, a natural version history. `GET` (public, no auth — meant to be called while still online, before a citizen needs the offline data) always returns the single **most recent** package for a region (`ORDER BY generated_at DESC LIMIT 1`, `ErrOfflineMapPackageNotFound` → 404 if none exists yet); tested explicitly that registering a v2 package correctly supersedes v1 in the very next `GET`, without deleting v1's row. This was also the **first route in Facilities to validate a real, direct foreign key** rather than resolving one live — a bad/nonexistent `region_id` surfaces as `ErrRegionNotFound` (404) via the FK violation, not a 500. `package_url`/`version` are required and trimmed (rejecting whitespace-only values); `size_bytes` is optional (`*int64`, nil = unknown) but rejected if negative. Having just fixed the `uuid.Nil`-target bug in M10 FE-5 (above), the same class of bug was headed off here *proactively*: `RegisterOfflineMapPackage` rejects a `uuid.Nil` `region_id` in the domain constructor before it ever reaches SQL — confirmed with a test that it returns a clean `400`, not a `500`. |
| **M16 FE-9** (shelter/relief center occupancy, facilities, certification — NGO view) | `GET /api/v1/ngo/shelters`<br>`POST /api/v1/ngo/shelters` (NGO registers a shelter it manages)<br>`PATCH /api/v1/shelters/{id}/occupancy`<br>`PATCH /api/v1/shelters/{id}` (certification/status) | Resolving "which NGO does the caller belong to" reuses the same `AccountLookup` port pattern Geo established (`facilities` → `identity`, one-way compile-time dependency, own `ErrNoNGOMembership` sentinel — each bounded context keeps its own error vocabulary even though the underlying concept is shared). `GET`/registering a shelter is scoped to the caller's own NGO (`managed_by_ngo_id`), a direct filter, not a spatial query. A shelter always starts `certification_status='pending'` on self-registration, `status='open'`, `capacity_current=0` — self-registration is not self-certification; only `PATCH /shelters/{id}` can move it to `'certified'`. Occupancy (`PATCH .../occupancy`) is open to **any** authenticated NGO staff (admin or volunteer) since it's day-to-day headcount tracking, bounded to `[0, capacity_total]` (tested at both boundaries); certification/status (`PATCH /shelters/{id}`, a real partial patch — either field optional, but not both absent, `ErrNoShelterFieldsProvided`) is **`ngo_admin`-only**, since closing a shelter or changing its certification is a bigger call than a headcount update. Both writes are ownership-checked in the app layer (`ErrShelterNotManagedByYou`, 403) — registering a shelter gives an NGO no authority over anyone else's; role checks alone can't express that, since `RequireRole` has no notion of *which* NGO a shelter belongs to. |

**Phase 4 (Facilities) is now fully built** — every FE it's responsible for has a shipped, tested route.

---

# Phase 5 — Profiling (`internal/profiling`)

### `000007_create_profiling`
```sql
CREATE TABLE profiles (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID         UNIQUE NOT NULL REFERENCES accounts(id),
    name         TEXT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TYPE notification_channel AS ENUM ('push', 'sms', 'whatsapp', 'voice_call', 'email');
CREATE TYPE alert_severity AS ENUM ('general_advisory', 'watch', 'warning', 'critical_emergency');

CREATE TABLE alert_preferences (
    id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id            UUID             UNIQUE NOT NULL REFERENCES accounts(id),
    push_enabled          BOOLEAN          NOT NULL DEFAULT true,
    sms_enabled           BOOLEAN          NOT NULL DEFAULT true,
    whatsapp_enabled      BOOLEAN          NOT NULL DEFAULT false,
    voice_call_enabled    BOOLEAN          NOT NULL DEFAULT true,
    language              TEXT             NOT NULL DEFAULT 'en',
    minimum_severity      alert_severity   NOT NULL DEFAULT 'general_advisory',
    created_at            TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ      NOT NULL DEFAULT now()
);
```

**Resolved — how a profile row comes to exist at all:** the plan never actually specified this
(no `POST /profile` anywhere, and no auto-creation mechanism was ever documented). Settled on:
Identity's `Register` flow creates the `profiles` **and** `alert_preferences` rows atomically with
the account itself, via a port (`identity/domain.ProfileInitializer`) Identity defines in its own
vocabulary — not by Identity importing `internal/profiling` (that would invert the dependency
direction every other phase has followed, Identity being the one thing everything else depends on,
never the reverse), and not by a database trigger (this codebase keeps business logic in Go, not
hidden in SQL). `profiling.Module` satisfies that port directly; only `main.go`, the composition
root, wires the two together — identical in shape to how `PasswordHasher`/`Mailer`/`OTPStore` are
already injected into Identity. Building this surfaced a real bug: `identity.Repository.Save` was
writing straight to the pool instead of resolving its executor from `ctx`, so it would have
silently *not* joined the new transaction — fixed as part of this change, the same
`platformpg.QuerierFromContext` convention every other repository already uses.

### Routes

Already built (for reference — these exist today):

| FE | Route(s) already built | Notes |
|---|---|---|
| **M1 FE-3** (view/edit personal details + alert preferences portion) | `GET /api/v1/profile`<br>`PATCH /api/v1/profile`<br>`GET /api/v1/profile/alert-preferences`<br>`PATCH /api/v1/profile/alert-preferences` | Both `GET`s never 404 for a real account in practice — every account gets a `profiles` row (name `""`, filled in later) and a fully-defaulted `alert_preferences` row (`push`/`sms`/`voice_call` on, `whatsapp` off, `language='en'`, `minimum_severity='general_advisory'`) the instant it's created, per the resolved design above. `PATCH /profile` only has one editable field (`name`) but still uses real `*string` partial-patch semantics and rejects an all-nil body (`ErrNoProfileFieldsProvided`), same convention as every other PATCH in this codebase; `name` can never be cleared back to empty once set (`ErrInvalidProfileName`) — the blank state is only ever the transient "not yet set" marker from registration, not a deliberate choice. `PATCH /profile/alert-preferences` is a full 6-field partial patch (`*bool`/`*string` fields, merge-in-app-layer pattern) and validates `minimum_severity` against the real enum (`ErrInvalidAlertSeverity`). "Privacy settings" is still an open spec question per the source doc's own Deferred note — no fields/routes exist for it yet, same status as noted there. |

**Phase 5 (Profiling) is now fully built** — every FE it's responsible for has a shipped, tested
route.

This is also where `GET /api/v1/auth/me`'s existing "thin; profile data comes from Profile"
comment gets resolved — `Me` stays thin, `GET /api/v1/profile` is the new, separate call for the
rest.

---

# Phase 6 — Trust, core (`internal/trust`)

### `000009_create_trust_core`

Numbered `000009`, not `000008` as originally planned — same golang-migrate renumbering reason as
Facilities' migration: version numbers track actual chronological application order, not a
pre-planned document's numbering, and `000008` had already been claimed by Facilities by the time
this phase was actually built.

```sql
CREATE TYPE connection_type AS ENUM ('family', 'safety_group');
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE safety_connections (
    id                      UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_account_id    UUID                NOT NULL REFERENCES accounts(id),
    recipient_account_id    UUID                NOT NULL REFERENCES accounts(id),
    connection_type         connection_type     NOT NULL,
    status                  connection_status   NOT NULL DEFAULT 'pending',
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
    responded_at            TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
    CHECK (requester_account_id <> recipient_account_id)
);

-- one pending request at a time between the same ordered pair — mirrors
-- idx_ngos_created_by_unique's partial-unique-index pattern from Identity
CREATE UNIQUE INDEX idx_safety_connections_pending_pair
    ON safety_connections (requester_account_id, recipient_account_id)
    WHERE status = 'pending';

CREATE INDEX idx_safety_connections_requester ON safety_connections (requester_account_id);
CREATE INDEX idx_safety_connections_recipient ON safety_connections (recipient_account_id);

CREATE TABLE trust_scores (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID         UNIQUE NOT NULL REFERENCES accounts(id),
    score        INTEGER      NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TYPE moderation_action_type AS ENUM ('warn', 'suspend', 'block', 'unblock');

CREATE TABLE moderation_actions (
    id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    target_account_id   UUID                    NOT NULL REFERENCES accounts(id),
    action_type         moderation_action_type  NOT NULL,
    reason              TEXT                    NOT NULL,
    performed_by        UUID                    NOT NULL REFERENCES accounts(id),
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT now()
);
```

### `000010_add_location_trail`

A deliberate deviation from this phase's original plan, which assumed the live-GPS-relay route
would touch **no** stored row at all (see the original `WS /ws/safety-connections/location` note
below — "not a stored row"). Building it surfaced a real product requirement the original plan
hadn't accounted for: if a tracked citizen disconnects mid-emergency, someone needs to know their
exact last location and the route they took, not just whatever was live-relayed a moment ago and
then lost. This table is that durable record — see the route's own notes below for the full
mechanism that writes to it.

```sql
CREATE TABLE location_trail (
    id           UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID                    NOT NULL REFERENCES accounts(id),
    location     GEOMETRY(POINT, 4326)   NOT NULL,
    recorded_at  TIMESTAMPTZ             NOT NULL
);

-- the natural read pattern is "most recent points for this account" —
-- newest-first, per account
CREATE INDEX idx_location_trail_account_recorded
    ON location_trail (account_id, recorded_at DESC);
```

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M1 FE-5** (define family/safety group members; real-time GPS during active emergencies) | `POST /api/v1/safety-connections`<br>`PATCH /api/v1/safety-connections/{id}/accept`<br>`PATCH /api/v1/safety-connections/{id}/decline`<br>`GET /api/v1/safety-connections`<br>`DELETE /api/v1/safety-connections/{id}`<br>`WS /ws/safety-connections/location` (live GPS relay) | **The five REST routes** follow the same request→accept/decline lifecycle as Identity's NGO volunteer invitations: `POST` creates a `pending` row (rejects self-connections and duplicate pending pairs via `idx_safety_connections_pending_pair`, 409); `accept`/`decline` are recipient-only (`ErrNotConnectionRecipient`, 403, deliberately distinct from the "you're not part of this at all" error used elsewhere — a bug caught in testing, see below); `GET` returns every connection the caller is party to on **either** side, any status, newest first; `DELETE` is open to **either** party at **any** status (unlike accept/decline) — a real deletion, not a state transition, since there's no "removed" value in `connection_status`. <br><br>**The WS route** is the substantial piece. It splits into two deliberately decoupled tracks that happen to share one connection: <br>**Track A — live relay.** On connect, the server validates the JWT (header for a native/mobile client; `?token=` query param as a fallback, since a browser's `WebSocket` API cannot set custom headers — header wins if both are present) and registers the connection in an in-memory `map[accountID]*websocket.Conn` (`infra/ws.Registry`). When a tracker sends `{lat, lng}`, the server resolves who's allowed to see it — every account with an **accepted** `safety_connections` row involving the tracker, either side — and writes directly to each viewer's connection if they're on this same server process. Running on one server, this needs no Redis Pub/Sub at all; that would only become necessary running multiple instances, where a tracker and viewer could land on different processes. <br>**Track B — durable persistence.** Independently, every ping is `XADD`ed onto a Redis Stream (`stream:location-pings`), fire-and-forget from the WS handler's perspective. A background goroutine (started once at server boot, stopped via a context cancelled after the HTTP server finishes draining on shutdown) reads batches via a consumer group, applies a throttle (`domain.ShouldPersistTrailPoint` — keep a point only if ≥30s **or** ≥50m, whichever first, from the last point *actually persisted* for that account, tracked in an in-memory per-account cache), batch-inserts the survivors into `location_trail` in one multi-row `INSERT`, then acks. A raw ping stream at several messages/second per tracker collapses to a handful of durable rows — confirmed in testing: 6 pings one second apart, all within ~5m of each other, produced exactly 1 row. <br><br>**The gate is a deliberate stub, not a real implementation yet.** The route's whole premise — GPS tracking only during a declared emergency, never as always-on surveillance — depends on Alerting's "is there an active alert for this account" check, and Alerting is Phase 10, which doesn't exist yet. Rather than blocking this route on a phase many steps away, `domain.AlertGate` was defined as a real port today, satisfied by `infra/alertgate.StubAlwaysAllow` — a type named unmistakably as a placeholder, answering "yes" unconditionally, with a `TODO(phase-10)` marking exactly what needs to change. This mirrors how Flood Intelligence deferred its own forward-dependency on Alerting (`M9 FE-1`, below) without blocking the rest of that phase — the one difference being that hook was an *outbound* notification simply left out until Alerting existed, while this is an *inbound* question the route needs an answer to right now, so it gets a stub answer instead of being omitted. Nothing outside `module.go` needs to change when a real implementation lands; every other piece was coded against the port, not the stub. <br><br>**Two real bugs were caught and fixed by testing, not assumed away:** (1) `gorilla/websocket`'s `ReadJSON` convenience method conflates a genuine network read error with a JSON-unmarshal error — a single malformed (non-JSON) client message was closing the whole connection, while a semantically-invalid one (out-of-range coordinates) correctly only skipped that message. Fixed by splitting `ReadMessage` + `json.Unmarshal` so only an actual disconnect ends the loop. (2) `XReadGroup` with `">"` only ever returns entries **never before delivered** to any consumer — it does not redeliver a consumer's own unacked backlog. Since the flusher always restarts under the same fixed consumer name, a crash between a batch's `SaveBatch` succeeding and its `XAck` completing left those entries **permanently stuck** on the first implementation. Reproduced directly: `pkill -9`'d the server mid-flush, confirmed the entries sat pending with the server dead, confirmed they stayed stuck even after a plain restart. Fixed by having `ReadBatch` check the consumer's own pending backlog (id `"0"`, never blocks) before reading new entries (id `">"`, blocks). Re-tested after the fix: same crash scenario, entries correctly reclaimed and flushed on restart — with the honest caveat that this makes the guarantee **at-least-once, not exactly-once**: a crash landing in that exact narrow window can produce a harmless duplicate trail row (confirmed happening once during testing), never data loss. For a location trail, a duplicate point costs nothing; a lost one would have defeated the entire feature. |
| **M1 FE-6** (award credibility points, compute + display overall score) | `GET /api/v1/trust-score` (own) | Writing points happens via `credibility_events`, Phase 8 — this route only reads the maintained aggregate. Unlike Profiling's `alert_preferences` (a real row needed from day one, since its fields drive actual notification behavior), a trust score's only field is a single integer whose absence is indistinguishable from a stored zero — so rather than hooking into Identity's registration flow to pre-create a row, "no row yet" is treated as `score: 0` (`domain.ZeroTrustScore`), not a `404`. `updated_at` is omitted from the response entirely for a zero/never-persisted score, rather than serializing a misleading `0001-01-01` zero-time. This also means Phase 8's write path will need an **upsert**, not a plain insert — the first credibility event for any account has no prior row to update. |
| **M1 FE-10** (NGOs view any citizen's credibility score) | `GET /api/v1/accounts/{id}/trust-score` (NGO/admin-scoped) | Open to `ngo_admin`, `ngo_volunteer`, `admin`, and `super_admin` — a read, not a moderation action, so both NGO roles get it, same restriction level as `GET /ngo/me/regions`/`GET /ngo/shelters`. Shares its entire read implementation with `GET /trust-score`: both routes call the same `Service.GetTrustScoreForAccount(accountID)` (renamed from the self-only `GetMyTrustScore` once this route made it clear the logic was never actually self-specific — only WHICH account id gets passed in differs, and that's an HTTP-layer/role-gating decision, not a second use case worth duplicating). A syntactically valid but nonexistent target id returns `score: 0`, same as an account with zero credibility events — not a `404` — consistent with `GET /trust-score`'s own "absence isn't an error" philosophy rather than adding a separate existence check against Identity's `accounts` table just for this read. |
| **M1 FE-12** (fraud/violation-handling portion — account-status portion is Identity's, Phase 0) | `POST /api/v1/admin/accounts/{id}/moderation-actions`<br>`GET /api/v1/admin/accounts/{id}/moderation-actions` | `admin`/`super_admin`-only on both — unlike `GET /accounts/{id}/trust-score`, this is not NGO-scoped, since moderating any citizen or NGO account is squarely an admin action. Deliberately does **not** touch `accounts.status` — `moderation_actions` is an append-only history of individual enforcement decisions (a real audit log: `reason TEXT NOT NULL`, `performed_by`, one row per decision, an account can accumulate many), while `accounts.status` (Identity's `PATCH /admin/accounts/{id}/status`) is a single mutable state machine answering only "can this account authenticate right now." The clearest proof they're not the same concept: `action_type` includes `'warn'`, which has no corresponding `accounts.status` value at all — a warning is a pure paper-trail entry with zero authentication-state effect. `RecordModerationAction` rejects `performed_by == target_account_id` (`ErrCannotModerateSelf`, 400) — an admin can't file a moderation action against their own account, same defensive self-target pattern as `ErrCannotConnectToSelf`/`ErrCannotInviteSelf` elsewhere. `POST` returns `404` (`ErrTargetAccountNotFound`) for a well-formed but nonexistent target id via the FK violation; `GET` has no existence check at all — a target with zero actions (or that doesn't exist) just returns an empty list, same "filter routes don't 404" convention used throughout. Nothing currently keeps `moderation_actions` and `accounts.status` in sync automatically (e.g. a `suspend` action doesn't itself suspend the account) — a deliberate decoupling matching the schema's own two-table split, not an oversight, but worth revisiting if the product ever wants that coupling. |
| **M8 FE-7** (credibility-score half — the incident half is Community Intelligence's, Phase 7) | *reuses* `GET /api/v1/accounts/{id}/trust-score` | Same route as FE-10, different consumer context. |
| **M11 FE-3** (share live GPS with family/safety group during active navigation) | *reuses* `WS /ws/safety-connections/location` (same channel as M1 FE-5, above) | This reuse is a deliberate design decision, not just a coincidence of shared infrastructure: FE-3's own audience ("family/safety group") is exactly what `safety_connections` already models, and the WS route's viewer-resolution logic is generic — it relays to accepted connections regardless of *why* a tracker is sending pings. The shared `AlertGate` precondition holds for both, too: navigating to a shelter is itself something a citizen would only be doing because of a real nearby hazard, so gating FE-3 on "is there an active alert" is the *correct* shared precondition, not an accidental side effect of reuse. One thing worth remembering once Phase 10 actually lands: because the gate is currently `StubAlwaysAllow`, **neither** FE-5 nor FE-3 is genuinely gate-enforced yet — that's consistent between them today, but easy to mistake for "FE-3 already works correctly" if only one of the two flows gets tested once the real check is wired in. **Flagging a gap in the source document itself**: Part 2's ownership map never assigns this FE to any domain, even though Part 1's own table listing for it is `safety_connections` — Trust's table. Not silently skipping it just because the source doc did; it belongs here. |

**Phase 6 (Trust) is now fully built** — every FE it's responsible for has a shipped, tested
route: M1 FE-5 (all five REST routes plus the WS route), M11 FE-3, M1 FE-6, M1 FE-10, M8 FE-7, and
M1 FE-12.

---

# Phase 7 — Community Intelligence (`internal/community`)

### `000011_create_community_intelligence`

Numbered `000011`, not `000009` as originally planned — same golang-migrate renumbering reason as
Facilities' and Trust's migrations: version numbers track actual chronological application order,
not a pre-planned document's numbering, and `000009`/`000010` had already been claimed by Trust's
core tables and its `location_trail` follow-up by the time this phase was actually built.

```sql
CREATE TYPE incident_category AS ENUM ('flooding', 'blocked_road', 'other_hazard');
CREATE TYPE incident_status AS ENUM ('reported', 'verified', 'in_progress', 'resolved');
CREATE TYPE vote_type AS ENUM ('upvote', 'downvote');
CREATE TYPE media_type AS ENUM ('photo', 'video');

CREATE TABLE incident_reports (
    id                       UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_account_id      UUID                    NOT NULL REFERENCES accounts(id),
    category                 incident_category       NOT NULL,
    description              TEXT,
    location                 GEOMETRY(POINT, 4326)   NOT NULL,
    region_id                UUID                    REFERENCES regions(id),
    status                   incident_status         NOT NULL DEFAULT 'reported',
    ai_classified_category   TEXT,
    ai_confidence            NUMERIC,
    auto_verified            BOOLEAN                 NOT NULL DEFAULT false,
    upvote_count             INTEGER                 NOT NULL DEFAULT 0,
    downvote_count           INTEGER                 NOT NULL DEFAULT 0,
    verified_at              TIMESTAMPTZ,
    resolved_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ             NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ             NOT NULL DEFAULT now(),
    priority_score           NUMERIC
);

CREATE INDEX idx_incident_reports_location ON incident_reports USING GIST (location);
CREATE INDEX idx_incident_reports_reporter ON incident_reports (reporter_account_id);
CREATE INDEX idx_incident_reports_status ON incident_reports (status);

CREATE TABLE incident_report_media (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_report_id    UUID         NOT NULL REFERENCES incident_reports(id),
    media_type            media_type   NOT NULL,
    media_url             TEXT         NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_report_media_report ON incident_report_media (incident_report_id);

CREATE TABLE incident_report_votes (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_report_id   UUID         NOT NULL REFERENCES incident_reports(id),
    account_id           UUID         NOT NULL REFERENCES accounts(id),
    vote_type            vote_type    NOT NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (incident_report_id, account_id)
);

CREATE TABLE community_updates (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    author_account_id   UUID         NOT NULL REFERENCES accounts(id),
    region_id           UUID         REFERENCES regions(id),
    title               TEXT,
    content             TEXT         NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_updates_region ON community_updates (region_id);
```

### `000012_add_incident_status_rejected`

An unplanned follow-up migration, same pattern as Phase 6's `000010_add_location_trail` — a real
gap the original plan didn't account for, surfaced only once M15 FE-3 was actually being built.
`incident_status` had no `'rejected'` value: `PATCH .../verify` maps cleanly onto the existing
`'verified'` value, but `PATCH .../reject` had nowhere to go. Three options were weighed (add the
enum value; add a separate `rejected_at` column and leave `status` untouched; ship `reject` as a
schema-inert stub until Trust's `credibility_events` exists) — the project owner chose adding the
enum value, since it gives `reject` a real, durable, filterable state consistent with every other
status transition on this aggregate, rather than a second, parallel "is it rejected" concept living
outside `status` entirely.

```sql
ALTER TYPE incident_status ADD VALUE 'rejected';
```

`'rejected'` is freely settable and re-settable like every other value in this enum — no special
terminal-state handling — same "no restrictive state machine" philosophy `UpdateStatus` already
follows (see M10 FE-4's notes below). The down migration has to rebuild the enum type from scratch
(Postgres has no `DROP VALUE`), and will fail loudly if any row currently has `status='rejected'`
— correct, expected behavior for a down migration that can no longer represent that data, not a bug.

**Resolved**: same integration-contract question as Phase 3, answered the same way — the
AI-classification model is a separate service (out of scope for this Go monolith, same shape as
Flood Intelligence's own prediction model) that calls an ingestion endpoint here, rather than
writing to this database directly. M10 FE-6 is built on that assumption; see its notes below.

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M10 FE-1** (submit geo-tagged incident report) | `POST /api/v1/incident-reports` | **The first non-JSON `POST` in this codebase, deliberately**: `multipart/form-data`, not JSON — report fields (`category`, `description`, `lat`, `lng`) as form fields plus one or more files under a `files` field, in the same request. This is the enforcement mechanism for M10 FE-2's "at least one media file is mandatory" rule: a separate follow-up call could never itself guarantee "at least one" (the client could crash or lose network between two calls), so the only synchronous way to enforce it is folding the first mandatory media into the same request that creates the report. Rejects with `400` (`ErrAtLeastOneMediaRequired`) before touching anything if zero files are attached — confirmed by row count in testing that a rejected zero-file submission creates neither an `incident_reports` row nor any `incident_report_media` row. Sequencing matters: files are validated (content-type against an allow-list, size against `MAX_UPLOAD_SIZE_BYTES`) and uploaded to storage **before** any DB write (a Postgres transaction can't roll back a file already sitting in S3/local disk), then the `incident_reports` row and its `incident_report_media` row(s) are inserted together inside one `domain.Transactor.WithinTransaction` call (same pattern as `ApproveNGO`). Accepted trade-off, stated plainly: if upload N succeeds and upload N+1 or the DB insert fails, files 1..N are orphaned in storage with no DB row pointing at them — cheap and harmless (a few KB of leaked storage), not data loss, not worth a saga/cleanup mechanism here. |
| **M10 FE-2** (attach photos/videos) | `POST /api/v1/incident-reports/{id}/media`<br>`GET /api/v1/incident-reports/{id}/media` | `POST` is **not** the mechanism that satisfies "at least one media required" (that's `POST /incident-reports` above) — it's for adding *more* media to a report after the fact, restricted to the original reporter only (`ErrNotYourIncidentReport`, 403). Shares its entire upload/validation core (`uploadFiles`) with `POST /incident-reports` — same content-type allow-list, same size check, same "validate everything before uploading anything" ordering. `GET` is public, no auth, and — same "filter routes don't 404 on a bad filter" convention used throughout this codebase — never 404s on a bad/nonexistent report id, just returns `[]`. <br><br>**File storage is a new, swappable, cross-module port**: `internal/shared/filestorage.FileStorage`, with two adapters — `Local` (writes to disk, served back via `r.Static("/uploads", ...)`, the dev default) and `S3` (`aws-sdk-go-v2`, works against real AWS **or** a local MinIO container via an optional custom endpoint + path-style addressing — the exact same adapter code either way, only the endpoint config differs). Selected in `main.go` by whether `S3_BUCKET` is set, mirroring exactly how `identity.New` already picks `MailtrapMailer` vs. `LogMailer` by whether `MAILTRAP_API_TOKEN` is set — going from local dev to real S3 later needs env vars only, no code changes. **Real bug caught by testing**: the `Local` adapter's returned `media_url` was missing its `http://` scheme entirely (`localhost:8080/uploads/...`, not a fetchable URL) — `cfg.APIURL`/`EXTERNAL_URL` is configured as a bare `host:port` everywhere else in this app (this was its first real consumer), so `filestorage.NewLocal` now normalizes the scheme itself rather than assuming callers always provide one. Confirmed fixed by actually downloading the served file back and diffing it byte-for-byte against the original upload. |
| **M10 FE-3** (upvote/downvote) | `POST /api/v1/incident-reports/{id}/votes`<br>`DELETE /api/v1/incident-reports/{id}/votes` | `UNIQUE(incident_report_id, account_id)` means an account has **at most one** vote per report, of either type — not one-of-each — so `POST` is an upsert, not a plain insert: it always *sets* the caller's vote to whatever type is given (new vote if none exists, switched vote if one does, a no-op if voting the same way again), returning `200`, not `201`, since it isn't always creating a new resource. Deliberately **not** a toggle-off-on-repeat-click design (clicking upvote twice does not remove it) — that would blur `POST`'s and `DELETE`'s responsibilities; `DELETE` is the one dedicated, idempotent "remove my vote" action (`204` whether or not a vote existed). <br><br>`incident_reports.upvote_count`/`downvote_count` are **maintained counters**, not computed on read — voting has to keep them in sync atomically alongside the vote row itself. The vote upsert first runs `SELECT ... FOR UPDATE` on the caller's existing vote (if any) — the lock only actually holds because this always runs inside `domain.Transactor.WithinTransaction`, which is what makes "read the old vote, then decide the counter delta" safe against a concurrent vote from the same account racing in between. The counter update itself is a single atomic `UPDATE ... SET count = count + $delta` (`IncidentReportRepository.AdjustVoteCounts`), never a read-modify-write on the counter — so even if the "what changed" read were ever slightly stale, the counter itself can't drift from a lost update. Tested explicitly: upvote → counters `(1,0)`; upvoting again (same type) → no-op, counters unchanged; switching to downvote → counters `(0,1)`; a second, independent account upvoting → `(1,1)`, confirming per-account isolation; removing a vote → decrements correctly; removing it again → idempotent `204`, counters unchanged. |
| **M10 FE-4** (status lifecycle: Pending/Verified/Resolved) | `PATCH /api/v1/incident-reports/{id}/status` | `admin`/`super_admin`-only — this is the route M15 FE-4 reuses "(admin scope)"; the NGO-scoped equivalent (M16 FE-4, `PATCH /ngo/incident-reports/{id}/status` — now built, see its own entry below) is a separate route with its own, looser role check and a narrower allowed-status set, not this one. Accepts any of the schema's four real enum values (`reported`/`verified`/`in_progress`/`resolved` — the FE's "Pending/Verified/Resolved" wording is a simplified 3-state description of the same 4-value enum). Freely settable to **any** value, no restrictive forward-only state machine — same "no guard against re-setting" philosophy already established for Infrastructure's own status route, since an admin may legitimately need to reopen a resolved report if the situation recurs (e.g. flooding that recedes then returns). `verified_at`/`resolved_at` are only ever **set** when the corresponding status is reached, never cleared on a later transition — they record historical facts ("this was verified/resolved at some point"), not live state, so reopening a resolved report (`resolved`→`in_progress`) doesn't erase the record that it once was resolved. Tested explicitly: the full `reported`→`verified`→`in_progress`→`resolved` progression, confirming `verified_at` survives past the `verified` stage into `in_progress`/`resolved`; reopening a resolved report back to `in_progress`, confirming `resolved_at` is preserved, not cleared; re-setting the same status twice in a row (no guard, both succeed); and — notably — that even the report's own reporter cannot call this route, only `admin`/`super_admin`. |
| **M10 FE-5** | *(owned by Facilities, Phase 4 — cross-referenced here since M10 lists it)* | |
| **M10 FE-6** (AI classification/verification of incoming reports) | `POST /api/v1/internal/incident-reports/{id}/ai-classification` | An **ingestion endpoint, not a compute one** — the actual classification (an LLM/vision-model call) happens in a separate service, out of scope for this Go monolith, the same shape as Flood Intelligence's own separate prediction model; this route only receives and stores its verdict. Guarded by `serviceauth.RequireServiceKey` — the exact same shared-secret `X-Internal-Service-Key` mechanism Flood Intelligence's `POST /internal/flood-predictions` already established — no account, no JWT, since the caller is a trusted service, not a user. `ai_classified_category` is stored as free `TEXT`, deliberately **not** validated against the `IncidentCategory` enum: an external model's own labels won't necessarily line up one-to-one with this app's four-value enum, and rejecting a well-intentioned classification over a label mismatch would defeat the point of accepting outside input at all. `ai_confidence` is bound as `*float64` with `binding:"required"` on the **pointer**, not the float — `0.0` is a legitimate confidence value (a genuine "not confident at all" classification), so requiring a bare `float64` would have silently treated an explicit `0` the same as "field omitted"; the pointer lets `required` mean "the field must be present" rather than "the value must be non-zero." <br><br>**Auto-verify, and its guard**: if `ai_confidence >= domain.AutoVerifyConfidenceThreshold` (`0.85` — a tunable starting point, not a spec value), the report's `status` also transitions to `verified` in the same call — but **only** if the report is still in its original `reported` state. Without that guard, a late-arriving high-confidence classification could silently downgrade a report an admin already progressed to `in_progress`/`resolved` back to `verified`, since `UpdateStatus` has no restrictive state machine of its own (see M10 FE-4's notes above) and would happily overwrite whatever status it's told to. Both writes — `UpdateAIClassification` and the conditional `UpdateStatus` — happen inside one `domain.Transactor.WithinTransaction` call, so a classification is never stored without its corresponding status transition, or vice versa. Tested explicitly: happy path; confidence supplied as exactly `0.0` (confirmed accepted, not rejected as missing); confidence at the `0.85` threshold and just below it (confirmed the boundary is `>=`, not `>`); the guard itself — a report manually progressed to `in_progress` by an admin, then hit with a `0.99`-confidence classification, confirmed `status` stayed `in_progress` while `ai_classified_category`/`ai_confidence`/`auto_verified` still updated (the two writes are decoupled — the guard only blocks the status half); wrong/missing service key (`401`); malformed/not-found report id (`400`/`404`); missing category, missing confidence, and confidence outside `[0,1]` (`400`). See **"How AI classification results get consumed"** below the table for how this data is actually used downstream. <br><br>**Extended for M15 FE-5** with an optional `priority_score` field — "rank active incidents by **AI**-generated risk score" names this route's own trusted external service as the natural, singular source for that number, the same one already supplying `ai_classified_category`/`ai_confidence`, rather than inventing a second ingestion path or a Go-side scoring formula with no documented spec. Genuinely optional, unlike `ai_confidence`: bound as a plain `*float64` with no `binding:"required"`, since omission is itself a meaningful state ("this call has no risk score to report"), not an error. Like `auto_verified`, it's **fully overwritten every call, including back to `NULL` if a call omits it** — this route represents the AI service's complete current assessment of a report, not a partial patch, so a later call without a score genuinely means the service no longer has one to give. Only validated for being non-negative (`ErrInvalidPriorityScore`, 400) — there's no documented upper bound to enforce. Tested explicitly: a score reported as exactly `0` (confirmed accepted and distinguishable from "never scored" — `priority_score:0` in the response vs. its complete absence); a negative score (400); four reports scored `1.5`/`5.0`/`9.2`/omitted, confirming `GET ?sort=priority_score` (M15 FE-5, below) orders them `9.2 → 5.0 → 1.5 → 0 → nil`, correctly placing an explicit `0` above an unscored (`NULL`) report, not treating them as equivalent. |
| **M10 FE-7** (NGO/admin posts official community updates) | `POST /api/v1/community-updates`<br>`GET /api/v1/community-updates?region_id=` | Per the source doc's own wording ("NGO admins/admins post official updates... within their regions"), region-scoping rules genuinely differ by caller role, so `POST` derives the caller's role from the JWT (never trusted from the request body — same anti-spoofing principle `CreateManualHazardZone`'s `source` field already established) and branches in `app.PostCommunityUpdate`, not via two separate routes: `admin`/`super_admin` may post **platform-wide** (`region_id` omitted — `region_id IS NULL` in the row, a genuine intentional value here, not "not yet resolved") or to **any** specific, real region; `ngo_admin` **must** supply a `region_id`, and only one their own NGO actually operates in. That last check needed a new cross-module read: Community now depends on Geo the same way Geo depends on Identity — `domain.NGORegionLookup`, satisfied by `infra/geo.NGORegionLookup` delegating to a new `geo.Module.RegionIDsForNGO(ctx, ngoID)` export (Geo's second exported cross-context read, alongside Identity's `NGOIDForAccount` pattern Community already reuses via its own `domain.AccountLookup`/`infra/identity.AccountLookup` for resolving "which NGO does this caller belong to" in the first place). A region an NGO doesn't operate in is `ErrNGORegionNotOperational` (403, not 400 — the region is real, the caller just isn't authorized for it, same class of error as `ErrShelterNotManagedByYou`). <br><br>**Real bug found and fixed here, the same `uuid.Nil`-as-sentinel class already caught twice before** (M10 FE-5's status-report target, M11 FE-5's offline-map `region_id`): a client-supplied `region_id` of the literal all-zero UUID string parses successfully via `uuid.Parse`, and without an explicit check it silently collapsed into "no region_id provided" (since the domain/repo layers use `uuid.Nil` as the internal sentinel for platform-wide), turning an invalid region reference into a *successful* platform-wide post instead of a rejected one. Confirmed by testing: `POST` with `region_id: "00000000-…-0000"` returned `201` before the fix. Fixed in the HTTP handler specifically — the only layer where "field omitted" (nil pointer) and "field explicitly the zero UUID" (non-nil pointer to `uuid.Nil`) are still distinguishable, before the two get collapsed into one `uuid.UUID` for the domain/app layers. A well-formed, non-zero, but still nonexistent `region_id` correctly surfaces as `ErrRegionNotFound` (404) via the same FK-violation-to-domain-error mapping `OfflineMapPackage.Save` already established. <br><br>`GET` is public, no auth, `region_id` required (same convention as every other region-scoped list route in this codebase) — but deliberately **includes platform-wide updates** (`region_id IS NULL`) alongside the region's own in its `WHERE region_id = $1 OR region_id IS NULL` query, not a strict equality filter: a nationwide advisory should surface in every region's feed, not just an unscoped list a citizen would never think to call. Tested explicitly: role gate (citizen → 403, no auth → 401); admin posting platform-wide and to a specific real region; admin posting to a well-formed nonexistent region (404) and the all-zero UUID specifically (400, the fix above); `ngo_admin` omitting `region_id` entirely (400); `ngo_admin` posting to their own assigned operational region (201) versus a region their NGO does **not** operate in (403); empty/whitespace-only and missing `content` (400); malformed `region_id` string (400); `GET` without `region_id` (400) and with a malformed one (400); `GET` scoped to each of two regions, confirming each returns its own region's update plus both platform-wide posts but *not* the other region's update; `GET` on a brand-new, never-targeted region, confirming it returns just the platform-wide posts, not an error. |
| **M8 FE-7** (incident half — credibility half is Trust's, Phase 6) | `GET /api/v1/incident-reports?region_id=\|bbox=` | Per the source doc's own wording ("Community incidents overlay with crowdsourced credibility and verification status"), this reuses the *exact same* full `incidentReportResponse` DTO every other incident-report route already returns (`upvote_count`/`downvote_count` as the crowdsourced-credibility signal, `status`/`verified_at`/`resolved_at` as the verification-status signal) — no separate, slimmer overlay-specific shape, unlike Hazard Zone's own bbox overlay (which genuinely needed a lighter type, since it joins in extra fields from `flood_predictions` a full `HazardZone` doesn't carry). One route, two **mutually exclusive** spatial filters — `region_id` (a live `ST_Intersects` join against `regions.boundary`, same convention Infrastructure/Shelter/EssentialLocation already follow, since `incident_reports.region_id` is never populated at write time) or `bbox` (an on-the-fly `ST_MakeEnvelope` rectangle — a map viewport, not an administrative area, same convention and even the same `west,south,east,north` ordering as Flood Intelligence's own `GET /map/flood-overlay?bbox=`). Community gets its own `domain.BBox`/`NewBBox` (`internal/community/domain/bbox.go`) rather than importing Flood Intelligence's — deliberately duplicated, not shared, since these are independent bounded contexts and it's a small value object, not a reason to introduce a cross-context dependency. Exactly one filter is required (`400` if neither or both are given) — matching the "a filter route always needs a filter" convention every other region/bbox list route in this codebase follows; there is currently no unscoped "every report in the country" query on this route. Public, no auth, same map-consumption reasoning as every other citizen-facing map `GET`. Tested explicitly: neither filter (400), both filters together (400, mutually exclusive), malformed `region_id` (400), `region_id` scoped correctly to reports actually inside that region's boundary and excluding reports elsewhere (confirmed against two distinct regions plus a report outside both); malformed/wrong-count/out-of-range `bbox` (400 in each case); a tight `bbox` around a single known report correctly returning only that report; a `bbox` over empty ocean correctly returning `[]`, not an error. This route always requires a spatial filter, by design — it never grew an unscoped "everything" mode; M15 FE-2's own system-wide admin heatmap need is served by a genuinely separate route instead, built as a deliberate follow-up (see its own entry below), not a role-based bypass folded into this one. |
| **M9 FE-1** (community-sourced half of alert fusion) | *no public route* | Internal call into Alerting on `auto_verified`/high-priority — `alerting.NotifyFromIncidentReport(...)`. |
| **M15 FE-2** (incident half of admin heatmap) | `GET /api/v1/admin/incident-reports` | **Revised from the original plan**: originally slated to "reuse `GET /api/v1/incident-reports` (admin-scoped)" — i.e., special-case an authenticated admin hitting the public M8 FE-7 route with no filter into returning everything. Built as a **genuinely separate, dedicated route instead** — the same "separate admin list, not a role-based branch inside the public map route" precedent Flood Intelligence's own M15 FE-1 already established (`GET /admin/hazard-zones`, `GET /admin/flood-predictions` are their own handlers, not `GET /map/flood-overlay` with an admin bypass). Two reasons this was the better call once actually building it: (1) consistency — every other "citizen map view vs. admin full list" split in this codebase already works this way, so folding a bypass into the public route would have been the one inconsistent exception; (2) safety — a route that's public-by-default for everyone else, with an unscoped "return literally everything" mode gated only by a role check buried inside its own handler, is a riskier shape than a route that requires `admin`/`super_admin` auth up front via `module.go`'s own middleware chain, the same way every other admin-only route in this app is gated. `admin`/`super_admin`-only, no query params, no `region_id`/`bbox` requirement — reuses the same `incidentReportRepo.ListAll` → `toIncidentReportResponseList` path M8 FE-7's handler already established, just without any `WHERE` clause. Tested explicitly: no auth (401), citizen role (403), admin with zero filters returning the full unscoped list (200), and confirming the public `GET /incident-reports` route's own filter-required behavior is unchanged by this addition. |
| **M15 FE-3** (admin review/validate/approve/reject reports) | `GET /api/v1/admin/incident-reports?status=`<br>`PATCH /api/v1/admin/incident-reports/{id}/verify`<br>`PATCH /api/v1/admin/incident-reports/{id}/reject` | `GET` is the **same route and handler** M15 FE-2 already built (`ListIncidentReportsForAdmin`), extended with an optional `status` query param rather than a second competing registration on the same path — `status` omitted is M15 FE-2's unscoped heatmap, `status` supplied is M15 FE-3's triage queue; same convention Flood Intelligence's `GET /admin/hazard-zones?status=` already established for its own optional admin-list filter. An invalid `status` value is `400`, listing all five real values including the new `rejected` (below). <br><br>`verify`/`reject` are **not new use cases** — both are the exact same `Service.UpdateIncidentReportStatus` the generic `PATCH /incident-reports/{id}/status` (M10 FE-4) already uses, called with a fixed target status (`verified`/`rejected`) instead of a caller-chosen one. Deliberately thin: a dedicated, semantically named admin-review action reads better in a triage UI than the generic status route, but there's no reason to duplicate `UpdateStatus`'s domain logic (`verified_at` handling, the "no restrictive state machine" behavior) to get that naming. **Required a new migration** (`000012_add_incident_status_rejected`, see above) since `incident_status` had no `rejected` value until this FE needed one — resolved by adding it to the enum, the project owner's choice among three options weighed (see the migration's own note). Tested explicitly: no auth (401) and citizen role (403) on both `verify` and `reject`; a valid report transitioning to each state (200, `status` and, for `verify`, `verified_at` set correctly); malformed id (400); not-found id (404); `GET ?status=rejected` and `?status=verified` each correctly isolating only reports in that state; `?status=bogus` (400); `GET` with no filter still returning the full unscoped list (confirming M15 FE-2's own behavior is unaffected by this extension); confirmed the generic `PATCH /incident-reports/{id}/status` also now accepts `rejected` (the enum change applies everywhere that reads it, not just these two new routes) and still rejects a bogus value. |
| **M15 FE-4** (incident lifecycle, admin-driven) | *reuses* `PATCH /api/v1/incident-reports/{id}/status` (admin scope) | No new work — this route was already fully built and admin-gated as part of M10 FE-4 (see its own notes above), before M15 FE-4 was ever in scope. Listed here only because Part 2's ownership map calls it out as its own FE; there was never a second route to build. |
| **M15 FE-5** (rank active incidents by AI risk score) | `GET /api/v1/admin/incident-reports?sort=priority_score` | **Same route and handler** as M15 FE-2/FE-3 (`ListIncidentReportsForAdmin`), extended with a third, independent, optional query param — `status` and `sort` are orthogonal and combine freely (`?status=verified&sort=priority_score`), since ranking by risk has no inherent status restriction of its own; an admin who wants "active reports ranked by risk" combines both filters themselves rather than `sort=priority_score` silently implying some hardcoded status. `sort`'s only valid value today is `priority_score` (any other non-empty value is `400`); omitted, the route keeps its existing newest-first default, unaffected. Orders `priority_score DESC NULLS LAST, created_at DESC` — highest risk first, reports never AI-scored sort last rather than first or being silently excluded, and ties fall back to recency. The `ORDER BY` clause itself is built from one of two fixed Go string constants chosen by a bool, never interpolated from request input directly — column/direction can't be parameterized via query placeholders the way values can, so this is the standard safe pattern for a dynamic sort, not a SQL-injection risk. **Required no new migration** — `priority_score` already existed as a nullable column from Phase 7's original migration, just never had a writer until M10 FE-6 was extended for this FE (see its own entry above). Tested explicitly: full descending ranking across four differently-scored reports plus one never-classified report, confirming the exact order `9.2 → 5.0 → 1.5 → 0 → nil`; invalid `sort` value (`400`); `sort` omitted (unaffected default behavior); `sort` combined with `status`, confirming both filters apply together correctly. |
| **M16 FE-2** (incident half — region-scoped NGO tracking) | `GET /api/v1/ngo/incident-reports?region_id=` | `region_id` must be one the caller's own NGO actually operates in — the exact same `requireNGOOperatesInRegion` check M10 FE-7 established for posting community updates, now factored into a shared private helper (`internal/community/app/ngo_region_guard.go`) once a second use case needed it, rather than duplicating the resolve-NGO-then-check-membership logic a second time. Authenticated, but deliberately **no `RequireRole`** — open to any NGO staff member (admin or volunteer), same "authorization comes from the NGO-membership lookup itself, not a role check" pattern Geo's own `GET /ngo/me/regions` already established, since tracking reports is a read every NGO staff member needs, not an admin-only action. Reuses the *exact same* `IncidentReportRepository.ListForRegion` query M8 FE-7's public map route already built — the underlying data need ("reports inside this region's boundary") is identical, only the caller's authorization and required auth differ, so no new SQL was needed. `region_id` is required, no `bbox` alternative — this is regional tracking, not a map viewport. **Real polish bug caught by testing**: `ErrNGORegionNotOperational`'s error message was originally written specifically for `PostCommunityUpdate` ("you may only post updates to..."), and reusing it verbatim here produced a nonsensical message on a `GET` ("post updates" on a read route). Reworded to a generic "your ngo does not operate in this region" now that the error is genuinely shared across a write path and a read path, with a doc comment on the error itself noting it's shared, not action-specific — confirmed both call sites still read correctly after the change. Tested explicitly: no auth (401); missing/malformed `region_id` (400); a citizen with no NGO membership (400, `ErrNoNGOMembership`); an `ngo_admin` querying their own assigned region (200, correctly includes a report inside it and excludes one from an unassigned region); the same `ngo_admin` querying a region their NGO does **not** operate in (403); an `ngo_volunteer` from the *same* NGO getting the identical 200/403 behavior as the admin (confirming the route is genuinely open to both NGO roles, not admin-only). |
| **M16 FE-3** (NGO reviews/verifies within operational authority) | `PATCH /api/v1/ngo/incident-reports/{id}/verify` | `ngo_admin`-only — a credibility judgment call about a citizen report, same "bigger-call-than-routine-tracking" role split M16 FE-9 already established between shelter certification (`ngo_admin`-only) and occupancy tracking (any staff); M16 FE-2's own `GET` stays open to both roles since reading is not a judgment call. Not a new use case — reuses the exact same `Service.UpdateIncidentReportStatus` the admin route (M15 FE-3) already calls, fixed to `verified`, the NGO-scoped counterpart to `VerifyIncidentReportForAdmin`. "Within operational authority" is enforced by a **new**, report-ID-first authorization check (`requireNGOOperatesOnReport`, alongside the region-ID-first `requireNGOOperatesInRegion` M10 FE-7/M16 FE-2 already share) — since the caller only has a report id here, not a region id, authorizing it means resolving the report's *location* against the NGO's operational regions, not matching a given region id directly. That needed a new repository method, `IncidentReportRepository.IsWithinAnyRegion(reportID, regionIDs)` — a single `EXISTS (... JOIN regions ON ST_Intersects(...) WHERE ir.id = $1 AND r.id = ANY($2))` query, the report-first counterpart to `ListForRegion`'s region-first one; confirmed pgx v5 binds a plain `[]uuid.UUID` directly as a Postgres `uuid[]` for `= ANY($2)`, no extra encoding needed. The use case checks the report **exists** (`FindByID`) *before* the region-authorization check, deliberately — otherwise a nonexistent report id would incorrectly surface as `403` (no row for the region check to match) instead of the correct `404`. Tested explicitly: no auth (401); `ngo_volunteer` (wrong role, 403 — the role gate blocks before the NGO-membership check ever runs, confirmed separately for a citizen too); a report inside the caller's own NGO's region (200, `status`/`verified_at` set correctly); a report outside it (403); a *different* NGO's admin with no operational regions at all attempting the same report (403); malformed id (400); a well-formed but nonexistent report id (404, confirmed **not** 403 — the existence-before-authorization ordering). |
| **M16 FE-4** (NGO updates incident states within region) | `PATCH /api/v1/ngo/incident-reports/{id}/status` | Per the FE's own wording ("update incident states — **verified, in-progress, resolved** — within regional boundaries"), restricted to exactly those three values (`ErrInvalidNGOIncidentStatus`, 400 for anything else) — unlike the admin-only generic route (M10 FE-4), which is freely settable to all five. An NGO can't reopen a report back to `reported` or reject it outright: `rejected` is specifically an admin credibility judgment (M15 FE-3), not an NGO's to make, and `reported` is the pre-verification starting state, not something operational lifecycle tracking should need to set. Open to **any** NGO staff (admin or volunteer) — unlike `verify`'s `ngo_admin`-only gate, this is routine operational tracking (mark progress, mark resolved), the same role level as M16 FE-2's read and M16 FE-9's occupancy `PATCH`. Shares both the region-of-authority check (`requireNGOOperatesOnReport`) and the underlying status mutator (`Service.UpdateIncidentReportStatus`) with `VerifyIncidentReportForNGO` above — this route's only distinct job is the narrower value-set validation. Tested explicitly: no auth (401); `ngo_volunteer` succeeding (200, confirming the route is genuinely open to both roles, not just admin); each of the three allowed values accepted; `reported` and `rejected` specifically rejected (400) alongside a fully bogus value; a report outside the caller's NGO's region (403); a missing `status` field (400); a well-formed but nonexistent report id (404). |
| **M16 FE-7** (community-channel half — NGO posts targeted updates) | *reuses* `POST /api/v1/community-updates` (NGO-scoped) | **Confirmed complete, no new code needed.** The source FE ("send targeted alerts and updates to affected users, safety groups, community channels") spans two structurally different delivery mechanisms, each owned by a different context — same split pattern as M8 FE-7 (credibility half/incident half). The "alerts... to affected users, safety groups" half needs `alerts`/`alert_deliveries` (Alerting, Phase 10, not built yet); the "updates... to community channels" half is exactly what `PostCommunityUpdate` (M10 FE-7) already does — an `ngo_admin` posting to a region their NGO operates in *is* a targeted community-channel update. Nothing this context owns is missing; the alert half is a genuine Phase-10 dependency, not deferred work sitting in this phase. |

### How AI classification results get consumed

M10 FE-6 only *receives and stores* a classification — it's worth being explicit about what
actually reads `ai_classified_category`/`ai_confidence`/`auto_verified` once they're written,
since "we ingest AI results" on its own doesn't say what they're *for*. There are three layers:

1. **Free/automatic, already live.** `toIncidentReportResponse` — the same DTO every
   incident-report route returns — already includes all three fields. Any client hitting
   `GET /api/v1/incident-reports?...` or reading a single report gets the classification for
   free, no extra work, because it's just columns on the aggregate. This layer needed no
   additional code; it existed the moment the columns were added to the `SELECT`.
2. **Internal self-consumption, built as part of M10 FE-6 itself.** The auto-verify escalation
   (`app.ApplyAIClassification` transitioning `status` to `verified` when confidence clears the
   threshold, guarded to only fire from `reported`) *is* a consumer — just one living inside the
   same use case that receives the data, not a separate downstream call. This is the only
   consumption that exists today.
3. **Cross-module consumers, named in this roadmap but not yet built.** These are follow-up work
   on top of an already-complete Phase 7, the same relationship `trust.RecordCredibilityEvent`
   has to Phase 7 in Phase 8's notes below:
   - `alerting.NotifyFromIncidentReport(...)` (**M9 FE-1**) — a high-confidence/auto-verified
     flooding classification is exactly the kind of signal that should feed alert fusion, once
     `internal/alerting` exists (Phase 10).
   - `trust.RecordCredibilityEvent(...)` (**Phase 8**) — an AI-confirmed report is evidence for
     the *reporting account's* credibility, not just the report's own status; this is the same
     kind of event Phase 8 already plans to record for admin verify/reject decisions.
   - **M15 FE-3** (admin triage: `GET /api/v1/admin/incident-reports?status=`) and **M15 FE-5**
     (`?sort=priority_score`) — both now built, see their own entries above — are the two read
     routes an admin uses to *act on* classification results (triage queue, priority ranking),
     rather than routes that write anything new.

   None of these three are required for M10 FE-6 to be "done" — the route's own job (store the
   verdict, self-consume it for auto-verify) is complete and tested above. They're listed here so
   the AI-classification data isn't mistaken for dead weight just because most of its consumers
   don't exist yet.

M10 FE-1 through M10 FE-4, M10 FE-6, M10 FE-7, M8 FE-7, M15 FE-2 through M15 FE-5, and M16 FE-2
through M16 FE-7 are now fully built and tested — see notes above (M10 FE-5 is Facilities', Phase
4, already built — cross-referenced here, not pending work for this phase; M15 FE-4 and M16 FE-7
needed no new work of their own, see their own notes above). **Phase 7 (Community Intelligence) is
now fully built** — M9 FE-1's Alerting hook is the one intentional exception, deferred to Phase 10
by design (same treatment Flood Intelligence's own M9 FE-1 got in Phase 3), not an oversight.

---

# Phase 8 — Trust, follow-up: credibility events

### `000010_add_credibility_events`
```sql
CREATE TYPE credibility_event_type AS ENUM ('report_verified', 'report_rejected', 'false_report_penalty');

CREATE TABLE credibility_events (
    id                    UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id            UUID                     NOT NULL REFERENCES accounts(id),
    incident_report_id    UUID                     REFERENCES incident_reports(id),
    event_type            credibility_event_type   NOT NULL,
    points_delta          INTEGER                  NOT NULL,
    created_at            TIMESTAMPTZ              NOT NULL DEFAULT now()
);
```

### Routes

No new public route — this is the write path behind `internal/trust`'s existing `GET
/api/v1/trust-score` (Phase 6). The append happens via a small public function,
`trust.RecordCredibilityEvent(ctx, accountID, incidentReportID, eventType, pointsDelta)`, called
from `internal/community`'s verify/reject handlers (Phase 7) after a moderation decision — not by
`community` writing into `trust`'s tables directly.

---

# Phase 9 — Relief Operations, core (`internal/relief`)

### `000011_create_relief_operations_core` (applied as `000013`)

Numbered `000013`, not `000011` as originally planned — same golang-migrate renumbering reason as
every prior phase's migration: version numbers track actual chronological application order, not a
pre-planned document's numbering, and `000011`/`000012` had already been claimed by Community
Intelligence's core tables and its `rejected`-status follow-up by the time this phase was actually
built. Added three indexes beyond what's shown below, not present in the original plan — a GIST
index on `aid_requests.location` (backs the `ST_Intersects` join every geo-tagged aggregate in this
app resolves `region_id` through, same as `idx_incident_reports_location`) plus indexes on
`requester_account_id` and `status` (back `?mine=true` and admin/NGO status filtering respectively)
— the other six tables in this migration get no extra indexes yet, since only `aid_requests` has a
route touching it today.

```sql
CREATE TYPE aid_category AS ENUM ('food', 'water', 'shelter', 'medical', 'other');
CREATE TYPE aid_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE aid_request_status AS ENUM ('pending', 'in_progress', 'fulfilled', 'cancelled');

CREATE TABLE aid_requests (
    id                       UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_account_id     UUID                  NOT NULL REFERENCES accounts(id),
    category                 aid_category          NOT NULL,
    description              TEXT,
    location                 GEOMETRY(POINT, 4326) NOT NULL,
    region_id                UUID                  REFERENCES regions(id),
    severity                 aid_severity          NOT NULL,
    status                   aid_request_status    NOT NULL DEFAULT 'pending',
    created_at               TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE TYPE campaign_status AS ENUM ('active', 'closed');

CREATE TABLE donation_campaigns (
    id                     UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_account_id   UUID              REFERENCES accounts(id),
    ngo_id                 UUID              REFERENCES ngos(id),
    title                  TEXT              NOT NULL,
    description            TEXT,
    goal_amount            NUMERIC,
    raised_amount          NUMERIC           NOT NULL DEFAULT 0,
    region_id              UUID              REFERENCES regions(id),
    status                 campaign_status   NOT NULL DEFAULT 'active',
    created_at             TIMESTAMPTZ       NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ       NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(organizer_account_id, ngo_id) = 1)
);

CREATE TYPE donation_status AS ENUM ('collected', 'allocated', 'delivered');

CREATE TABLE donations (
    id                             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id                    UUID              NOT NULL REFERENCES donation_campaigns(id),
    donor_account_id               UUID              REFERENCES accounts(id),
    amount                         NUMERIC           NOT NULL,
    status                         donation_status   NOT NULL DEFAULT 'collected',
    allocated_to_aid_request_id    UUID              REFERENCES aid_requests(id),
    collected_at                   TIMESTAMPTZ       NOT NULL DEFAULT now(),
    allocated_at                   TIMESTAMPTZ,
    delivered_at                   TIMESTAMPTZ
);

CREATE TYPE missing_person_status AS ENUM ('missing', 'found', 'deceased');

CREATE TABLE missing_persons (
    id                     UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by_account_id UUID                    NOT NULL REFERENCES accounts(id),
    name                   TEXT                    NOT NULL,
    age                    INTEGER,
    description            TEXT,
    photo_url              TEXT,
    last_seen_location     GEOMETRY(POINT, 4326)   NOT NULL,
    last_seen_at           TIMESTAMPTZ             NOT NULL,
    region_id              UUID                    REFERENCES regions(id),
    status                 missing_person_status   NOT NULL DEFAULT 'missing',
    created_at             TIMESTAMPTZ             NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE TABLE missing_person_sightings (
    id                      UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    missing_person_id       UUID                    NOT NULL REFERENCES missing_persons(id),
    reported_by_account_id  UUID                    NOT NULL REFERENCES accounts(id),
    location                GEOMETRY(POINT, 4326)   NOT NULL,
    description             TEXT,
    sighted_at              TIMESTAMPTZ             NOT NULL,
    created_at              TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE TABLE field_observations (
    id                       UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_account_id     UUID                    NOT NULL REFERENCES accounts(id),
    task_assignment_id       UUID,  -- FK added in Phase 11
    location                 GEOMETRY(POINT, 4326)   NOT NULL,
    notes                    TEXT,
    photo_url                TEXT,
    created_at               TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE TABLE feedback (
    id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    submitted_by_account_id   UUID         NOT NULL REFERENCES accounts(id),
    aid_request_id            UUID         REFERENCES aid_requests(id),
    donation_campaign_id      UUID         REFERENCES donation_campaigns(id),
    rating                    INTEGER      NOT NULL,
    comments                  TEXT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (rating BETWEEN 1 AND 5)
);
```

### Routes (core)

| FE | Route(s) | Notes |
|---|---|---|
| **M13 FE-1** (submit/track aid requests, prioritized by severity) | `POST /api/v1/aid-requests`<br>`GET /api/v1/aid-requests/{id}`<br>`GET /api/v1/aid-requests?mine=true`<br>`PATCH /api/v1/aid-requests/{id}/status` | First route in a brand-new bounded context — `internal/relief` gets the full `domain/app/infra/http` shape every other context already has, plus the same two cross-context dependencies (Identity, Geo) Community Intelligence needed, wired the identical way (`domain.AccountLookup`/`domain.NGORegionLookup` ports, satisfied by `infra/{identity,geo}` adapters delegating to `identity.Module`/`geo.Module`). `POST` is open to **any** authenticated account, not just citizens — admins and NGO staff can personally need aid too, same as everyone else. Unlike `incident_reports`, there's no public "browse aid requests" map FE anywhere in the source doc for this table (`missing_persons` gets one, M13 FE-6; `aid_requests` doesn't) — visibility here is role-scoped from the start, not public. <br><br>**`PATCH .../status` is one route with three caller types**, a genuine design decision the project owner resolved before writing code: `admin`/`super_admin` may set **any** of the four real status values, no restriction, no ownership/region check (same "no restrictive state machine" philosophy `incident_reports`' own admin status route follows); `ngo_admin`/`ngo_volunteer` (any NGO staff, not just admins — routine operational lifecycle progress, same role level as `incident_reports`' own NGO status route) may set only `{in_progress, fulfilled}`, and only for a request whose location falls within their own NGO's operational regions; the requester themselves may set only `cancelled` — withdrawing a request they no longer need, but not declaring it fulfilled themselves, since only whoever is actually delivering aid can make that call. All three share one route registration and one use case (`Service.UpdateAidRequestStatus`), branching on the caller's JWT role — the same "role-derived branching within one handler" pattern `PostCommunityUpdate` (M10 FE-7) already established, not a role-based bypass folded into an otherwise-public route (that shape was deliberately rejected for M15 FE-2 — the difference here is every caller is already authenticated, just with role-dependent permitted values). The NGO-region check needed a new `AidRequestRepository.IsWithinAnyRegion(requestID, regionIDs)` — a single `EXISTS (... JOIN regions ON ST_Intersects(...) WHERE ar.id = $1 AND r.id = ANY($2))` query, the exact same shape Community Intelligence's own `IsWithinAnyRegion` already established for incident reports. Existence (`FindByID`) is checked before any authorization check, so a nonexistent id always surfaces as `404`, never a misleading `403` — same fix already applied for incident reports. <br><br>**Since `PATCH .../status` now needs to authorize both admin and NGO staff, `GET /aid-requests/{id}` was extended to match** — not part of the original 4-route ask in isolation, but a necessary consequence of it: without this, an NGO/admin caller would have no way to look up an aid request before or after acting on it. Same three-way split as the status route (owner-only for the requester; unrestricted for admin; region-scoped for NGO staff), reusing the identical `requireNGOOperatesOnAidRequest` guard. <br><br>**Real bug caught by testing, the same zero-value class already fixed for `ai_confidence`/`priority_score`**: `lat`/`lng` were originally bound as plain `float64` with `binding:"required"`, which would have silently rejected a genuine `lat=0`/`lng=0` coordinate (the equator/prime meridian) as "field missing" — confirmed the existing `POST /hazard-zones/risk-check` route doesn't have this bug (it never used `binding:"required"` on its own `lat`/`lng` at all), so this was specific to the new code, not a pre-existing pattern. Fixed the same way as the other two: `*float64` with `binding:"required"` on the **pointer**, so `required` means "the field must be present," not "must be non-zero." Confirmed by testing: `lat:0, lng:0` now returns `201`, not `400`. <br><br>Tested explicitly (24 cases across all four routes): submission validation (invalid category/severity, missing lat/lng, the zero-coordinate fix); `GET`/list auth and `mine=true` required exactly; the full three-way `GET`/`PATCH` split — owner-only citizen access and ownership violations (403), admin unrestricted access, NGO staff scoped correctly to their own region and rejected outside it (403), NGO staff's narrower value set rejecting `cancelled` (400); a citizen trying to set anything other than `cancelled` on their own request (400); malformed/not-found ids (400/404) confirmed **not** to leak as 403 for NGO/admin callers. |
| **M13 FE-2** (create/join/manage donation campaigns) | `POST /api/v1/donation-campaigns`<br>`GET /api/v1/donation-campaigns?region_id=`<br>`GET /api/v1/donation-campaigns/{id}`<br>`PATCH /api/v1/donation-campaigns/{id}`<br>`POST /api/v1/donation-campaigns/{id}/close` | The table's own `CHECK (num_nonnulls(organizer_account_id, ngo_id) = 1)` maps directly onto the FE's own wording ("**Citizens and NGOs** create... campaigns") — exactly one of the two is always set, never both, never neither, enforced in the domain constructor too (defense in depth) even though the app layer only ever calls it correctly. Which one a `POST` gets is **role-derived from the JWT, never a client choice** — same anti-spoofing principle `CreateManualHazardZone`'s own role-derived `source` already established: an `ngo_admin` caller organizes on behalf of their own NGO (resolved via the same `AccountLookup` port `aid_requests` already uses); everyone else — including `ngo_volunteer`, confirmed by testing — organizes personally. `ngo_volunteer` is deliberately excluded from NGO-organizing, same "bigger call → `ngo_admin` only" role split M16 FE-9's shelter registration and M13 FE-1's own NGO-status-progression already established, since a fundraising campaign carries real financial/reputational weight. <br><br>**"Full transparency" makes the two `GET`s genuinely public** — no auth, no ownership check — unlike `aid_requests` (M13 FE-1), which has no equivalent public browse FE anywhere in the source doc and is role-scoped from the start. `region_id` is a **direct, client-supplied FK** here, not resolved live: `donation_campaigns` has no location column at all (nothing to `ST_Intersects` against), so unlike almost every other geo-tagged aggregate in this app, a bad/nonexistent `region_id` surfaces as `ErrRegionNotFound` (404) via the FK violation, same convention `OfflineMapPackage.Save` already established. `region_id` is nullable and means **nationwide** when omitted — a genuine, intentional value, not "not yet resolved," same convention `community_updates` already established for its own platform-wide posts — so `GET ?region_id=` deliberately includes nationwide campaigns alongside the region's own (`region_id = $1 OR region_id IS NULL`), the identical query shape `community_updates`' own list route already uses. **The same `uuid.Nil`-as-sentinel bug class already caught three times before** (essential-location status reports, offline-map `region_id`, community-updates `region_id`) was headed off *proactively* here: the literal all-zero UUID string is rejected at the HTTP layer before it can collapse into "nationwide" — confirmed by testing. <br><br>**`PATCH`/`close` share one authorization helper** (`requireManagesCampaign`) that branches on which ownership shape the campaign has: a citizen-organized campaign belongs to exactly that account; an NGO-organized one belongs to that NGO's `ngo_admin`(s) only — confirmed by testing that the *same* NGO's `ngo_volunteer` is correctly forbidden from managing it, even though they're valid staff for read/tracking-style actions elsewhere in this app. `close` is a genuine **one-way terminal action** (unlike `incident_reports`'/`aid_requests`' own status routes) — no "reopen" route exists among M13 FE-2's five, and `Close()` guards against double-closing (`ErrCampaignAlreadyClosed`, `400` — matching `HazardZone.Resolve()`'s exact same guard-and-status-code precedent, not `409`). `PATCH` is a real partial patch (`title`/`description`/`goal_amount`, all `*` fields, all-nil body rejected) — `title` can never be cleared (required field, same convention `PATCH /ngo/me`'s own `name` already follows), `goal_amount` if provided always replaces the existing goal outright (no way to clear a goal back to "none" via this route — a deliberate simplification, no plausible use case surfaced for it). `region_id` is deliberately **not** patchable — changing a campaign's geographic scope after donations may already exist is a bigger call than this route's own scope. `raised_amount` is never client-settable anywhere in this FE — it's the donation lifecycle's own maintained aggregate (M13 FE-5, not built yet), always `0` today. Tested explicitly (28 cases across all five routes): the role-derived organizer split (citizen, `ngo_admin`, and `ngo_volunteer` all producing the correct shape); missing title, non-positive `goal_amount` (both `0` and negative), the `uuid.Nil` region fix, and a genuinely nonexistent region (404); public unauthenticated `GET` for both single and list; nationwide campaigns correctly appearing in every region's list and region-specific ones correctly excluded from other regions; the full ownership split on `PATCH`/`close` — owner success, non-owner citizen `403`, same-NGO `ngo_volunteer` `403`, same-NGO `ngo_admin` success; all-nil `PATCH` body and title-cleared-to-blank (`400` each); double-close (`400`); not-found id (`404`) on every write route. |
| **M13 FE-3** (missing person reporting + sightings + status updates) | `POST /api/v1/missing-persons`<br>`GET /api/v1/missing-persons?region_id=`<br>`PATCH /api/v1/missing-persons/{id}/status`<br>`POST /api/v1/missing-persons/{id}/sightings`<br>`GET /api/v1/missing-persons/{id}/sightings` | `missing_persons` DOES have a location column (`last_seen_location`) — unlike `donation_campaigns`, `region_id` here is resolved **live via `ST_Intersects`**, not a direct client-supplied FK, the same convention `aid_requests`/`incident_reports` already established (confirmed against the actual schema, not assumed from the table name alone). `POST` is open to any authenticated account, same openness as `aid_requests`. Since `missing_persons` genuinely **does** have a public map FE (M13 FE-6, which reuses this route's `GET`s directly — the exact contrast the `aid_requests` notes above already called out: *"unlike `incident_reports`, there's no public browse `aid_requests` map FE... `missing_persons` gets one, M13 FE-6"*), both `GET`s are public, no auth — closer to `incident_reports`' own openness than `aid_requests`' role-scoped one. <br><br>**`PATCH .../status`'s caller scope was a genuine open design question, resolved via explicit sign-off before writing code** — same shape as `aid_requests`' own status-route question, but split differently: rather than three *disjoint* value sets per caller (`aid_requests`' shape), this is one shared restricted set (`{found, deceased}`) for **two** of the three caller types, plus a fully unrestricted third: `admin`/`super_admin` may set **any** of the three real status values, no ownership/region check, same "no restrictive state machine" philosophy already established; `ngo_admin`/`ngo_volunteer` (any NGO staff, not just admins — a search-and-rescue effort confirming an outcome, same role level as `aid_requests`' own NGO status route) may set only `{found, deceased}`, and only for a person whose last-seen location falls within their own NGO's operational regions; the original reporter may **also** only set `{found, deceased}` — they can update their own report once they learn the outcome, but can't unilaterally reopen it back to `missing` themselves. All three share one route registration and one use case (`Service.UpdateMissingPersonStatus`), same role-derived-branching-within-one-handler pattern used throughout this codebase. Existence (`FindByID`) is checked before any authorization check for all three caller types — confirmed by testing that a well-formed but nonexistent id surfaces as `404` for the admin, NGO, *and* reporter paths alike, never a misleading `403`. The NGO-region check reuses the exact `IsWithinAnyRegion`-plus-guard shape already built twice (`incident_reports`, `aid_requests`) — a third `MissingPersonRepository.IsWithinAnyRegion` and a third `requireNGOOperatesOnMissingPerson` guard, added to the same `ngo_region_guard.go` file `aid_requests`' own guard already lives in. <br><br>**Sightings are deliberately open to any authenticated account, not just the reporter** — `POST .../sightings` is the crowdsourcing mechanism itself (someone spotting the missing person is almost never going to be the person who filed the original report), same "any authenticated citizen" openness Facilities' own essential-location status reports already established, confirmed by testing that a non-reporter citizen can post a sighting with no ownership check at all. `POST` confirms the missing person exists first (`FindByID`) before inserting, so a bad id surfaces as a clean `404`, not a raw FK violation. `GET .../sightings` never `404`s on a bad/nonexistent missing-person id — same "filter routes don't 404" convention `incident_reports`' own `GET .../media` already established — just returns `[]`. <br><br>**The zero-coordinate `binding:"required"` bug was headed off proactively** (the 4th occurrence of this exact class, after `ai_confidence`, `priority_score`, `aid_requests`' own `lat`/`lng`) — both `POST /missing-persons` (`lat`/`lng` for `last_seen_location`) and `POST .../sightings` (`lat`/`lng` for the sighting's own location) used `*float64` with `binding:"required"` on the pointer from the start, confirmed by testing that `lat:0, lng:0` returns `201` on both routes, not `400`. `last_seen_at`/`sighted_at` are plain `time.Time` with `binding:"required"` (not pointers) — go-playground/validator has a built-in special case treating a zero `time.Time` as "missing," so unlike a numeric zero this doesn't have the same false-rejection risk; confirmed by testing that a request with the field entirely omitted is correctly rejected as `400`. Tested explicitly (41 cases across all five routes): submission validation (missing name, the zero-coordinate fix, missing lat/lng, missing `last_seen_at`, `age` zero/negative rejected as invalid); region-scoped list correctly including/excluding reports by whether `last_seen_location` intersects the queried region, confirmed against two disjoint real regions; the full three-way `PATCH` split — non-reporter ownership rejection (`403`), reporter restricted to `{found, deceased}` (`400` on `missing`, `200` on `found`), NGO staff rejected outside their operational region (`403`), NGO volunteer *and* NGO admin both succeeding in-region with the narrower value set (`200`), platform admin unrestricted including reopening back to `missing` (`200`), invalid status value and missing `status` field (`400` each), malformed id (`400`), not-found id confirmed `404` (not `403`) for all three caller types; sightings — no-auth (`401`), non-reporter and reporter both successfully posting (`201`), the zero-coordinate fix, missing lat/lng and missing `sighted_at` (`400` each), nonexistent missing-person id (`404`, not a raw constraint violation), malformed id (`400`), and the sightings list correctly ordering newest-first and returning `[]` for both a nonexistent id and a real id with zero sightings. |
| **M13 FE-5** (donation lifecycle: collection → allocation → delivery) | `POST /api/v1/donation-campaigns/{id}/donations`<br>`PATCH /api/v1/donations/{id}/allocate`<br>`PATCH /api/v1/donations/{id}/deliver` | `donation_campaigns.raised_amount` — left at `0` by design when M13 FE-2 was built, explicitly deferred to "the donation lifecycle's own maintained aggregate" — is finally written here: `POST .../donations` inserts the new `donations` row AND increments `raised_amount` in **one transaction**, the first cross-table atomic write this bounded context has needed (`aid_requests`/`donation_campaigns`/`missing_persons` were each single-table writes). Required introducing `internal/relief`'s own `domain.Transactor` port + `infra/postgres.Transactor` — the exact same shape Identity's `ApproveNGO` and Community Intelligence's `CastVote` already established, copied verbatim rather than reinvented. `POST` is open to any authenticated account — donating is arguably how a citizen "joins" a campaign, per M13 FE-2's own "create/join/manage" wording — and rejects donating to an already-closed campaign by **reusing** `ErrCampaignAlreadyClosed` rather than inventing a second "closed" error, since the underlying fact (this campaign is closed) is the same regardless of which action tripped over it. `donor_account_id` is always the authenticated caller, never a request field, same anti-spoofing principle as every other attributed write in this codebase — the column is nullable in the schema, but that's read as room for a future anonymous-donation path, not something this FE needs to support today. <br><br>**Who can call `allocate`/`deliver` was a genuine open design question, resolved via explicit sign-off before writing code**: the project owner chose "campaign manager + admin" — the same `requireManagesCampaign` ownership check `PATCH /donation-campaigns/{id}`/`close` (M13 FE-2) already established, **plus** an admin/super_admin override that those two routes deliberately do NOT have. This is a genuine, intentional asymm-metry from M13 FE-2's existing behavior, not an inconsistency: deciding where real raised funds/goods actually go (and confirming they arrived) was judged to warrant central oversight even for a citizen-organized campaign, in a way that editing a campaign's title or closing it doesn't. Implemented as a new `requireManagesCampaignOrAdmin` guard, layered on top of the existing `requireManagesCampaign` rather than modifying it — confirmed by testing that `PATCH /donation-campaigns/{id}`'s own owner-only behavior is completely unchanged. Confirmed by testing that a same-NGO `ngo_volunteer` is still forbidden from allocating/delivering an NGO-organized campaign's donations, same as they already are from managing the campaign itself. <br><br>**The lifecycle genuinely is a strict, sequential, one-way pipeline** — `collected → allocated → delivered`, no skipping a stage (delivering a still-`collected` donation directly is rejected), no reversing — a deliberate departure from the "no restrictive state machine" philosophy `aid_requests`/`incident_reports`/`missing_persons` all follow for their own status fields, but consistent with `DonationCampaign.Close()`'s own one-way-terminal-action precedent, just applied across two sequential steps instead of one. `allocate` confirms the target `aid_request_id` actually exists first (`ErrAidRequestNotFound`, 404) — reusing `aid_requests`' own domain error directly, since both aggregates live in the same `internal/relief/domain` package. The `uuid.Nil`-as-sentinel bug class was headed off proactively a 5th time: `aid_request_id` is rejected as `400` if it parses to the literal all-zero UUID, before it can reach the repository layer at all. <br><br>**`GET /donation-campaigns/{id}/donations` was added despite not being one of M13 FE-5's three named routes** — the same "necessary consequence, not scope creep" reasoning M13 FE-1's own `GET /aid-requests/{id}` extension already established: without a way to see which donations exist under a campaign, a manager would have no way to discover a donation's id to allocate/deliver in the first place. Deliberately **not** public, unlike `donation_campaigns`' own "full transparency" GETs — donor identity and individual amounts are financial data, kept private behind the same `requireManagesCampaignOrAdmin` check, while the campaign's own aggregate `raised_amount` stays publicly visible via the existing `GET /donation-campaigns/{id}`. Tested explicitly (33 cases across all four routes): the atomic `raised_amount` increment across two donors; `amount` validation (`0`, negative, omitted — reusing the domain's own `<= 0` check rather than a `binding:"required"` tag, since `0` is never a legitimate amount here unlike `lat`/`lng`); donating to a closed campaign (`400`); the full `requireManagesCampaignOrAdmin` matrix on both `GET` and `allocate`/`deliver` — non-manager citizen `403`, campaign-owning citizen success, admin-override success, same-NGO `ngo_volunteer` `403`, NGO admin success on their own NGO-organized campaign; the sequential-pipeline guard — double-allocate `400`, double-deliver `400`, delivering a never-allocated donation directly `400`; missing/all-zero/nonexistent `aid_request_id` (`400`/`400`/`404`); malformed and not-found ids (`400`/`404`) across every route. |
| **M13 FE-6** (interactive map of missing persons/movement — no new storage) | *reuses* `GET /api/v1/missing-persons` + `.../sightings` | **Confirmed complete, no new code needed** — both routes were built as part of M13 FE-3 and were deliberately made public/no-auth *because* this FE existed (see M13 FE-3's own notes: "missing_persons DOES have a public map FE... both GETs are public, no auth"). Nothing else to build here — an interactive map is a client-side rendering concern (plotting `last_seen_location` and each sighting's own `location` on a map, animating movement over `sighted_at` timestamps), not a new backend capability, same treatment M10 FE-5/M15 FE-4/M16 FE-7 already got when a listed FE turned out to be fully served by routes built for a different FE. |
| **M15 FE-8** (admin monitors missing persons/donations/aid/resource distribution) | `GET /api/v1/admin/missing-persons?status=`<br>`GET /api/v1/admin/donation-campaigns?status=`<br>`GET /api/v1/admin/aid-requests?status=` | Three genuinely new, unscoped, admin-only list routes — not a role-based bypass on any of the existing public/role-scoped `GET`s, same "separate dedicated admin route, not a branch inside the citizen-facing one" precedent Flood Intelligence's `GET /admin/hazard-zones` and Community Intelligence's `GET /admin/incident-reports` already established. `internal/relief` gets its first `/admin` route group (`module.go`'s `rg.Group("/admin")` + `RequireAuth`/`RequireRole("admin","super_admin")`), mirroring those two modules' exact composition — **zero role logic lives in any of the three handlers**, it's entirely delegated to the middleware chain. <br><br>Each route required a genuinely new repository method (`ListAll`), not a reuse of an existing list method, since the three that already existed are all scoped in ways an admin overview shouldn't be: `AidRequestRepository.ListForRequester` (owner-only), `DonationCampaignRepository.ListForRegion` (requires a `region_id`, does a nationwide-inclusion `OR region_id IS NULL`), `MissingPersonRepository.ListForRegion` (requires a `region_id`, does a live `ST_Intersects` spatial join) — none of those shapes fit "every row, any region, admin only." Implemented with the single-query nullable-filter SQL pattern Flood Intelligence's own `ListForAdmin` already established (`WHERE ($1::text IS NULL OR status = $1::<enum_type>)`, an explicit cast since each status column is a real Postgres enum, not plain text) rather than Community's two-separate-query-strings-behind-an-if/else alternative — the simpler pattern was the right fit here since none of these three routes also need a `sort` parameter interpolated into `ORDER BY` the way Community's admin incident-report list does. `status` is optional and, when supplied, validated against each aggregate's own real enum at the HTTP layer (`400` on an invalid value) — the app-layer use cases are pure one-line passthroughs, doing zero validation of their own, same "validation happens before the service call, not inside it" convention those two precedent routes already established. All three reuse their existing `toXResponseList` DTOs — no new response shapes needed. Tested explicitly (18 cases across all three routes): no-auth `401` and citizen-role `403` on each (confirming `RequireRole` blocks before any handler code runs); unscoped admin access returning every row regardless of status; `status`-filtered access correctly isolating just that status (`aid_requests` tested against `pending`/`cancelled`, `donation_campaigns` against `active`/`closed`, `missing_persons` against `missing`/`found`); an invalid `status` value rejected with `400` and the real enum's values listed, on all three routes. |
| **M16 FE-2** (aid/missing-person half — region-scoped NGO tracking) | `GET /api/v1/ngo/aid-requests?region_id=`<br>`GET /api/v1/ngo/missing-persons?region_id=` | Incident half is Community Intelligence's. |
| **M16 FE-8** (NGO manages donation campaigns/resource allocation in-region) | *reuses* `donation-campaigns`/`aid-requests` routes, NGO-scoped | |
| **M16 FE-11** (collect/analyze community feedback on aid quality) | `POST /api/v1/feedback`<br>`GET /api/v1/ngo/feedback?aid_request_id=`<br>`GET /api/v1/ngo/feedback?donation_campaign_id=` | |

---

# Phase 10 — Alerting (`internal/alerting`)

### `000012_create_alerting`
```sql
CREATE TYPE alert_source AS ENUM ('ai_prediction', 'community_report', 'manual_admin', 'manual_ngo', 'missing_person_update');
CREATE TYPE alert_response_type AS ENUM ('safe', 'need_help');

CREATE TABLE alerts (
    id                               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    source                           alert_source    NOT NULL,
    severity                         alert_severity  NOT NULL,  -- reuses Phase 5's enum
    title                            TEXT            NOT NULL,
    message                          TEXT            NOT NULL,
    hazard_zone_id                   UUID            REFERENCES hazard_zones(id),
    region_id                        UUID            REFERENCES regions(id),
    created_by                       UUID            REFERENCES accounts(id),
    created_at                       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    missing_person_id                UUID            REFERENCES missing_persons(id),
    triggering_incident_report_id    UUID            REFERENCES incident_reports(id)
);

CREATE TABLE alert_deliveries (
    id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id          UUID                    NOT NULL REFERENCES alerts(id),
    account_id        UUID                    NOT NULL REFERENCES accounts(id),
    channel           notification_channel    NOT NULL,  -- reuses Phase 5's enum
    delivered_at      TIMESTAMPTZ             NOT NULL DEFAULT now(),
    acknowledged_at   TIMESTAMPTZ,
    response          alert_response_type,
    response_at       TIMESTAMPTZ
);
```

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M9 FE-1** (fuse AI + community signals into unified alert) | `POST /api/v1/admin/alerts` | Also the target of the internal calls from Flood Intelligence/Community Intelligence noted in Phases 3 and 7. |
| **M9 FE-2** (classify/prioritize General Advisory → Critical) | *no separate route* | `severity` field on the same resource. |
| **M9 FE-3** (forward to safety groups; track acknowledgement per member) | `GET /api/v1/alerts/{id}/deliveries`<br>`PATCH /api/v1/alert-deliveries/{id}/acknowledge` | Fan-out to `safety_connections` on creation is internal, not a separate call. |
| **M9 FE-4** (comprehensive dispatched-alerts log) | `GET /api/v1/admin/alerts?from=&to=&severity=&source=` | |
| **M9 FE-5** (NGO/admin manual override broadcast) | `POST /api/v1/admin/alerts/broadcast`<br>`POST /api/v1/ngo/alerts/broadcast` | |
| **M9 FE-6** (actionable alert screen: safe routes, shelters, contacts, resources) | `GET /api/v1/alerts/{id}/actions` | Read-composition of Facilities (shelters) + `internal/navigation` (Phase "No Single Owner") + Trust (safety connections) — not new data owned here. |
| **M9 FE-7** ("I'm Safe"/"I Need Help" quick action) | `PATCH /api/v1/alert-deliveries/{id}/respond` | |
| **M1 FE-5** (emergency-active gating, referenced from Trust's live-GPS route) | `GET /api/v1/regions/{id}/active-alert-status` | Trust's `WS /ws/safety-connections/location` (Phase 6) checks this before relaying GPS. |
| **M11 FE-6** (in-app notification for new hazards on active route) | *reuses* the dispatch pipeline above, triggered from Flood Intelligence | No new route. |
| **M13 FE-7** (auto-notify on missing-person sightings/updates) | *no public route* | Internal call from `internal/relief` — `alerting.NotifyFromMissingPersonUpdate(...)`. |
| **M15 FE-7** (admin broadcasts verified alerts system-wide) | *reuses* `POST /api/v1/admin/alerts/broadcast` | |
| **M15 FE-11** (alert monitoring console across AI/NGO/authority/admin sources) | *reuses* `GET /api/v1/admin/alerts` | |
| **M16 FE-7** (alert half — NGO sends targeted alerts) | *reuses* `POST /api/v1/ngo/alerts/broadcast` | Community-channel half is `community_updates`, Phase 7. |

---

# Phase 11 — Relief Operations, follow-up: task assignments

### `000013_add_task_assignments`
```sql
CREATE TYPE task_type AS ENUM ('incident_verification', 'aid_delivery', 'rescue', 'missing_person_search', 'other');
CREATE TYPE task_assignment_status AS ENUM ('assigned', 'accepted', 'in_progress', 'completed', 'cancelled');

CREATE TABLE task_assignments (
    id                        UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type                 task_type                NOT NULL,
    incident_report_id        UUID                     REFERENCES incident_reports(id),
    aid_request_id            UUID                     REFERENCES aid_requests(id),
    missing_person_id         UUID                     REFERENCES missing_persons(id),
    assigned_to_account_id    UUID                     REFERENCES accounts(id),
    assigned_to_ngo_id        UUID                     REFERENCES ngos(id),
    assigned_by               UUID                     NOT NULL REFERENCES accounts(id),
    status                    task_assignment_status   NOT NULL DEFAULT 'assigned',
    assigned_at               TIMESTAMPTZ              NOT NULL DEFAULT now(),
    completed_at              TIMESTAMPTZ,
    CHECK (num_nonnulls(incident_report_id, aid_request_id, missing_person_id) = 1),
    CHECK (num_nonnulls(assigned_to_account_id, assigned_to_ngo_id) >= 1)
);

ALTER TABLE field_observations
    ADD CONSTRAINT fk_field_observations_task_assignment
    FOREIGN KEY (task_assignment_id) REFERENCES task_assignments(id);
```

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M1 FE-9** (assignment half) | `POST /api/v1/task-assignments`<br>`PATCH /api/v1/task-assignments/{id}/status`<br>`GET /api/v1/task-assignments?assigned_to_ngo_id=` | |
| **M15 FE-6** (admin assigns verified incidents to NGOs/volunteers/rescue teams) | *reuses* `POST /api/v1/task-assignments` (admin scope, `incident_report_id` set) | |
| **M15 FE-13** (auto-escalate critical/high-risk incidents on severity thresholds) | *no new route here* | This creates an `escalations` row (Phase 13), not a `task_assignments` one — listed under Relief Ops per Part 2, executed as an internal trigger from Community Intelligence/Flood Intelligence severity checks. |
| **M16 FE-5** (NGO assigns rescue/aid/verification tasks to volunteers) | *reuses* `POST /api/v1/task-assignments` (NGO scope) | |
| **M16 FE-6** (NGO monitors volunteer activity, task progress, performance) | `GET /api/v1/ngo/task-assignments`<br>`GET /api/v1/ngo/field-observations` | |
| **M16 FE-10** (volunteers record field observations: geotagged images, notes, status) | `POST /api/v1/field-observations`<br>`GET /api/v1/field-observations/{id}` | |

---

# Phase 12 — Communication (`internal/communication`)

### `000014_create_communication`
```sql
CREATE TYPE conversation_type AS ENUM ('direct', 'group', 'ai_chatbot');
CREATE TYPE message_sender_type AS ENUM ('user', 'ai_agent', 'ngo_staff');
CREATE TYPE call_type AS ENUM ('one_to_one', 'group');

CREATE TABLE conversations (
    id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    type                  conversation_type   NOT NULL,
    incident_report_id    UUID                REFERENCES incident_reports(id),
    aid_request_id        UUID                REFERENCES aid_requests(id),
    missing_person_id     UUID                REFERENCES missing_persons(id),
    created_by            UUID                REFERENCES accounts(id),
    created_at            TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID         NOT NULL REFERENCES conversations(id),
    account_id        UUID         NOT NULL REFERENCES accounts(id),
    joined_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, account_id)
);

CREATE TABLE messages (
    id                          UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id             UUID                   NOT NULL REFERENCES conversations(id),
    sender_account_id           UUID                   REFERENCES accounts(id),
    sender_type                 message_sender_type    NOT NULL DEFAULT 'user',
    content                     TEXT                   NOT NULL,
    shared_incident_report_id   UUID                   REFERENCES incident_reports(id),
    is_flagged                  BOOLEAN                NOT NULL DEFAULT false,
    is_urgent                   BOOLEAN                NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ            NOT NULL DEFAULT now()
);

CREATE TABLE calls (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID         REFERENCES conversations(id),
    call_type         call_type    NOT NULL,
    initiated_by      UUID         NOT NULL REFERENCES accounts(id),
    started_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ended_at          TIMESTAMPTZ
);

CREATE TABLE call_participants (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id      UUID         NOT NULL REFERENCES calls(id),
    account_id   UUID         NOT NULL REFERENCES accounts(id),
    joined_at    TIMESTAMPTZ,
    left_at      TIMESTAMPTZ
);
```

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M12 FE-1** (AI voice agents + multilingual chatbot 24/7) | `POST /api/v1/conversations` (`type: ai_chatbot`)<br>`POST /api/v1/conversations/{id}/messages`<br>`GET /api/v1/conversations/{id}/messages` | Real-time delivery of new messages to open clients is a websocket concern (`WS /ws/conversations/{id}`), not listed as a separate REST route but budget for it. |
| **M12 FE-2** (share incident reports into chat) | *reuses* `POST /api/v1/conversations/{id}/messages` with `shared_incident_report_id` set | |
| **M12 FE-3** (high-priority 1:1 and group voice calling) | `POST /api/v1/calls`<br>`PATCH /api/v1/calls/{id}/end`<br>`POST /api/v1/calls/{id}/participants`<br>`PATCH /api/v1/calls/{id}/participants/{accountID}` (leave) | Actual media transport is WebRTC/SFU — these routes are signaling/bookkeeping only. |
| **M12 FE-4** (auto-flag urgent messages, route through escalation) | *no new route* | `is_flagged`/`is_urgent` set server-side on message creation; routing to escalation calls `internal/relief`'s escalation creation (Phase 13). |
| **M13 FE-4** (direct comms for aid/missing-person coordination) | `POST /api/v1/conversations` (`aid_request_id` or `missing_person_id` set)<br>`POST /api/v1/conversations/{id}/participants` | |
| **M16 FE-12** (chat half — NGO coordinates with admins/other NGOs) | *reuses* `POST /api/v1/conversations` (`type: group`) | Escalation half is Relief Operations', Phase 13. |

---

# Phase 13 — Relief Operations, follow-up: escalations

### `000015_add_escalations`
```sql
CREATE TYPE escalation_status AS ENUM ('open', 'resolved');

CREATE TABLE escalations (
    id                        UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    hazard_zone_id            UUID                 REFERENCES hazard_zones(id),
    incident_report_id        UUID                 REFERENCES incident_reports(id),
    escalated_by              UUID                 REFERENCES accounts(id),
    escalated_to_ngo_id       UUID                 REFERENCES ngos(id),
    escalated_to_account_id   UUID                 REFERENCES accounts(id),
    reason                    TEXT                 NOT NULL,
    status                    escalation_status    NOT NULL DEFAULT 'open',
    created_at                TIMESTAMPTZ          NOT NULL DEFAULT now(),
    resolved_at               TIMESTAMPTZ,
    message_id                UUID                 REFERENCES messages(id)
);
```

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M12 FE-4** (escalation half) | `POST /api/v1/escalations`<br>`PATCH /api/v1/escalations/{id}/resolve` | |
| **M15 FE-13** (auto-escalate on severity thresholds) | *reuses* `POST /api/v1/escalations`, called internally, not user-initiated | |
| **M16 FE-12** (escalation half — NGO-initiated joint response) | *reuses* `POST /api/v1/escalations` / `PATCH .../resolve` (NGO-scoped) | |

---

# Phase 14 — Reporting & Audit (`internal/reporting`)

### `000016_create_reporting_and_audit`
```sql
CREATE TYPE report_type AS ENUM ('planning', 'resource_allocation', 'post_event_assessment');

CREATE TABLE generated_reports (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type    report_type   NOT NULL,
    generated_by   UUID          REFERENCES accounts(id),
    ngo_id         UUID          REFERENCES ngos(id),
    region_id      UUID          REFERENCES regions(id),
    file_url       TEXT          NOT NULL,
    generated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_account_id   UUID         REFERENCES accounts(id),
    action             TEXT         NOT NULL,
    target_table       TEXT         NOT NULL,
    target_id          UUID,
    metadata           JSONB,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

**Structural note (unchanged from the earlier version of this doc):** don't build this as a full
`domain/app/infra/http` module — `audit_log` is a write-only sink every other context calls into
(`audit.Record(ctx, actorID, action, targetTable, targetID, metadata)`), best as a thin shared
`internal/platform/audit` package. `generated_reports` is the one piece with a real use case.

### Routes

| FE | Route(s) | Notes |
|---|---|---|
| **M15 FE-9** (operational analytics: volunteer activity, NGO performance, hazard trends, response efficiency — no dedicated table) | `GET /api/v1/admin/analytics/overview` | Live aggregation over `task_assignments`/`field_observations` (Relief Ops) + others — no owned table, this is a read-composition endpoint. |
| **M15 FE-10** (generate analytical reports for planning/resource allocation/post-event assessment) | `POST /api/v1/admin/reports`<br>`GET /api/v1/admin/reports`<br>`GET /api/v1/admin/reports/{id}` | Generation is an async background job; the POST kicks it off. |
| **M15 FE-12** (complete audit trails: verifications, assignments, notifications, status changes) | `GET /api/v1/admin/audit-log?actor_account_id=&target_table=&from=&to=` | Writes come from every other domain's internal `audit.Record(...)` call, never a public POST. |
| **M16 FE-13** (regional/NGO transparency reports) | `POST /api/v1/ngo/reports`<br>`GET /api/v1/ngo/reports`<br>`GET /api/v1/ngo/reports/{id}` | |

---

# No Single Owner — cross-context reads & live compute

Per the source document's own Part 2, these FEs have no table and no single domain to own them.
Listed here explicitly, each with a concrete route, so none of them get silently dropped just
because they don't fit the phase-by-phase table above.

| FE | Route(s) | Where it lives |
|---|---|---|
| **M1 FE-4** (chronological activity timeline: incident reports, aid requests, donations, verification contributions, interactions) | `GET /api/v1/profile/activity-timeline` | Lives in `internal/profiling` (it's "my activity") but queries `incident_reports`, `incident_report_votes`, `aid_requests`, `donations`, `messages` directly by account ID and merges by timestamp — a read composition, not a write path. |
| **M11 FE-1** (optimized routes to shelters/safe zones with hazard severity scoring per segment) | `POST /api/v1/navigation/route` `{origin, destination_shelter_id}` | New `internal/navigation` package — reads `shelters` (Facilities) + `hazard_zones` (Flood Intelligence), computes live, persists nothing. |
| **M11 FE-2** (real-time alternative rerouting on new hazard updates) | *reuses* `POST /api/v1/navigation/route`, re-called on new hazard data; or `WS /ws/navigation/{routeID}` for push-based rerouting | Same package. |
| **M11 FE-4** (ETA/distance to nearest safety point, factoring blockages/hazards) | `GET /api/v1/navigation/nearest-shelter?lat=&lng=` | Same package. |
| **M11 FE-7** (color-coded green/yellow/red overlays — pure rendering) | *no route* | Client-side coloring of `hazard_zones.risk_level`, already returned by Flood Intelligence. |
| **M16 FE-14** (integrate verified incidents, shelters, response activities with regional hazard maps — no new storage) | `GET /api/v1/ngo/regional-overview?region_id=` | Read composition of Community Intelligence + Facilities + Relief Operations, scoped to the NGO's `ngo_regions` — lives wherever the NGO dashboard's aggregating handlers live (`internal/relief` is the most natural home given it already aggregates the most of these). |

---

# Explicitly out of scope / deferred (so nothing looks missed)

- **Modules 2–6** (Data Gathering, Preprocessing, Model Input Consumption, Spatial Feature
  Modelling, Spatio-Temporal Flood Modeling): zero routes in this Go monolith — separate
  Python/PyTorch service. The only touchpoint is Flood Intelligence's ingestion endpoint (Phase 3)
  and Community Intelligence's AI-classification endpoint (Phase 7).
- **Module 14** (Agentic Flood Response Orchestrator): entirely deferred per your own instruction
  in the source document. Its 7 FEs, if resolved later, mostly reuse routes already listed above
  rather than needing new ones — FE-1 reads Flood Intelligence/Community Intelligence/Facilities
  endpoints, FE-2/FE-5 write to Alerting, FE-3 calls `internal/navigation`, FE-4 reuses
  Communication's chatbot, FE-6 writes to Relief Operations' escalations, FE-7 writes to Relief
  Operations' aid requests (would need a priority field added, per the source doc's own note).

---

## How to actually use this document

- Work top to bottom. Each phase assumes every migration and route above it already exists.
- Every phase gets the same internal shape as `internal/identity`: `domain/`, `app/`,
  `infra/postgres` (+ others only where needed), `http/`, and a `module.go` composition root.
- Two integration-contract decisions are called out inline (Phase 3, Phase 7) — resolve both
  before writing the Go code for those phases.
- Add PostGIS to `docker-compose.yml` before Phase 1.
- When a table in the "Notes" column says "reuses" a route from another phase, that's deliberate —
  don't build a second endpoint for the same FE just because two modules in the source FYP
  document both mention it.
