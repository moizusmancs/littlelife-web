# LittleLife Web — Frontend Implementation Plan

**Status:** living document. Update the status column in each phase's route table as the Go
backend ships more of `IMPLEMENTATION_ROADMAP.md`; nothing else about a phase should need to
change when that happens — that's the entire point of the service-layer split in Phase 0.

## 0. Purpose & how to use this document

This is the build order for the React/Vite web frontend: which screen gets built when, which
backend route it talks to, whether that route exists yet, and what "done" means for each phase.
It does not repeat the full UI spec — that already exists and is authoritative:

- **Screen-by-screen button/API specs, full route tree, nav shells, component library additions,
  link-integrity audit:** `supporting-material/UI mockups needed/uploads/WEB_DESIGN_PLAN.md`
- **Visual design tokens (color/type/spacing/radius/elevation), component states:**
  `supporting-material/UI mockups needed/uploads/mobile_plan-*.md` §1–2 (web reuses these in full,
  see §3.2 below for the one deliberate tonal difference)
- **Backend build log, schema, why-this-order rationale:** `supporting-material/IMPLEMENTATION_ROADMAP.md`
- **Backend consumption reference (exact request/response bodies, error shapes):**
  `supporting-material/api/*.md`
- **Corrected flood-visualization reference (real model output, not the design mockup's guess):**
  `supporting-material/map-preview/` — see §3.3

This document's job is purely sequencing: *given* all of the above, in what order do we build
screens, wire them to real (or mocked) APIs, and test them, so that frontend progress tracks
backend progress instead of stalling on it.

---

## 1. Backend readiness snapshot

Cross-checked directly against `supporting-material/api/README.md` and the phase headers in
`IMPLEMENTATION_ROADMAP.md`. This table is the single source of truth for "is it safe to wire this
for real yet" — consult it before starting any phase below.

| Backend phase | Domain | Status | API doc |
|---|---|---|---|
| 0 | Identity (auth, NGO lifecycle, admin accounts) | ✅ Built | `api/00-identity.md` |
| 1 | Geo (regions, NGO operational coverage) | ✅ Built | `api/01-geo.md` |
| 2 | Identity NGO support | ✅ Built (folded into Phase 0) | `api/00-identity.md` |
| 3 | Flood Intelligence (predictions, hazard zones) | ✅ Built | `api/03-flood-intelligence.md` |
| 4 | Facilities (shelters, infrastructure, essential locations, offline maps) | ✅ Built | `api/04-facilities.md` |
| 5 | Profiling (profile, alert preferences) | ✅ Built | `api/05-profiling.md` |
| 6 | Trust (safety connections + live GPS WS, trust score, moderation) | ✅ Built | `api/06-trust.md` |
| 7 | Community Intelligence (incidents, votes, AI classification, updates) | ✅ Built | `api/07-community-intelligence.md` |
| 8 | Trust follow-up: `credibility_events` | ❌ Not built | — |
| 9 | Relief Operations core (aid requests, donations, missing persons) | ✅ Built | `api/09-relief-operations.md` |
| — | Field observations, community feedback (M16 FE-10/11) | ❌ Not built — no route in `09-relief-operations.md` despite the table existing in the Phase 9 migration | — |
| 10 | Alerting (fusion, dispatch, broadcast, I'm Safe/Need Help) | ❌ Not built | — |
| 11 | Relief Ops follow-up: task assignments | ❌ Not built | — |
| — | Navigation (`internal/navigation` — route compute, rerouting, nearest shelter) | ❌ Not built | — |
| 12 | Communication (chatbot, messages, calls) | ❌ Not built | — |
| 13 | Relief Ops follow-up: escalations | ❌ Not built | — |
| 14 | Reporting & Audit | ❌ Not built | — |

**8 of 14 substantive domains are built.** This plan sequences frontend work to finish everything
built first (Phases 1–6 below), builds the remaining screens against mocks in one dedicated pass
(Phase 7), then layers dashboards, real-time, and polish on top (Phases 8–10). As backend Phases
8/10/11/12/13/14 ship, only Phase 7's service-layer functions need to change — the screens don't.

---

## 2. Foundational decisions made in this plan

### 2.1 Map library: **Leaflet**, not Mapbox GL

The web design mockups label their map placeholders "mapbox gl." But
`supporting-material/map-preview/` is a *working, already-validated* Leaflet + `react-leaflet`
implementation that correctly renders the real ML model's actual output shape (see §2.3) — and
it's free/keyless, unlike Mapbox which needs an account and an access token. Going with what's
already proven correct over what a design mockup's placeholder text assumed. If this needs to be
revisited later (e.g. for vector-tile styling polish), it's a swap behind the map component's own
interface, not a rewrite of any screen that uses it.

### 2.2 Tech stack (superseding/confirming earlier discussion)

| Concern | Choice |
|---|---|
| Styling | Tailwind CSS, tokens sourced from the verified design system (§2.4) |
| Components | shadcn/ui (Radix + Tailwind), restyled to the real tokens |
| Icons | **`@phosphor-icons/react`** — the actual design system's icon set (not lucide-react — that was only ever a default for the unused "Modernist" `_ds/` folder, which nothing in the real mockups references) |
| Routing | React Router v7, route tree per `WEB_DESIGN_PLAN.md` §2 |
| Server state | TanStack Query |
| Client state | Zustand (auth/session, theme, locale) |
| Forms | React Hook Form + Zod |
| Maps | Leaflet + `react-leaflet` (+ `leaflet.heat` if a smoothed heatmap layer is wanted alongside the raw probability grid) |
| i18n | `react-i18next`, locales `en` + `ur`, RTL via `dir` attribute + logical Tailwind properties |
| HTTP | Axios, `withCredentials: true`, interceptor-based 401 refresh-and-retry |
| Real-time | Native `WebSocket` in a small reconnecting hook (backend speaks raw WS, not socket.io) |
| Charts | Recharts |
| API mocking (for unbuilt backend) | MSW (Mock Service Worker) |
| Testing | Vitest + React Testing Library (unit/component), Playwright (E2E) |

### 2.3 Flood visualization — corrected spec (supersedes the design mockup's rendering)

Per your correction: the design mockups' "hazard zone" concept (irregular soft polygon blob, 35%
fill, 2px border) does not match what the flood model actually produces. The real, validated shape
— confirmed directly from `supporting-material/map-preview/manifest.json` +
`src/App.jsx` — is a **grid of large rectangular patches** (~0.57° per side, ~64km boxes),
each carrying a continuous flood probability, not a hand-drawn hazard shape.

**Build the real Map's flood layer against this spec, not the mockup's:**

- Render each `hazard_zones` feature as its actual returned polygon geometry (the backend's
  `GET /map/flood-overlay?bbox=` and `GET /flood-predictions?region_id=` already return real
  GeoJSON via `ST_AsGeoJSON` — for AI-ingested zones this *is* a rectangular tile boundary, so
  rendering the literal geometry naturally reproduces the grid-box look; manually-declared
  admin/NGO zones may be non-rectangular, and the same renderer must handle that too — so use a
  generic `<GeoJSON>` polygon renderer, not a hardcoded `<Rectangle>`).
- **Color by continuous probability, not a 3-bucket enum.** The backend's `risk_level` enum
  (low/medium/high) is a coarse threshold of `confidence_score`; for the map's visual fill, prefer
  the same green→yellow→red continuous gradient `map-preview/src/App.jsx` already uses and has
  visually validated:
  ```
  0.0  → #f7fcf5 (white/green)
  0.33 → #41ab5d
  0.66 → #ffff33
  1.0  → #e31a1c
  ```
- **Color by `mean_prob`-equivalent, not peak/near-binary confidence, when both are available.**
  The real model's `peak_prob` is near-binary (one hot pixel paints the whole ~64km box solid
  red) — `mean_prob` (fraction of the box actually flooded) is the honest value to drive fill
  color/opacity. The backend's `hazardZoneDetailResponse`/`mapOverlayEntryResponse` carry
  `confidence_score` from `flood_predictions` — confirm at integration time whether that maps to
  peak or mean semantics on the Go side (check `internal/floodintel/domain` before assuming), and
  prefer whichever is closer to `mean_prob`'s meaning.
  - **Test with real backend-shaped data before assuming any of this transfers 1:1** — the backend
    computes `risk_level` server-side from `confidence_score` via fixed thresholds (<0.34 low,
    0.34–0.67 medium, ≥0.67 high per the roadmap), which is a different number than either
    `peak_prob` or `mean_prob` in the raw manifest. Don't assume the Go API's `confidence_score`
    is numerically identical to the raw manifest's `mean_prob` just because both are "a probability
    0–1" — verify against a real ingested prediction once Phase 3 starts, and adjust the color
    mapping if they diverge.
- **A min-probability filter slider** (as `map-preview` has) is a good citizen-map affordance
  worth carrying over — most patches have ~0 flood signal (6,783 of 19,964 in the real manifest),
  so an unfiltered render is visual noise.
- Model performance context worth keeping in view while designing confidence UI: precision 0.58,
  recall 0.84, F1/Dice 0.69 (from `map-preview/metrics.json`) — this is a real, imperfect model.
  Avoid UI language that overstates certainty (e.g. prefer "elevated flood risk" framing with a
  visible confidence number over an unqualified "flood here").

This spec applies to **Citizen Map, Admin Hazard Zones & Predictions, and NGO Dashboard's
region-scoped hazard map** — all three render the same underlying data, all three get this
corrected treatment, not just one.

### 2.4 Design tokens to encode in `tailwind.config` during Phase 0

Verified directly from the design system audit (not re-derived here — full palette/type/spacing
already extracted in conversation; re-pull exact hex/scale values from
`supporting-material/UI mockups needed/uploads/mobile_plan-*.md` §1 when writing the config, don't
hand-type from memory). Key points to get right:

- Citizen Web stays brand-forward (rose/peach gradients). **NGO Web and Admin Web are
  neutral-dominant** — `primary.500` reserved for exactly three things there: active sidebar item,
  primary action buttons, the logomark. Don't let dashboard screens default to brand-heavy styling.
- Badges/chips are **full-pill radius**, not the `radius.sm=8` the token doc states — every real
  screen uses `999px`, the doc entry is a documentation bug, build the pill.
- Dark-mode tinted chip/badge *text* colors aren't in the written token table (solid buttons are
  unchanged in dark mode, tinted text isn't) — define these explicitly when Phase 9 (polish) is
  reached, don't guess earlier.
- No RTL or dark-mode screens exist in the *web* mockup package at all (unlike mobile, which had
  partial coverage). Phase 9 extrapolates from mobile's token rules, not a web pixel reference.

---

## 3. Global architecture — built once in Phase 0, used by every later phase

- **Service layer** (`src/api/`): one file per bounded context, typed functions wrapping Axios,
  mirroring the api docs 1:1 — `identity.ts`, `geo.ts`, `floodIntel.ts`, `facilities.ts`,
  `profiling.ts`, `trust.ts`, `community.ts`, `relief.ts`, plus later `alerting.ts`,
  `navigation.ts`, `communication.ts`, `taskAssignments.ts`, `escalations.ts`, `reporting.ts` for
  the not-yet-built domains (Phase 7). Every screen calls through this layer, never Axios directly
  — this is what makes swapping a mock for a real backend call a one-file change.
- **Auth store** (Zustand): in-memory access token + decoded role claim, `setAuth`/`clearAuth`.
  Never persisted to `localStorage` (XSS surface) — a page refresh re-derives it via
  `POST /auth/refresh` (cookie-based for web, per the API's `X-Client` convention — web sends no
  `X-Client` header, so the refresh token stays an httpOnly cookie, never touched by JS).
- **Axios instance**: `withCredentials: true`; request interceptor attaches
  `Authorization: Bearer <token>`; response interceptor catches a `401`, calls `/auth/refresh`
  once, retries the original request, and hard-redirects to `/login` on refresh failure.
- **Route guards**: role read from the JWT claim in the auth store; `/app/*` requires `user`,
  `/ngo/*` requires `ngo_admin`/`ngo_volunteer`, `/admin/*` requires `admin`/`super_admin`. Login
  always resolves to exactly one landing route per `WEB_DESIGN_PLAN.md` §0 — no in-app role switch.
- **Two nav shells**: Citizen top-nav (per `WEB_DESIGN_PLAN.md` §4.1) and the shared NGO/Admin
  sidebar (§4.2) — build `Ops Sidebar.dc.html` almost directly, it's a real parameterized
  (`role: 'admin'|'ngo'`) reference implementation of exactly this component, not just a mockup.
- **MSW setup**: `src/mocks/handlers/*.ts` per not-yet-built domain, `src/mocks/browser.ts` (dev)
  and `src/mocks/server.ts` (tests). Handlers shaped to match the *documented* eventual contract in
  `WEB_DESIGN_PLAN.md` §6's "On click →" column, so swapping to real is a contract-compatible change.
- **i18n scaffold**: `en`/`ur` namespaces, `dir` + font-family (`Inter`/`Manrope` ↔ `Noto Sans
  Arabic`) driven off locale.
- **Testing scaffold**: Vitest + RTL config, Playwright config pointed at the local dev server (and
  the local Go backend via docker-compose, where the phase under test has a real backend).

---

## 4. Why this phase order

Backend-domain-first, not role-first. A phase finishes **every role's screens for one backend
domain** (e.g. Phase 1 covers Identity screens across Citizen, NGO, *and* Admin) rather than
finishing all of Citizen before starting NGO. This means:

- Every phase ends with something fully real end-to-end (no screen ships half-mocked within a
  phase's own scope).
- Dashboards (Citizen Home, NGO Dashboard, Admin Dashboard) are built **last** among their
  role-group, since they're read-composition aggregates over everything else — building them first
  would mean stubbing most of their own content.
- The not-yet-built backend domains are batched into one dedicated phase (7) instead of scattered
  — so the mocking strategy (and later, the swap to real) happens once, deliberately, not
  piecemeal.

---

## Phase 0 — Foundation & Architecture

**Screens:** none.

**Build:**
1. Install the stack (§2.2).
2. `tailwind.config` with real tokens (§2.4). `shadcn init`, restyle base components to match.
3. Service layer skeleton (`src/api/`, empty typed modules for the 8 built domains).
4. Axios instance + auth interceptor + Zustand auth store.
5. React Router skeleton: `/login` etc. (public), `/app/*`, `/ngo/*`, `/admin/*` route groups with
   guards, empty placeholder pages.
6. Citizen top-nav shell + NGO/Admin sidebar shell (from `Ops Sidebar.dc.html`).
7. i18n scaffold (`en`/`ur`, RTL plumbing) — even with only placeholder strings, get the mechanism
   working now so no later screen has to retrofit it.
8. MSW scaffold (empty handler files per not-yet-built domain, wired into dev server + test setup).
9. Vitest/RTL + Playwright configs, one smoke test each (renders `/login`, hits it with Playwright).

**Testing:** the smoke tests above. No feature tests yet — nothing to test.

**Exit criteria:** `npm run dev` shows a themed, empty app shell for all three role route groups;
`npm run test` and a Playwright smoke run both pass; lint/typecheck clean.

---

## Phase 1 — Identity & Account Shell

Covers every screen backed by `internal/identity` across all three roles. This is first because
role-based routing (Phase 0) needs real login to actually exercise it, and every later phase's
screens sit behind auth.

### Screens

| Screen | Route | Role | Pattern |
|---|---|---|---|
| Login | `/login` | All | W-Auth |
| Register | `/register` | Citizen | W-Auth |
| Verify Email (OTP) | `/verify-email` | Citizen | W-Auth |
| Forgot / Reset Password | `/forgot-password`, `/reset-password` | All | W-Auth |
| Edit Profile (name portion only — full profile is Phase 3) | `/app/profile/edit` | Citizen | W-Settings |
| Account Settings (deactivate/delete) | `/app/profile/account-settings` | Citizen | W-Settings |
| My NGO **(NEW screen, per WEB_DESIGN_PLAN §9)** | `/app/profile/ngo` | Citizen | W-Settings |
| Invitations **(NEW screen, per WEB_DESIGN_PLAN §9)** | `/app/profile/invitations` | Citizen | W-Settings |
| Organization Settings | `/ngo/settings/organization` | NGO (`ngo_admin` only) | W-Settings |
| My Account | `/ngo/settings/account`, `/admin/settings/account` | NGO, Admin | W-Settings |
| Volunteers | `/ngo/volunteers` | NGO | W-List |
| Users & Accounts (+ detail) | `/admin/users`, `/admin/users/:id` | Admin | W-List / W-Detail |
| NGOs (+ detail) | `/admin/ngos`, `/admin/ngos/:id` | Admin | W-List / W-Detail |

### Backend routes (all ✅ built — `api/00-identity.md`)

| Route | Used by |
|---|---|
| `POST /auth/register` | Register |
| `POST /auth/verify-email`, `POST /auth/resend-verification` | Verify Email |
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Login, auth store bootstrap, global logout |
| `PATCH /auth/password`, `POST /auth/password/forgot`, `POST /auth/password/reset` | Account Settings, Forgot/Reset |
| `POST /auth/me/deactivate`, `POST /auth/me/delete` | Account Settings |
| `POST /ngos/register` | My NGO → Register form |
| `POST /admin/ngos/{ngoID}/approve`, `POST /admin/ngos/{ngoID}/reject` | Admin NGOs list |
| `GET /ngo/me`, `PATCH /ngo/me`, `POST /ngo/me/deactivate` | Organization Settings |
| `POST /ngo/volunteers/invitations`, `GET /ngo/volunteers`, `PATCH /ngo/volunteers/{id}/deactivate` | Volunteers (NGO side) |
| `GET /volunteer-invitations`, `PATCH /volunteer-invitations/{id}/accept`, `PATCH /volunteer-invitations/{id}/decline` | Invitations (citizen side) |
| `GET /admin/accounts?limit=&offset=`, `GET /admin/accounts/{id}`, `PATCH /admin/accounts/{id}/status` | Users & Accounts |

### Build steps
1. Login/Register/OTP/Forgot/Reset first, wired for real immediately (no mock needed, nothing to
   mock against) — this is what makes every subsequent phase testable as a logged-in user.
2. Wire the auth store + interceptor's refresh-and-retry against the real backend; write the token
   lifecycle test now (login → expire → silent refresh → still-authed) since every later phase
   depends on this working.
3. Account Settings, My NGO, Invitations (citizen).
4. Organization Settings, My Account, Volunteers (NGO).
5. Users & Accounts, NGOs (Admin).

### Testing
- Component: form validation (Zod schemas matching each route's documented required fields),
  password-rule live checklist, OTP auto-submit-on-6th-digit.
- E2E (Playwright, real backend): register → verify OTP → land on `/app/onboarding/region` (stub
  redirect target until Phase 2); login → correct role landing route for each of the 5 roles;
  logout clears session; NGO registration → admin approval → promoted account can log in as
  `ngo_admin`; volunteer invitation → citizen accepts → promoted to `ngo_volunteer`.
- Manual: 401-refresh-retry against a real expired token; deactivate/delete flows (destructive,
  verify confirmation dialogs actually gate the call).

**Exit criteria:** every role can register/login/manage their own account for real; NGO
approval and volunteer promotion flows work end-to-end against the real backend.

---

## Phase 2 — Geo Primitives

Small phase, but everything downstream that picks a region depends on it.

### Screens

| Screen | Route | Role |
|---|---|---|
| Onboarding — Region Picker | `/app/onboarding/region` | Citizen |
| Regions (+ detail) | `/admin/regions`, `/admin/regions/:id` | Admin |

Also: build the **region picker as a shared component** here (province → district → tehsil
drill-down) — it's reused by NGO operational-region assignment (Phase 1's Organization Settings,
retrofit once this exists) and any future region-scoped filter.

### Backend routes (✅ built — `api/01-geo.md`)

| Route | Used by |
|---|---|
| `GET /regions?level=&parent_region_id=`, `GET /regions/{id}` | Region picker (public, no auth) |
| `POST /admin/regions`, `PATCH /admin/regions/{id}` | Admin Regions |
| `GET /ngo/me/regions`, `POST /ngo/me/regions`, `DELETE /ngo/me/regions/{regionID}` | Organization Settings' region chips (retrofit into Phase 1's screen) |

### Testing
- Component: drill-down list behavior, "Continue" disabled until a selection is made.
- E2E: onboarding picks a region → home region persists on next login; admin edits a region
  boundary; NGO adds/removes an operational region.

**Exit criteria:** region selection works everywhere it's needed as a reusable component, backed
by real data (note: real Pakistan boundaries depend on the HDX import script the backend roadmap
flags as not-yet-done — if that hasn't happened yet, regions will still work functionally but with
placeholder/hand-drawn boundaries; not a frontend blocker, just don't be surprised by odd shapes).

---

## Phase 3 — Facilities, Flood Intelligence & the Map

The first big visual phase. Establishes the shared `<MapView>` component every later map-using
screen reuses. **Read §2.1 and §2.3 above before starting this phase** — map library and flood
rendering are both corrected from what the design mockups show.

### Screens

| Screen | Route | Role | Pattern |
|---|---|---|---|
| Map | `/app/map` | Citizen | W-Map-Split |
| Shelter Detail | `/app/map/shelters/:id` | Citizen | W-Detail |
| Resources hub — Local Resources tab | `/app/resources` (`?tab=local`) | Citizen | W-List |
| Shelters (+ detail) | `/ngo/shelters`, `/ngo/shelters/:id` | NGO | W-List / W-Detail |
| Hazard Zones & Predictions (+ detail) | `/admin/hazard-zones`, `/admin/hazard-zones/:id` | Admin | W-Map-Split |
| Facilities (tabs: Shelters/Infrastructure/Essential Locations) | `/admin/facilities` | Admin | W-List |
| Offline Map Packages | `/admin/offline-maps` | Admin | W-List |

### Backend routes (all ✅ built)

| Route | Doc | Used by |
|---|---|---|
| `GET /map/flood-overlay?bbox=` | `03-flood-intelligence.md` | Citizen Map flood layer |
| `POST /hazard-zones/risk-check` | `03-flood-intelligence.md` | Citizen Map "risk near me" |
| `GET /hazard-zones/{id}` | `03-flood-intelligence.md` | Map tooltip, Hazard Zone Detail |
| `GET /flood-predictions?region_id=` | `03-flood-intelligence.md` | Map/region prediction data |
| `GET /admin/hazard-zones?from=&to=&status=`, `GET /admin/flood-predictions?from=&to=` | `03-flood-intelligence.md` | Admin Hazard Zones & Predictions |
| `POST /admin/hazard-zones`, `PATCH /admin/hazard-zones/{id}/resolve` | `03-flood-intelligence.md` | Admin Hazard Zones (declare/resolve); NGO Dashboard "Declare Hazard Zone" (Phase 8) reuses the same call, `ngo_admin` permitted |
| `GET /infrastructure?region_id=`, `POST /admin/infrastructure`, `PATCH /admin/infrastructure/{id}/status` | `04-facilities.md` | Admin Facilities (Infrastructure tab), Map overlay |
| `GET /shelters?region_id=`, `GET /shelters/{id}` | `04-facilities.md` | Citizen Map, Shelter Detail |
| `GET /essential-locations?region_id=`, `POST /admin/essential-locations`, `POST /essential-locations/{id}/status-reports`, `POST /shelters/{id}/status-reports`, `GET /essential-locations/{id}/status-reports` | `04-facilities.md` | Resources›Local, Admin Facilities |
| `GET /regions/{id}/offline-map`, `POST /admin/offline-map-packages` | `04-facilities.md` | Offline Map Packages |
| `GET /ngo/shelters`, `POST /ngo/shelters`, `PATCH /shelters/{id}/occupancy`, `PATCH /shelters/{id}` | `04-facilities.md` | NGO Shelters |

### Build steps
1. Base `<MapView>` component: Leaflet `MapContainer`, OSM tile layer, bbox-aware data fetching on
   pan/zoom (matching `GET /map/flood-overlay?bbox=`'s contract), viewport fit/zoom-lock pattern
   borrowed directly from `map-preview/src/App.jsx` (`FitBounds`, `ZoomOutLock`, `LocateOnLoad`,
   `LocateButton` are close to drop-in).
2. Flood layer per the corrected spec (§2.3) — generic GeoJSON polygon renderer, continuous
   probability color, not the mockup's blob styling.
3. Shelter/infrastructure/essential-location marker layers, layer-toggle chips.
4. Shelter Detail, Resources›Local.
5. Admin: Hazard Zones & Predictions (reuses `<MapView>` in split-view), Facilities tabs, Offline
   Map Packages.
6. NGO Shelters (registration, occupancy editor, certification patch).

### Testing
- Component: probability→color mapping (unit test the exact color-stop function against known
  inputs), layer-toggle chip state, capacity bar gradient at boundary values (0%, 100%,
  over-capacity guard).
- E2E: pan/zoom triggers a new bbox fetch; tapping a hazard zone opens its tooltip with real
  confidence/last-updated data; NGO registers a shelter → status starts `pending`/`open`/0
  occupancy per the documented defaults → occupancy PATCH respects the `[0, capacity_total]` bound
  test the backend itself enforces; admin declares a manual hazard zone → resolves it → guarded
  against double-resolve.
- Manual: visually compare the real flood overlay against `map-preview`'s rendering of the same
  underlying data once a real prediction has been ingested — confirms the color/threshold
  translation from raw manifest to backend `confidence_score` actually holds (per the open
  question flagged in §2.3).

**Exit criteria:** the shared map component is real, correct per §2.3, and reused (not
reimplemented) by every screen above.

---

## Phase 4 — Trust

### Screens

| Screen | Route | Role | Pattern |
|---|---|---|---|
| Safety Groups (+ detail) | `/app/safety-groups`, `/app/safety-groups/:id` | Citizen | W-List / W-Detail |
| Credibility | `/app/profile/credibility` | Citizen | W-Settings |
| Alert Preferences | `/app/profile/alert-preferences` | Citizen | W-Settings |
| Personal profile (remaining fields) | `/app/profile/edit` | Citizen | W-Settings |
| Activity Timeline | `/app/profile/activity` | Citizen | W-Settings |

Trust score/credibility also appears **embedded** (read-only) inside NGO Incidents and Admin
Account Detail — build those embeds here too, even though the parent screens ship in later phases,
since the embed is a small reusable `<CredibilityBadge>`/`<TrustScorePanel>` component.

### Backend routes (all ✅ built)

| Route | Doc | Used by |
|---|---|---|
| `POST /safety-connections`, `GET /safety-connections`, `PATCH .../accept`, `PATCH .../decline`, `DELETE /safety-connections/{id}` | `06-trust.md` | Safety Groups |
| `WS /ws/safety-connections/location` | `06-trust.md` | Safety Group Detail's live-location toggle — first real-time feature, see build note below |
| `GET /trust-score` | `06-trust.md` | Credibility |
| `GET /accounts/{id}/trust-score` | `06-trust.md` | NGO/Admin embedded credibility badge |
| `POST /admin/accounts/{id}/moderation-actions`, `GET /admin/accounts/{id}/moderation-actions` | `06-trust.md` | Admin Account Detail (ships Phase 1, retrofit this panel in) |
| `GET /profile`, `PATCH /profile` | `05-profiling.md` | Edit Profile |
| `GET /profile/alert-preferences`, `PATCH /profile/alert-preferences` | `05-profiling.md` | Alert Preferences (auto-saves on change, no Save button, per spec) |
| `GET /profile/activity-timeline` | roadmap "No Single Owner" — hosted in `internal/profiling`, reads across contexts | Activity Timeline |

### Build steps
1. Profile/Alert Preferences/Activity Timeline first — straightforward CRUD, no real-time.
2. Safety Groups CRUD (connections, accept/decline).
3. The WebSocket hook: `?token=<access_token>` query-param auth (browser WS can't set custom
   headers), reconnect-with-backoff, gated behind an active safety connection + active emergency
   per the backend's own gating rules — **note explicitly in the UI** that web location-sharing
   only works while the tab is open/foregrounded (no background-task equivalent to mobile's
   `expo-task-manager`, per `WEB_DESIGN_PLAN.md` §8) — this is a real capability gap to surface
   honestly, not paper over.
4. Credibility screen + the embeddable badge component.

### Testing
- Component: WS hook's reconnect logic (mock WebSocket, simulate drop/reconnect), alert-preference
  auto-save debounce.
- E2E: two-browser-context test (Playwright) — one account shares live location, the other's
  Safety Group Detail map updates in near-real-time; declining a connection request never receives
  location updates (matches the backend's explicit `pending`/`declined` exclusion).
- Manual: verify the WS auth gate really does reject when there's no active emergency, per the
  backend's documented pre-upgrade checks.

**Exit criteria:** the WS pattern is proven here before Phase 7 needs the same pattern for chat/nav.

---

## Phase 5 — Community Intelligence

### Screens

| Screen | Route | Role | Pattern |
|---|---|---|---|
| Community Feed | `/app/community` | Citizen | W-List |
| Incident Detail | `/app/community/:incidentId` | Citizen | W-Detail |
| Report Incident (drawer) | overlay | Citizen | W-Drawer-Form |
| Incidents (+ detail) | `/ngo/incidents`, `/ngo/incidents/:id` | NGO | W-List / W-Detail |
| Incident Reports | `/admin/incident-reports`, `/admin/incident-reports/:id` | Admin | W-List / W-Detail |

### Backend routes (all ✅ built — `api/07-community-intelligence.md`)

| Route | Used by |
|---|---|
| `POST /incident-reports` | Report Incident |
| `POST /incident-reports/{id}/media`, `GET /incident-reports/{id}/media` | Report Incident media, Incident Detail |
| `POST /incident-reports/{id}/votes`, `DELETE /incident-reports/{id}/votes` | Community Feed / Incident Detail vote controls |
| `PATCH /incident-reports/{id}/status` | Admin/NGO status lifecycle |
| `GET /incident-reports?region_id=|bbox=` | Community Feed, Citizen Map incident markers (retrofit into Phase 3's map) |
| `POST /community-updates`, `GET /community-updates?region_id=` | NGO/Admin "official update" posts — screen itself (Alerts & Community Updates) ships Phase 7/8, but the write call is available now |
| `GET /admin/incident-reports?status=&sort=`, `PATCH /admin/incident-reports/{id}/verify`, `PATCH /admin/incident-reports/{id}/reject` | Admin Incident Reports |
| `GET /ngo/incident-reports?region_id=`, `PATCH /ngo/incident-reports/{id}/verify`, `PATCH /ngo/incident-reports/{id}/status` | NGO Incidents |

Note: `POST /internal/incident-reports/{id}/ai-classification` is service-to-service (ML→backend),
not a frontend concern — shows up in incident data as already-classified, nothing to build against
it directly beyond rendering whatever classification/credibility fields the response carries.

### Build steps
1. Report Incident drawer (category grid, char-counter textarea with the documented 20-char
   minimum, media uploader max 5/10MB).
2. Community Feed + Incident Detail, including the "Official Update" card variant (4px trust-teal
   left border, no vote row) for NGO/admin-authored posts.
3. NGO Incidents (adds credibility side panel, Verify/Reject, internal notes).
4. Admin Incident Reports (adds priority-score sort, Verify/Reject with reason).
5. Retrofit incident markers into Phase 3's `<MapView>`.

### Testing
- Component: category-color chip rendering (flag the known collision — Landslide/Road Collapse
  and Missing Person/Other share hexes in the design system — decide whether to fix this now or
  accept it, don't silently ship an accessibility regression either way), description-length gate.
- E2E: submit incident with media → appears in feed → upvote persists per-account (one vote per
  account, matching the backend's `UNIQUE(incident_report_id, account_id)`) → NGO verifies within
  their region → admin can see it in the admin queue.

**Exit criteria:** the full incident lifecycle (submit → vote → NGO verify → admin oversight) works
end-to-end against the real backend.

---

## Phase 6 — Relief Operations Core

### Screens

| Screen | Route | Role | Pattern |
|---|---|---|---|
| Resources hub — Aid tab (+ detail) | `/app/resources` (`?tab=aid`), `/app/resources/aid/:id` | Citizen | W-List / W-Detail |
| Request Help (drawer) | overlay | Citizen | W-Drawer-Form |
| Resources hub — Campaigns tab (+ detail) | `/app/resources` (`?tab=campaigns`), `/app/resources/campaigns/:id` | Citizen | W-List / W-Detail |
| Donation History | inside Profile | Citizen | — |
| Resources hub — Missing Persons tab (+ detail) | `/app/resources` (`?tab=missing`), `/app/resources/missing-persons/:id` | Citizen | W-List / W-Detail |
| Report Missing Person (drawer), Report Sighting (dialog) | overlay | Citizen | W-Drawer-Form |
| Aid Requests (+ detail) | `/ngo/aid-requests`, `/ngo/aid-requests/:id` | NGO | W-List / W-Detail |
| Missing Persons (+ detail) | `/ngo/missing-persons`, `/ngo/missing-persons/:id` | NGO | W-List / W-Detail |
| Campaigns (+ detail) | `/ngo/campaigns`, `/ngo/campaigns/:id` | NGO | W-List / W-Detail |
| Relief Operations Overview | `/admin/relief-operations` (tabs) | Admin | W-List |

### Backend routes (all ✅ built — `api/09-relief-operations.md`)

| Route | Used by |
|---|---|
| `POST /aid-requests`, `GET /aid-requests/{id}`, `GET /aid-requests?mine=true`, `PATCH /aid-requests/{id}/status` | Aid tab, Request Help, Aid Request Detail |
| `POST /donation-campaigns`, `GET /donation-campaigns?region_id=`, `GET /donation-campaigns/{id}`, `PATCH /donation-campaigns/{id}`, `POST /donation-campaigns/{id}/close` | Campaigns |
| `POST /donation-campaigns/{id}/donations`, `GET /donation-campaigns/{id}/donations`, `PATCH /donations/{id}/allocate`, `PATCH /donations/{id}/deliver` | Campaign Detail's donate flow, Donation History, NGO Campaign Detail's allocate/deliver |
| `POST /missing-persons`, `GET /missing-persons?region_id=`, `PATCH /missing-persons/{id}/status`, `POST /missing-persons/{id}/sightings`, `GET /missing-persons/{id}/sightings` | Missing Persons tab, Report Missing Person, Report Sighting |
| `GET /admin/aid-requests?status=`, `GET /admin/donation-campaigns?status=`, `GET /admin/missing-persons?status=` | Relief Operations Overview (read-only, admin has no write actions here per the roadmap) |

**Confirmed NOT built** (verified directly against `api/09-relief-operations.md` — no route
exists despite the table existing in the Phase 9 migration): field observations (M16 FE-10),
community feedback (M16 FE-11). Both move to Phase 7.

### Build steps
1. Request Help drawer + Aid tab + Aid Request Detail (urgency-segmented control breaks the
   brand-color-selection rule deliberately — severity-tinted instead, per the design spec).
2. Campaigns list/detail + inline donate-expansion pattern (not a route push).
3. Missing Persons tab/detail + Report Missing Person + Report Sighting, including the
   dotted-movement-path sighting map (reuses `<MapView>` from Phase 3 in a small embedded mode).
4. NGO Aid Requests, Missing Persons, Campaigns (adds Allocate/Deliver/Close actions).
5. Admin Relief Operations Overview (read-only tabs).

### Testing
- Component: donation amount-entry inline expansion, campaign progress-bar at 0%/100%/overfunded.
- E2E: submit aid request → NGO updates status → citizen sees it reflected; create campaign →
  donate → NGO allocates donation to an aid request → marks delivered; report missing person →
  sighting submitted → status updates.

**Exit criteria:** full aid/donation/missing-person lifecycles work end-to-end for real.

---

## Phase 7 — Not-Yet-Built Backend: Alerting, Navigation, Communication, Task Assignments, Escalations, Reporting/Audit, Field Observations, Feedback

Everything backend Phases 8/10/11/12/13/14 own, plus the two confirmed-unbuilt Relief Ops FEs.
Built against MSW mocks shaped to the documented eventual contract
(`WEB_DESIGN_PLAN.md` §6's "On click →" column is the mock's target shape), behind the same
service-layer interface as every other phase — so swapping each to real later is a one-file change
per domain, not a rebuild.

### Screens

| Screen | Route | Role | Backing domain |
|---|---|---|---|
| Safe Route Navigation | `/app/navigate` | Citizen | Navigation |
| Alert Takeover | overlay, deep-link `/app/alerts/:id` | Citizen | Alerting |
| AI Chatbot | overlay panel | Citizen | Communication |
| Message Thread | `/app/messages/:conversationId` | Citizen | Communication |
| In-call / Incoming call | overlay | Citizen | Communication (see scoping note below) |
| Tasks (Board/List) | `/ngo/tasks`, `/admin/tasks` | NGO, Admin | Task assignments |
| Alerts & Community Updates — **Alerts tab only** (Community Updates tab is Phase 5's real `community-updates` route) | `/ngo/alerts`, `/admin/alerts` | NGO, Admin | Alerting |
| Coordination — Escalations tab | `/ngo/coordination`, `/admin/escalations` | NGO, Admin | Escalations |
| Coordination — Messages tab | `/ngo/coordination`, `/admin/escalations` | NGO, Admin | Communication |
| Reports (+ detail) | `/ngo/reports`, `/admin/reports` | NGO, Admin | Reporting |
| Audit Log | `/admin/audit-log` | Admin | Reporting/Audit |
| Analytics | `/admin/analytics` | Admin | Reporting |
| Field Observations | `/ngo/field-observations` | NGO | Relief Ops (unbuilt route) |
| Feedback | `/ngo/feedback` | NGO | Relief Ops (unbuilt route) |

### Target routes to mock (from `WEB_DESIGN_PLAN.md` §6 and the roadmap's own route naming —
these are the contracts to build MSW handlers against, and to verify against real routes once each
lands)

| Route (target shape) | Screen |
|---|---|
| `POST /navigation/route`, `GET /navigation/nearest-shelter?lat=&lng=` | Safe Route Navigation |
| `PATCH /alert-deliveries/{id}/respond {safe\|need_help}` | Alert Takeover |
| `POST /admin/alerts`, `POST /admin/alerts/broadcast`, `GET /alerts/{id}/deliveries` | Admin Alerts |
| `POST /ngo/alerts/broadcast` | NGO Alerts |
| `POST /conversations/{id}/messages`, `POST /conversations {type: group}` | Chatbot, Message Thread, Coordination Messages |
| `POST /task-assignments`, `PATCH /task-assignments/{id}/status` | Tasks (both roles) |
| `POST /escalations`, `PATCH /escalations/{id}/resolve` | Coordination/Escalations |
| `POST /ngo/reports`, `POST /admin/reports` | Reports (async — mock the "Generating…" pending state too, not just the final result) |
| `GET /admin/audit-log?...` | Audit Log |
| `GET /admin/analytics/overview` | Analytics |
| `POST /field-observations` | Field Observations |
| *(feedback route undocumented even as a target — design read-only from `WEB_DESIGN_PLAN.md` §6.3, confirm shape once backend defines it)* | Feedback |

### Build steps
1. Set up MSW handlers per domain, each returning realistic fixture data shaped like the target
   contract above.
2. Build every screen in this phase against those mocks — full interaction, loading/error/empty
   states, the works. Nothing here should look or feel unfinished; only the network layer is fake.
3. **Scoping call on voice/group calling (M12 FE-3):** build the chat UI and a call-button stub
   that opens the in-call/incoming-call overlay shell, but treat actual WebRTC signaling as
   out-of-scope for this pass — `WEB_DESIGN_PLAN.md` §8 itself flags web calling as lower priority
   than mobile. Revisit only if the FYP demo specifically needs it.
4. As each backend domain ships for real (tracked in §1's table), swap that one service-layer file
   from MSW-backed to Axios-backed, re-run that domain's tests against the real backend, done —
   the screens themselves shouldn't need changes if the mock contract was accurate.

### Testing
- Component/E2E tests run against MSW in this phase (that's the point of MSW — deterministic tests
  without a real backend). Write them now; they keep working unchanged after the real-backend swap
  since MSW and Playwright-against-real-backend exercise the same service-layer interface.
- Track "mocked vs. real" per domain explicitly in test file names or tags, so it's obvious at a
  glance which suites need re-verification after a swap.

**Exit criteria:** every screen in this phase is fully interactive and passes its tests against
MSW. Re-open this phase's exit criteria per-domain (not all at once) as each backend piece ships.

---

## Phase 8 — Dashboards

Built last because each is a read-composition over everything above.

### Screens

| Screen | Route | Role | Depends on |
|---|---|---|---|
| Home | `/app/home` | Citizen | Phases 3 (nearby shelters/hazard link), 5 (community reports), 6 (aid requests), 4 (family safety), 7 (alert banner) |
| Dashboard | `/ngo/dashboard` | NGO | Phases 3 (region hazard map), 5/6 (KPI counts), 7 (tasks widget) |
| Dashboard | `/admin/dashboard` | Admin | Phases 1 (pending NGO approvals), 3 (hazard map), 5/6 (KPI counts), 7 (active alerts, audit excerpt) |

### Build steps
1. Build each dashboard's KPI/widget grid against whatever's already real (Phases 1–6) first —
   these sections should need no mocking at all by this point.
2. Wire the still-mocked widgets (Home's alert banner, NGO/Admin's task/alert widgets) against
   Phase 7's MSW handlers — same swap-later story.
3. Citizen Home's alert banner + deep-link into Alert Takeover only renders during an active alert
   — test both the present and absent states explicitly, don't let the absent state go unverified.

**Exit criteria:** all three dashboards render, every KPI card drills into its real matching list
screen (per `WEB_DESIGN_PLAN.md` §7's link-integrity audit — re-run that audit's logic here).

---

## Phase 9 — Real-time, i18n/RTL, Dark Mode Polish

1. **Real-time**: confirm the WS hook pattern (proven in Phase 4) extends cleanly to Navigation
   rerouting (`WS /ws/navigation/{routeID}`) and Communication's live message delivery once those
   domains are real (post–Phase 7 swap).
2. **RTL**: apply the mobile plan's confirmed RTL rules — full `Noto Sans Arabic` font-stack swap
   (not just labels), logical CSS properties throughout (should already be default if Tailwind was
   set up with logical utilities in Phase 0, not physical `left`/`right`), brand gradient angle
   mirrors (135deg↔225deg), directional icons (chevrons/back-arrows) flipped per `dir`. Only one
   mobile screen was ever pixel-verified in RTL — expect to make real design judgment calls here,
   not just replay a reference.
3. **Dark mode**: apply confirmed overrides (`surface.base`→`#1A0E13`, `surface.raised`→`#2A1720`,
   `ink.900`→`#F7EDF0`, 1px `#3A2430` card borders since shadow alone doesn't read on dark, shadows
   switch from warm-ink-tinted to plain black). **Explicitly define the missing dark-mode tinted
   text scale** for status/category chips (not in the written token doc) — the earlier audit's
   specific suggested values (e.g. Flooding chip text `#2F6FED`→`#7FB0F0`) are a starting point,
   not gospel; verify contrast properly.
4. Known open design question to resolve here, not defer further: Safety Groups' local "+" FAB vs.
   the global chatbot FAB stacking conflict (flagged unresolved in the mobile spec itself).

**Testing:** visual regression pass (manual or Playwright screenshot comparison) across
light/dark × en/ur for every screen built so far — this is the first phase where that full matrix
is actually meaningful to check.

---

## Phase 10 — Cross-Role E2E Hardening

1. Re-run `WEB_DESIGN_PLAN.md` §7's link-integrity audit against the *actual built* app (not just
   the spec) — confirm no orphan screens, no dangling buttons, for real routes.
2. Full-matrix Playwright suite: one E2E flow per role covering register/login → core action →
   logout, run against the real backend for every domain that's real by this point.
3. Accessibility pass: keyboard nav through data tables/dialogs/drawers, `:focus-visible` rings
   (design system specifies these explicitly — don't leave browser defaults), color-contrast check
   on chart palettes and data-table status columns specifically (flagged in the spec's own handoff
   checklist as new surfaces that don't exist on mobile, so mobile's earlier contrast pass doesn't
   cover them).
4. Performance pass: bundle size (map libraries and chart libraries are the likely biggest
   contributors — confirm code-splitting per role-route so a citizen never downloads the admin
   dashboard's chart bundle).

---

## Cross-cutting testing strategy

| Layer | Tool | When |
|---|---|---|
| Unit (pure functions — color mapping, Zod schemas, WS reconnect logic) | Vitest | Every phase, alongside the code |
| Component (forms, interactive widgets, loading/error/empty states) | Vitest + React Testing Library | Every phase |
| API mocking (unbuilt backend, and deterministic component tests for built backend too) | MSW | Phase 7 primarily; also usable for any component test that shouldn't hit a real network |
| E2E (real backend) | Playwright against local Go backend (docker-compose) | End of every phase whose backend is real |
| E2E (mocked backend) | Playwright against MSW | End of Phase 7, until each domain's real swap |
| Manual QA | Browser, both themes, both locales | End of every phase minimum; full matrix in Phase 9 |

## How to keep this document current

When a backend domain in §1's table flips from ❌ to ✅: update that row, move its screens'
"backing domain" note in Phase 7 to reflect the swap, swap the one service-layer file from MSW to
Axios, re-run that domain's E2E suite against the real backend, and check the box. Nothing else in
this document should need to change — if it does, that's a sign the service-layer boundary leaked
somewhere and is worth fixing.
