# LittleLife Web — Design Plan (Admin · NGO · Citizen)

**Standalone document**, companion to `MOBILE_DESIGN_PLAN.md` (citizen mobile app) and grounded in
the same two sources of truth used everywhere else in this project: `IMPLEMENTATION_ROADMAP.md`
(exact backend routes/roles) and `sds.pdf` (approved FE list, §1.8, and the original web mockups in
§4.4.2). Every screen below traces to a specific FE and a specific backend route — nothing invented.

**Discipline for this document, stated up front because completeness was explicitly asked for:**
§3 is a full FE-coverage matrix proving every Module-1/9/10/11/13/15/16 FE assigned to Admin, NGO,
or Citizen-web lands on a named screen. §7 is a link-integrity audit — every screen's entry points
and exit points listed and cross-checked against the sitemap in §2. §8 lists what's deliberately
*not* built for web, so nothing is silently missing. §9 documents two gaps this process found in
the *mobile* plan while designing web (NGO self-registration, volunteer-invitation response) and
specs the fix for both surfaces.

---

## 0. Scope & role model

One web codebase, three role-scoped experiences, gated by the JWT `role` claim exactly as the
backend defines it:

| Role(s) | Experience | Landing route |
|---|---|---|
| `user` | **Citizen Web** — full parity with the mobile app's feature set, laid out for desktop/tablet | `/app/home` |
| `ngo_admin`, `ngo_volunteer` | **NGO Web** — regional operations dashboard, permissions narrower for `ngo_volunteer` (noted per-screen) | `/ngo/dashboard` |
| `admin`, `super_admin` | **Admin Web** — system-wide operations, moderation, and reporting console | `/admin/dashboard` |

A single account only ever has one of these roles at a time (per the backend's own account-
promotion model — approving an NGO registration *promotes* the requesting citizen's account to
`ngo_admin`, it doesn't create a second account). Login always resolves to exactly one of the
three landing routes; there is no in-app role switcher.

---

## 1. Relationship to the mobile design system

This app **reuses every token defined in `MOBILE_DESIGN_PLAN.md` §1** — Rose/Peach brand palette,
Ink contrast scale, semantic status colors, category palette, type scale, radius/elevation scale,
Phosphor iconography, motion timing. Full rationale lives there; this section only states what's
*added* for web and one deliberate *tonal* difference.

### 1.1 Condensed token recap (see mobile plan for full rationale)

`primary.500 #F2477D` (Rose) · `peach.400 #FF9563` · `ink.900 #221019` · `status.safe #2E9E5B` ·
`status.caution #E0A100` · `status.high #F0740B` · `status.critical #D42E2E` · `status.trust
#1F7A8C` · `status.info #3A5FCD` · `surface.base #FFFBF9` · `surface.raised #FFFFFF` ·
`surface.sunken #FDEFEA` · `surface.border #F0DCD6`. Category palette (incident/aid types) is
identical to mobile §1.2.5. Type stacks identical to mobile §1.3 (Manrope/Inter for English, Noto
Sans Arabic for Urdu, with the same Nastaliq caveat).

### 1.2 Deliberate tonal difference: brand-forward vs. neutral-dominant

**Citizen Web** stays brand-forward — gradients, warm surfaces, the same personality as mobile,
since it's the same consumer-facing product.

**NGO Web and Admin Web are neutral-dominant.** These are dense, data-table-heavy operations
tools used repeatedly by staff, not a consumer app opened occasionally in a crisis. Overloading
that surface with the peach/pink brand gradient the way Citizen/mobile does would fight the
data — every dashboard would visually compete with itself. So: `surface.base`/`surface.raised`/
`ink.*` carry the vast majority of NGO/Admin screens, and `primary.500` is reserved for exactly
three things there — the active sidebar item, primary action buttons, and the app's own logomark
in the sidebar header. Status colors (§1.2.4) carry full weight everywhere, unchanged — severity/
state legibility matters *more*, not less, in an operations console.

### 1.3 Web-specific tokens

| Token | Value | Usage |
|---|---|---|
| `breakpoint.sm` | 768px | Sidebar collapses to icon-only rail below this width |
| `breakpoint.md` | 1024px | Split-view (map+list) stacks to tabs below this width |
| `breakpoint.lg` | 1440px | Max content width for dashboards (centered, not full-bleed on ultra-wide monitors) |
| `sidebar.width.expanded` | 240px | NGO/Admin sidebar, labels visible |
| `sidebar.width.collapsed` | 72px | icon-only rail |
| `topbar.height` | 64px | |
| `table.row.height` | 52px | Data table row height (compact-dense mode: 40px, toggle noted per screen) |

---

## 2. Information architecture — full route tree

### 2.1 Shared (pre-auth)

```
/login
/register                          (citizen self-registration only — NGO/Admin accounts are
                                     never created here; see role model §0)
/verify-email
/forgot-password
/reset-password
```

### 2.2 Citizen Web (`/app/*`)

```
/app/onboarding/region                    (first-login only)
/app/home
/app/map
/app/map/shelters/:id
/app/community
/app/community/:incidentId
/app/resources                            (tab shell — query param ?tab=local|aid|campaigns|missing)
/app/resources/aid/:id
/app/resources/campaigns/:id
/app/resources/missing-persons/:id
/app/navigate
/app/safety-groups
/app/safety-groups/:id
/app/messages/:conversationId
/app/profile
/app/profile/edit
/app/profile/alert-preferences
/app/profile/account-settings
/app/profile/credibility
/app/profile/activity
/app/profile/ngo                          (NEW — see §9)
/app/profile/invitations                  (NEW — see §9)
```
Global overlays (not routes, presented over any `/app/*` screen): Alert Takeover, Report Incident
drawer, Request Help drawer, Report Missing Person drawer, Report Sighting dialog, AI Chatbot
panel.

### 2.3 NGO Web (`/ngo/*`)

```
/ngo/dashboard
/ngo/incidents
/ngo/incidents/:id
/ngo/aid-requests
/ngo/aid-requests/:id
/ngo/missing-persons
/ngo/missing-persons/:id
/ngo/tasks                                (tab: Board | List)
/ngo/volunteers
/ngo/shelters
/ngo/shelters/:id
/ngo/campaigns
/ngo/campaigns/:id
/ngo/alerts                               (tab: Alerts | Community Updates)
/ngo/field-observations
/ngo/feedback
/ngo/coordination                         (tab: Escalations | Messages)
/ngo/reports
/ngo/reports/:id
/ngo/settings/organization
/ngo/settings/account
```

### 2.4 Admin Web (`/admin/*`)

```
/admin/dashboard
/admin/hazard-zones
/admin/hazard-zones/:id
/admin/incident-reports
/admin/incident-reports/:id
/admin/alerts                             (tab: Alerts | Broadcast | Community Updates)
/admin/tasks                              (tab: Board | List)
/admin/relief-operations                  (tab: Missing Persons | Campaigns | Aid Requests)
/admin/escalations                        (tab: Escalations | Messages)
/admin/analytics
/admin/reports
/admin/reports/:id
/admin/audit-log
/admin/users
/admin/users/:id
/admin/ngos
/admin/ngos/:id
/admin/regions
/admin/regions/:id
/admin/facilities                         (tab: Shelters | Infrastructure | Essential Locations)
/admin/offline-maps
/admin/settings/account
```

---

## 3. Screen inventory & FE-coverage matrix

Every FE from `sds.pdf` §1.8 assigned to an Admin/NGO/Citizen-web actor, traced to its screen.
Rows are grouped by module; "—" in Screen means the FE is covered by an existing screen listed
above it (not a gap).

| FE | Actor | Screen | Route |
|---|---|---|---|
| M1 FE-1 (register/OTP) | Citizen | Login/Register, OTP | `/register`, `/verify-email` |
| M1 FE-2 (login/logout) | All | Login | `/login` |
| M1 FE-3 (profile/prefs/deactivate) | Citizen | Edit Profile, Alert Preferences, Account Settings | `/app/profile/*` |
| M1 FE-4 (activity timeline) | Citizen | Activity Timeline | `/app/profile/activity` |
| M1 FE-5 (safety groups + live GPS) | Citizen | Safety Groups | `/app/safety-groups*` |
| M1 FE-6 (credibility score) | Citizen | Credibility | `/app/profile/credibility` |
| M1 FE-7 (NGO register + approve/reject) | Citizen (register) / Admin (approve) | **My NGO** (NEW, §9) / NGOs | `/app/profile/ngo` / `/admin/ngos` |
| M1 FE-8 (NGO org profile + regions) | NGO | Organization Settings | `/ngo/settings/organization` |
| M1 FE-9 (volunteer invite/manage + accept) | NGO (invite) / Citizen (respond, NEW §9) | Volunteers / **Invitations** | `/ngo/volunteers` / `/app/profile/invitations` |
| M1 FE-10 (NGO views credibility) | NGO | embedded in Incidents/Aid Requests tables | — |
| M1 FE-11 (admin login) | Admin | Login | `/login` |
| M1 FE-12 (account status + moderation) | Admin | Users & Accounts | `/admin/users/:id` |
| M7 FE-1/2/3 (predictions) | Admin | Hazard Zones & Predictions | `/admin/hazard-zones` |
| M8 FE-1–7 (map layers) | Citizen | Map | `/app/map` |
| M9 FE-1 (fuse alert) | Admin | Alerts & Broadcasts | `/admin/alerts` |
| M9 FE-2 (classify/prioritize) | — | same resource, no separate screen | — |
| M9 FE-3 (forward + ack tracking) | Citizen | Home banner + Alert Takeover | `/app/home` |
| M9 FE-4 (dispatch log) | Admin | Alerts & Broadcasts | `/admin/alerts` |
| M9 FE-5 (manual override broadcast) | Admin / NGO | Alerts & Broadcasts / Alerts & Community Updates | `/admin/alerts` / `/ngo/alerts` |
| M9 FE-6 (actionable alert screen) | Citizen | Alert Takeover | overlay |
| M9 FE-7 (I'm Safe/I Need Help) | Citizen | Alert Takeover | overlay |
| M10 FE-1–4 (incident CRUD, votes, status) | Citizen | Community Feed, Incident Detail, Report Incident | `/app/community*` |
| M10 FE-5 (essential location status) | Citizen / Admin | Local Resources / Facilities | `/app/resources` / `/admin/facilities` |
| M10 FE-7 (post community updates) | NGO / Admin | Alerts & Community Updates (both roles) | `/ngo/alerts`, `/admin/alerts` |
| M11 FE-1–7 (navigation) | Citizen | Safe Route Navigation | `/app/navigate` |
| M12 FE-1 (AI chatbot) | Citizen | Chatbot panel | overlay |
| M12 FE-2 (share incident in chat) | Citizen | Message thread | `/app/messages/:id` |
| M12 FE-3 (voice/group calls) | Citizen | in-call overlay | — |
| M12 FE-4 (auto-flag → escalation) | Admin / NGO | Escalations & Coordination (both) | `/admin/escalations`, `/ngo/coordination` |
| M13 FE-1 (aid requests) | Citizen / NGO / Admin | Resources›Aid / NGO Aid Requests / Admin Relief Ops | `/app/resources`, `/ngo/aid-requests`, `/admin/relief-operations` |
| M13 FE-2 (donation campaigns) | Citizen / NGO | Resources›Campaigns / NGO Campaigns | `/app/resources`, `/ngo/campaigns` |
| M13 FE-3 (missing persons) | Citizen / NGO / Admin | Resources›Missing Persons / NGO Missing Persons / Admin Relief Ops | see routes above |
| M13 FE-4 (comms for aid/missing) | Citizen | Message thread | `/app/messages/:id` |
| M13 FE-5 (donation lifecycle) | Citizen | Donation History (inside Profile) | `/app/resources` |
| M13 FE-6 (missing-person map) | Citizen | Missing Person Detail (embedded map) | — |
| M13 FE-7 (auto-notify sightings) | Citizen | push/notification, no dedicated screen | — |
| M15 FE-1 (hazard dashboard) | Admin | Dashboard, Hazard Zones | `/admin/dashboard`, `/admin/hazard-zones` |
| M15 FE-2 (heatmap) | Admin | Dashboard | `/admin/dashboard` |
| M15 FE-3/4/5 (verify/lifecycle/rank incidents) | Admin | Incident Reports | `/admin/incident-reports` |
| M15 FE-6 (assign incidents) | Admin | Task Assignments | `/admin/tasks` |
| M15 FE-7 (broadcast alerts) | Admin | Alerts & Broadcasts | `/admin/alerts` |
| M15 FE-8 (monitor relief ops) | Admin | Relief Operations Overview | `/admin/relief-operations` |
| M15 FE-9 (analytics) | Admin | Analytics | `/admin/analytics` |
| M15 FE-10 (generate reports) | Admin | Reports | `/admin/reports` |
| M15 FE-11 (alert console) | Admin | Alerts & Broadcasts | `/admin/alerts` |
| M15 FE-12 (audit trail) | Admin | Audit Log | `/admin/audit-log` |
| M15 FE-13 (auto-escalate) | Admin | Escalations & Coordination | `/admin/escalations` |
| M16 FE-1 (region-scoped hazard map) | NGO | Dashboard | `/ngo/dashboard` |
| M16 FE-2 (track incidents/aid/missing in region) | NGO | Incidents / Aid Requests / Missing Persons | `/ngo/incidents`, `/ngo/aid-requests`, `/ngo/missing-persons` |
| M16 FE-3/4 (verify/update incidents) | NGO | Incidents | `/ngo/incidents` |
| M16 FE-5 (assign tasks) | NGO | Tasks | `/ngo/tasks` |
| M16 FE-6 (monitor volunteers/tasks) | NGO | Tasks, Volunteers | `/ngo/tasks`, `/ngo/volunteers` |
| M16 FE-7 (targeted alerts/updates) | NGO | Alerts & Community Updates | `/ngo/alerts` |
| M16 FE-8 (manage campaigns/aid) | NGO | Campaigns, Aid Requests | `/ngo/campaigns`, `/ngo/aid-requests` |
| M16 FE-9 (shelter management) | NGO | Shelters | `/ngo/shelters` |
| M16 FE-10 (field observations) | NGO | Field Observations | `/ngo/field-observations` |
| M16 FE-11 (community feedback) | NGO | Feedback | `/ngo/feedback` |
| M16 FE-12 (cross-org coordination) | NGO | Coordination | `/ngo/coordination` |
| M16 FE-13 (regional reports) | NGO | Reports | `/ngo/reports` |
| M16 FE-14 (regional overview) | NGO | Dashboard | `/ngo/dashboard` |
| *(supporting, not its own FE)* | Admin | Regions, Facilities, Offline Map Packages | `/admin/regions`, `/admin/facilities`, `/admin/offline-maps` |

---

## 4. App shell & navigation

### 4.1 Citizen Web shell

Top nav bar (not sidebar — citizen web mirrors mobile's flatter IA): logo left, primary nav links
center (Home / Map / Community / Resources), right-aligned: notification bell, chatbot toggle,
avatar menu (Profile / Settings / Log Out). Below 768px, the center links collapse into a hamburger
menu. No sidebar anywhere in Citizen Web — this experience should feel like the mobile app's tab
bar translated up into a header, not like an ops console.

### 4.2 NGO Web & Admin Web shell (shared structural pattern, different nav items)

Persistent left sidebar (`sidebar.width.expanded`, collapsible to icon rail), grouped nav items
with section labels, active item = `primary.500` left-border accent (4px) + `primary.50` row tint
+ `primary.700` icon/label (the desktop expression of mobile's "active tab dot" cue — consistent
metaphor, different chrome). Top bar: page title/breadcrumb (left), region-scope indicator (NGO:
read-only chip showing their assigned region(s); Admin: an "All Regions ▾" dropdown filter that
persists across screens via query param), notification bell, avatar menu. Sidebar footer: org/user
identity card (avatar, name, role chip) opening the same avatar menu.

**NGO sidebar groups & items:**
- *Overview*: Dashboard
- *Operations*: Incidents, Aid Requests, Missing Persons, Tasks, Shelters, Campaigns
- *Outreach*: Alerts & Community Updates, Field Observations, Feedback
- *Coordination*: Coordination (Escalations/Messages)
- *Insights*: Reports
- *Settings* (bottom, visually separated): Organization Settings *(ngo_admin only — hidden for `ngo_volunteer`)*, My Account

**Admin sidebar groups & items:**
- *Overview*: Dashboard
- *Hazard Intelligence*: Hazard Zones & Predictions
- *Community*: Incident Reports, Alerts & Broadcasts
- *Operations*: Task Assignments, Relief Operations
- *Coordination*: Escalations & Coordination
- *Insights*: Analytics, Reports, Audit Log
- *Administration*: Users & Accounts, NGOs, Regions, Facilities, Offline Map Packages
- *Settings* (bottom): My Account

---

## 5. Web-specific component library additions

Everything from `MOBILE_DESIGN_PLAN.md` §2 (buttons, inputs, cards, badges, avatars, empty/loading
states, toasts, progress indicators, map markers) carries over unchanged. Added for web:

- **Data table**: header row (sortable columns — click toggles asc/desc/none, sort arrow icon),
  search input + column filter chips above the table, row hover state (`surface.sunken` tint),
  row-select checkboxes (leftmost column) enabling a bulk-action bar that slides in above the
  table when ≥1 row is selected, row-action icon buttons (rightmost column, e.g. eye=view,
  check-circle=verify, arrow-forward=assign, trash=delete — always Phosphor bold-stroke since
  these are status/action-bearing, per the calm-vs-crisis icon rule), pagination footer (page
  size selector + prev/next + "1–20 of 143"), empty state and skeleton-row loading state per
  mobile §2.9–2.10.
- **Sidebar nav** (§4.2 above).
- **Split view (list + map)**: two-pane layout, left pane a filterable data table/list (resizable
  divider, min 360px), right pane a Mapbox GL JS map; selecting a list row pans/highlights the
  matching map feature and vice versa. Used for Map (citizen), Hazard Zones, Dashboard widgets.
- **Drawer** (right-side slide-in, 480px default width, `elevation.3`): multi-field forms and
  detail-edit panels — the web equivalent of mobile's full-screen modal forms. Footer pinned:
  Cancel (ghost) + primary submit button.
- **Dialog** (centered modal, 480px max width): short confirmations and single-purpose actions
  ("Approve this NGO?", "Resolve hazard zone?") — always has an explicit Cancel + confirm pair,
  confirm button colored by the action's actual severity (e.g. "Reject" = danger-outline, "Verify"
  = primary, "Broadcast Alert" = critical-solid).
- **Tabs (in-page)**: underline-style tab strip beneath a page header, used for every
  multi-section screen listed with a "(tab: …)" route note in §2.
- **Board view (Kanban)**: columns = `task_assignment_status` values (Assigned / Accepted /
  In-Progress / Completed / Cancelled), cards = task summary (type icon, linked
  incident/aid/missing-person title, assignee avatar, priority badge), drag-and-drop between
  columns triggers the same `PATCH .../status` call a manual dropdown would — used on Task
  Assignments (both roles) as an alternate view to the List, toggled by a segmented control top-
  right of the page.
- **Stat/KPI card row**: up to 6 across on desktop, each: icon, large number (`h1`), label, and an
  optional trend chip (▲/▼ + %, colored `status.safe`/`status.critical` by direction) — used on
  both Dashboards and Analytics.
- **Chart widgets**: line chart (trends over time — hazard frequency, response time), bar chart
  (comparative — NGO performance, volunteer activity), donut (composition — aid request status
  breakdown). Colors drawn from the category/status palettes, never arbitrary chart-library
  defaults, so a chart legend stays consistent with badges elsewhere in the app.
- **Breadcrumb**: `Section / Subsection / Current item` in the top bar on detail screens two or
  more levels deep (e.g. `NGOs / Al-Khidmat Foundation / Volunteers`).

---

## 6. Screen-by-screen specifications

Format per screen: Pattern · Route · Purpose · Layout · Components · **Buttons & Actions** table
(Label | Type | On click → | Notes). Patterns (defined once): **W-Auth**, **W-List**, **W-Detail**,
**W-Dashboard**, **W-Drawer-Form**, **W-Dialog-Form**, **W-Map-Split**, **W-Conversation**,
**W-Settings**, **W-Takeover**, **W-Board**.

### 6.1 Shared / cross-role

#### Login — Pattern W-Auth · `/login`

Split screen: left panel = brand gradient with a short mission statement, right panel = centered
card containing the login form.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Log In | Primary | `POST /auth/login` → redirect to role's landing route (§0) | |
| Forgot password? | Ghost link | `/forgot-password` | |
| Continue with Google | Secondary (outline) | Google OAuth flow | Disabled/feature-flagged — no backend route yet (mobile plan Gap 3, applies here too) |
| Register (footer link) | Ghost link | `/register` | Citizen self-registration only; NGO/Admin accounts aren't created here — copy reads "Are you a citizen? Create an account" to avoid implying NGO/Admin self-signup |

#### Register — Pattern W-Auth · `/register`

Same split-screen shell as Login.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Register | Primary | `POST /auth/register` → `/verify-email` | |
| Already have an account? Log In | Ghost link | `/login` | |

#### Verify Email (OTP) — Pattern W-Auth · `/verify-email`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Verify | Primary | `POST /auth/verify-email` → role's landing route | Auto-submits on 6th digit entered, this button is a fallback |
| Resend code | Ghost link (disabled during countdown) | `POST /auth/resend-verification` | |

#### Forgot Password / Reset Password — Pattern W-Auth · `/forgot-password`, `/reset-password`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Send Reset Link | Primary | `POST /auth/password/forgot` → confirmation state, same screen | |
| Reset Password | Primary | `POST /auth/password/reset` → `/login` | Shown on `/reset-password` (reached via emailed link token) |
| Back to Log In | Ghost link | `/login` | |

#### Global: Notifications panel (all roles)

Bell icon in every top bar opens a right-side dropdown/drawer listing recent notifications
(alerts, status changes, invitations). Each row's "On click →" routes to the relevant detail
screen for that role (e.g., citizen: an incident-status notification → `/app/community/:id`; NGO:
a new-assignment notification → `/ngo/incidents/:id`).

#### Global: Avatar/account menu (all roles)

| Item | On click → |
|---|---|
| My Account / Profile | Citizen → `/app/profile`; NGO → `/ngo/settings/account`; Admin → `/admin/settings/account` |
| (NGO admin only) Organization Settings | `/ngo/settings/organization` |
| Log Out | `POST /auth/logout` → `/login` |

---

### 6.2 Citizen Web

#### Onboarding — Region Picker — Pattern W-Auth (full-viewport variant) · `/app/onboarding/region`

Two-column drill-down (province list → district list), same content as mobile's onboarding.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Province row (each) | List row | loads matching districts in right column | |
| District row (each) | List row (radio-select) | marks selection | |
| Continue | Primary | saves home region → `/app/home` | Disabled until a district is selected |
| Skip for now | Ghost link | → `/app/home` (unscoped defaults) | De-emphasized, top-right |

#### Home — Pattern W-Dashboard · `/app/home`

Header greeting band (brand gradient), conditional Alert banner, then four independently-loading
sections: Quick Actions, Latest Community Reports, Nearby Aid Requests, Family Safety Status.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Notification bell | Icon | opens Notifications panel | |
| "View on Map" (alert banner) | Ghost | `/app/map?hazard={id}` | Only rendered during an active alert |
| Quick Action: Report Incident | Card/tile | opens Report Incident drawer | |
| Quick Action: Request Help | Card/tile | opens Request Help drawer | |
| Quick Action: Safe Routes | Card/tile | `/app/navigate` | |
| Quick Action: Nearby Shelters | Card/tile | `/app/map?layer=shelters` | |
| "View All" (Community Reports) | Ghost link | `/app/community` | |
| Community report card (each) | Card | `/app/community/:id` | |
| "View All" (Aid Requests) | Ghost link | `/app/resources?tab=aid` | |
| Aid request card (each) | Card | `/app/resources/aid/:id` | |
| "View Details" (Family Safety) | Ghost | `/app/safety-groups/:id` | Only rendered during active alert + active group |

#### Map — Pattern W-Map-Split · `/app/map`

Left pane: search + layer toggle chips + collapsible "Active Hazards" list. Right pane: full map.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Search bar | Input | filters map + left-pane list | |
| Layer toggles (5 chips: Flood / Shelters / Infrastructure / Reports / Missing Persons) | Chip (multi-select) | toggles corresponding map layer | |
| Legend | Icon button | opens legend popover | |
| Recenter | Icon button | recenters map on user location | |
| Hazard/shelter/incident marker (each) | Map feature | opens matching tooltip panel in left pane | |
| "View Details" (tooltip panel) | Ghost | `/app/map/shelters/:id` (shelter) or `/app/community/:id` (incident) | |
| Report Incident | Secondary | opens Report Incident drawer | Pinned action bar above map on mobile-width; a left-pane button on desktop |
| Request Help | Secondary | opens Request Help drawer | |
| Find Safe Route | Primary | `/app/navigate` | |

#### Shelter Detail — Pattern W-Detail · `/app/map/shelters/:id`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | `/app/map` | |
| Navigate Here | Primary | `/app/navigate?destination_shelter_id={id}` | |

#### Community Feed — Pattern W-List · `/app/community`

Tabs: Latest / Verified / Nearby / Q&A (Q&A = "Coming soon" empty state, per mobile plan's Gap 6
— same gap applies identically to web, not re-solved here).

| Button | Type | On click → | Notes |
|---|---|---|---|
| Search | Input | filters feed | |
| Filter | Icon button | opens filter popover (category/distance/date/verification) | |
| Report Incident | Primary (top-right of page header) | opens Report Incident drawer | |
| Post card (each) | Card | `/app/community/:id` | |
| Upvote / Downvote (inline on card) | Icon buttons | `POST/DELETE /incident-reports/{id}/votes` | |

#### Incident Detail — Pattern W-Detail · `/app/community/:incidentId`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | `/app/community` | |
| Upvote / Downvote | Icon buttons (large) | vote endpoints | |
| Message | Secondary | `/app/messages/:conversationId` | Only if a thread exists for this report |
| View on Map | Ghost | `/app/map?hazard={id}` | |

#### Report Incident (drawer) — Pattern W-Drawer-Form · overlay, no route

| Button | Type | On click → | Notes |
|---|---|---|---|
| Close (×) | Icon | dismiss drawer (confirm-discard dialog if fields filled) | |
| Category tile (each, 8 options) | Chip-input | selects category | |
| Upload photos/videos | Drop-zone | opens file picker | Max 5, 10MB each |
| Change location | Ghost link | opens map-picker dialog | |
| Submit Report | Primary (pinned footer) | `POST /incident-reports` (+ media) → success toast, drawer closes, feed refreshes | |

#### Resources hub — Pattern W-List (tab shell) · `/app/resources`

##### Local Resources tab

| Button | Type | On click → | Notes |
|---|---|---|---|
| Category chips (Pharmacy/Fuel/Grocery/ATMs/Water) | Chip filter | filters list | Fuel/Water gap noted, same as mobile §7 Gap 8 |
| Navigate | Secondary (per row) | `/app/navigate?destination=...` | |
| Mark as Closed/Open | Ghost (per row) | `POST .../status-reports` | |

##### Aid tab

| Button | Type | On click → | Notes |
|---|---|---|---|
| All / Mine toggle | Segmented | filters `?mine=true` | |
| Request Help | Primary (page header) | opens Request Help drawer | |
| Aid request row (each) | Card | `/app/resources/aid/:id` | |

**Request Help (drawer):**

| Button | Type | On click → | Notes |
|---|---|---|---|
| Resource-type tile (each, 6) | Chip-input | selects category | |
| Upload photos | Drop-zone | max 3, 10MB each | |
| Change delivery location | Ghost link | map-picker dialog | |
| Urgency segment (Low/Medium/Urgent) | Segmented | severity-tinted per selection | |
| Submit Request | Primary (pinned footer) | `POST /aid-requests` | |

**Aid Request Detail (`/app/resources/aid/:id`):**

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | `/app/resources?tab=aid` | |
| Message | Secondary | `/app/messages/:conversationId` | |
| Cancel Request | Danger-outline | `PATCH .../status {cancelled}` → confirm dialog first | Only visible to the requester while cancellable |

##### Campaigns tab

| Button | Type | On click → | Notes |
|---|---|---|---|
| Campaign card (each) | Card | `/app/resources/campaigns/:id` | |

**Campaign Detail (`/app/resources/campaigns/:id`):**

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | `/app/resources?tab=campaigns` | |
| Donate | Primary | expands inline amount-entry panel (not a new screen/route) | |
| Confirm Contribution | Primary (within expanded panel) | `POST /donation-campaigns/{id}/donations` → success toast | |

**Donation History** — reached via Profile (§ below), not its own top-level route: list of past
contributions, each row → `/app/resources/campaigns/:id`.

##### Missing Persons tab

| Button | Type | On click → | Notes |
|---|---|---|---|
| Report Missing | Primary (page header) | opens Report Missing Person drawer | |
| Missing-person card (each) | Card | `/app/resources/missing-persons/:id` | |

**Missing Person Detail (`/app/resources/missing-persons/:id`):**

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | `/app/resources?tab=missing-persons` | |
| Report Sighting | Primary | opens Report Sighting dialog | |
| Call reporter | Icon (tel: link) | initiates phone call | |

**Report Missing Person (drawer):** Submit → `POST /missing-persons` → closes, list refreshes.
**Report Sighting (dialog):** Submit → `POST /missing-persons/{id}/sightings` → closes, detail
refreshes.

#### Safe Route Navigation — Pattern W-Map-Split · `/app/navigate`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Origin/Destination fields | Input | autocomplete | |
| Calculate Safe Route | Primary | `POST /navigation/route` → renders route on map pane | |
| Quick destination row (Nearest Shelter, Main Hospital) | List row | pre-fills destination + calculates | |
| Reroute | Ghost (shown once route active) | recalculates on demand | |

#### Safety Groups — Pattern W-List · `/app/safety-groups`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Create Group | Primary | opens Create Group dialog | |
| Group row (each) | List row | `/app/safety-groups/:id` | |

**Safety Group Detail (`/app/safety-groups/:id`):**

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | `/app/safety-groups` | |
| + Invite Member | Ghost row | opens Invite dialog → `POST /safety-connections` | |
| Location-share toggle (per member) | Switch | gates `useBackgroundLocationSharing`-equivalent (web: foreground-only, browser Geolocation API, see §8) | |
| Remove member (×) | Icon | `DELETE /safety-connections/{id}` → confirm dialog | |

#### Alert Takeover — Pattern W-Takeover · overlay (deep-link `/app/alerts/:id`)

| Button | Type | On click → | Notes |
|---|---|---|---|
| Open Full Navigation | Secondary | `/app/navigate` (pre-filled to suggested shelter) | |
| Shelter card (each, horizontal scroll) | Card | `/app/map/shelters/:id` | |
| Call (emergency contact row) | Icon | tel: link | |
| View on Map instead | Ghost link | `/app/map?hazard={id}`, dismisses takeover | |
| I'm Safe | Safe-solid (large, pinned) | `PATCH /alert-deliveries/{id}/respond {safe}` → dismisses takeover | |
| I Need Help | Critical-solid (large, pinned) | `PATCH /alert-deliveries/{id}/respond {need_help}` → dismisses takeover, opens escalation confirmation toast | |

#### AI Chatbot — Pattern W-Conversation (persistent right-side panel, not a route)

| Button | Type | On click → | Notes |
|---|---|---|---|
| Chat toggle (top bar) | Icon | opens/closes panel | |
| Suggested prompt chip (each) | Chip | sends that prompt as first message | |
| Send | Icon (in composer) | `POST /conversations/{id}/messages` | |
| Attach incident report | Icon (in composer) | opens a small "select a report" picker → sends with `shared_incident_report_id` | |

#### Message Thread — Pattern W-Conversation · `/app/messages/:conversationId`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Back | Icon | previous screen (aid/missing-person detail) | |
| Linked-resource chip (header) | Chip | `/app/resources/aid/:id` or `/app/resources/missing-persons/:id` | |
| Send | Icon | `POST /conversations/{id}/messages` | |
| Call icon (header) | Icon | initiates voice call overlay | |

#### Profile — Pattern W-Settings · `/app/profile`

Left sub-nav: Overview / Edit Profile / Alert Preferences / Account Settings / Credibility /
Activity / My NGO / Invitations.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Sub-nav item (each) | List item | loads matching right-panel content, same route with different panel state, or dedicated sub-routes per §2.2 | |
| Edit Profile → Save | Primary | `PATCH /profile` | |
| Alert Preferences → toggles/pickers | Switch/Segmented | `PATCH /profile/alert-preferences` (auto-saves on change, no separate Save button — matches a settings-panel convention) | |
| Account Settings → Deactivate Account | Row (caution icon) | opens confirm dialog → `POST /auth/me/deactivate` | |
| Account Settings → Delete Account | Row (critical icon) | opens password-confirmation dialog → `POST /auth/me/delete` | |
| My NGO → Register an NGO | Primary | opens Register NGO drawer (NEW, §9) | Only shown if the account has no NGO on record |
| My NGO → (if pending/active) status card | — | read-only status display, no action | |
| Invitations → Accept / Decline (per row) | Primary / Ghost | `PATCH /volunteer-invitations/{id}/accept` / `.../decline` (NEW, §9) | |

---

### 6.3 NGO Web

#### Dashboard — Pattern W-Dashboard · `/ngo/dashboard`

KPI row (Active Incidents / Open Aid Requests / Active Volunteers / Shelters at Capacity), region-
scoped hazard map (split-view, smaller), Recent Activity feed, "Assigned to You" task list widget.

| Button | Type | On click → | Notes |
|---|---|---|---|
| KPI card (each) | Card | drills into the matching list screen (e.g. Active Incidents → `/ngo/incidents`) | |
| Declare Hazard Zone | Secondary (on map widget) | opens Declare Hazard Zone dialog → `POST /admin/hazard-zones` (role `ngo_admin` permitted per backend) | Resolve action is **not** available to NGO — admin-only, per roadmap |
| Task row (each, "Assigned to You") | List row | `/ngo/tasks?highlight={id}` | |
| "View Full Regional Overview" | Ghost link | `/ngo/dashboard` map expands to full-page (or dedicated full-map state) | |

#### Incidents — Pattern W-List · `/ngo/incidents`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Status filter tabs (Pending/Verified/In-Progress/Resolved) | Tabs | filters table | |
| Row: View | Icon | `/ngo/incidents/:id` | |
| Row: Verify | Icon (status.trust) | `PATCH /ngo/incident-reports/{id}/verify` | |
| Row: Update Status | Icon → dropdown | `PATCH /ngo/incident-reports/{id}/status` | |
| Row: Assign | Icon | opens Assign Task dialog | |

**Incident Detail (`/ngo/incidents/:id`):** same content as citizen Incident Detail plus a side
panel with reporter credibility score, Verify/Reject buttons, Assign Task button, internal notes
field.

#### Aid Requests — Pattern W-List · `/ngo/aid-requests`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Urgency filter chips | Chip filter | filters table | |
| Row: View | Icon | `/ngo/aid-requests/:id` | |
| Row: Assign | Icon | opens Assign Task dialog | |
| Row: Update Status | Icon → dropdown | `PATCH /aid-requests/{id}/status` | |

#### Missing Persons — Pattern W-List · `/ngo/missing-persons`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Row: View | Icon | `/ngo/missing-persons/:id` | Detail shows sightings + a map, mirrors citizen version with an added internal-notes side panel |

#### Tasks — Pattern W-Board (default) / W-List · `/ngo/tasks`

| Button | Type | On click → | Notes |
|---|---|---|---|
| View toggle (Board/List) | Segmented | switches layout, same data | |
| + New Task | Primary | opens Create Task dialog → `POST /task-assignments` | |
| Task card (drag between columns) | Card | `PATCH /task-assignments/{id}/status` | Board view |
| Task row: View / Reassign | Icon | opens detail panel / reassign dialog | List view |

#### Volunteers — Pattern W-List · `/ngo/volunteers`

*Visible in full to `ngo_admin`; `ngo_volunteer` sees a read-only version of this screen limited
to their own task history (no invite/deactivate controls).*

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Invite Volunteer | Primary | opens Invite dialog → `POST /ngo/volunteers/invitations` | `ngo_admin` only |
| Row: View Activity | Icon | opens volunteer's task/observation history panel | |
| Row: Deactivate | Icon (danger) | `PATCH /ngo/volunteers/{id}/deactivate` → confirm dialog | `ngo_admin` only |

#### Shelters — Pattern W-List · `/ngo/shelters`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Register Shelter | Primary | opens Register Shelter drawer → `POST /ngo/shelters` | |
| Row: View | Icon | `/ngo/shelters/:id` | |
| Row: Update Occupancy | Icon | opens inline occupancy editor → `PATCH /shelters/{id}/occupancy` | |
| Row: Edit | Icon | opens Edit Shelter drawer → `PATCH /shelters/{id}` | |

#### Campaigns — Pattern W-List · `/ngo/campaigns`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Create Campaign | Primary | opens Create Campaign drawer → `POST /donation-campaigns` | |
| Row: View | Icon | `/ngo/campaigns/:id` | |
| Row: Close Campaign | Icon | `POST /donation-campaigns/{id}/close` → confirm dialog | |

**Campaign Detail (`/ngo/campaigns/:id`):** donations list, "Allocate" (per donation, → `PATCH
/donations/{id}/allocate`, picks a target aid request), "Mark Delivered" (→ `PATCH
/donations/{id}/deliver`).

#### Alerts & Community Updates — Pattern W-List (tabs) · `/ngo/alerts`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Tab: Alerts | Tab | shows sent alerts list | |
| Broadcast Alert | Primary | opens Broadcast dialog → `POST /ngo/alerts/broadcast` | |
| Tab: Community Updates | Tab | shows posted updates list | |
| + New Update | Primary | opens Create Update dialog → `POST /community-updates` (NGO-scoped) | |
| Row: Edit / Delete (Community Updates) | Icon | edit dialog / confirm-delete | |

#### Field Observations — Pattern W-List · `/ngo/field-observations`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Log Observation | Primary | opens Log Observation drawer → `POST /field-observations` | Web-based logging option alongside volunteers' mobile submissions |
| Row: View | Icon | opens detail panel (photo, notes, location on mini-map) | |

#### Feedback — Pattern W-List · `/ngo/feedback`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Filter (by Aid Request / Campaign) | Dropdown | filters list | |
| Row: View | Icon | opens detail panel (rating, comments) | Read-only — feedback is citizen-submitted, no NGO write action here |

#### Coordination — Pattern W-List (tabs) / W-Conversation · `/ngo/coordination`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Tab: Escalations | Tab | shows escalation list | |
| + New Escalation | Primary | opens Escalate dialog → `POST /escalations` | |
| Row: Resolve | Icon | `PATCH /escalations/{id}/resolve` | |
| Tab: Messages | Tab | shows group-conversation list | |
| + New Group Conversation | Primary | opens participant-picker dialog → `POST /conversations {type: group}` | |
| Conversation row (each) | List row | opens thread in right pane (same pattern as citizen Message Thread) | |

#### Reports — Pattern W-List · `/ngo/reports`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Generate Report | Primary | opens Generate Report dialog (type + region + date range) → `POST /ngo/reports` | Async — row shows "Generating…" state until ready |
| Row: View | Icon | `/ngo/reports/:id` (preview + download link) | |

#### Organization Settings — Pattern W-Settings · `/ngo/settings/organization`

*`ngo_admin` only — hidden from sidebar entirely for `ngo_volunteer`.*

| Button | Type | On click → | Notes |
|---|---|---|---|
| Save (contact info section) | Primary | `PATCH /ngo/me` | |
| + Add Operational Region | Secondary | opens region picker dialog → `POST /ngo/me/regions` | |
| Remove region (× per chip) | Icon | `DELETE /ngo/me/regions/{regionID}` → confirm dialog | |
| Deactivate Organization | Danger-outline | `POST /ngo/me/deactivate` → confirm dialog | |

#### My Account — Pattern W-Settings · `/ngo/settings/account`

Same shape as Citizen's Edit Profile/Account Settings, scoped to the staff member's own account.

---

### 6.4 Admin Web

#### Dashboard — Pattern W-Dashboard · `/admin/dashboard`

KPI row (Active Alerts / Pending NGO Approvals / Open Incidents / Active Task Assignments /
System-wide Aid Requests), nationwide hazard heatmap (split-view), Recent Activity feed
(audit-log excerpt), Pending Approvals widget (NGO registrations awaiting decision).

| Button | Type | On click → | Notes |
|---|---|---|---|
| KPI card (each) | Card | drills into matching list screen | |
| Pending Approval row (each) | List row | `/admin/ngos/:id` | |
| "View Full Audit Log" | Ghost link | `/admin/audit-log` | |
| Region filter (top bar) | Dropdown | scopes dashboard + persists across admin screens | |

#### Hazard Zones & Predictions — Pattern W-Map-Split · `/admin/hazard-zones`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Status filter (Active/Resolved) | Tabs | filters list + map | |
| Date range picker | Input | filters by `from`/`to` | |
| + Declare Hazard Zone | Primary | opens Declare dialog → `POST /admin/hazard-zones` | |
| Zone row/marker (each) | Row/marker | `/admin/hazard-zones/:id` | |
| Row: Resolve | Icon | `PATCH /admin/hazard-zones/{id}/resolve` → confirm dialog | Admin/super_admin only |

**Hazard Zone Detail (`/admin/hazard-zones/:id`):** prediction metadata (confidence, model
version), linked incident reports list, Resolve button (if active).

#### Incident Reports — Pattern W-List · `/admin/incident-reports`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Status filter tabs | Tabs | filters table | |
| Sort: Priority Score | Column sort | `?sort=priority_score` | |
| Row: View | Icon | `/admin/incident-reports/:id` | |
| Row: Verify | Icon | `PATCH /admin/incident-reports/{id}/verify` | |
| Row: Reject | Icon | `PATCH /admin/incident-reports/{id}/reject` → reason dialog | |
| Row: Assign | Icon | opens Assign Task dialog | |

#### Alerts & Broadcasts — Pattern W-List (tabs) · `/admin/alerts`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Tab: Alerts (console) | Tab | shows full alert log, filterable by severity/source/date | |
| + Create Alert | Primary | opens Create Alert dialog → `POST /admin/alerts` | |
| Row: View Deliveries | Icon | opens delivery/acknowledgement breakdown panel (`GET /alerts/{id}/deliveries`) | |
| Tab: Broadcast | Tab | shows quick-broadcast form | |
| Send Broadcast | Critical-solid | `POST /admin/alerts/broadcast` → confirm dialog (irreversible, system-wide) | |
| Tab: Community Updates | Tab | shows posted updates (system-wide, admin-authored) | |
| + New Update | Primary | `POST /community-updates` | |

#### Task Assignments — Pattern W-Board / W-List · `/admin/tasks`

Same structure as NGO's Tasks screen, system-wide scope, with an added "Assign to NGO" field
(vs. NGO's screen which only assigns within itself/its volunteers).

| Button | Type | On click → | Notes |
|---|---|---|---|
| View toggle (Board/List) | Segmented | | |
| + New Assignment | Primary | opens Create Assignment dialog → `POST /task-assignments` | |
| Task card/row | Card/row | detail panel + reassign | |

#### Relief Operations Overview — Pattern W-List (tabs) · `/admin/relief-operations`

Read-only monitoring per the roadmap (M15 FE-8 has no admin write actions listed beyond what
Incident Reports/Tasks already cover).

| Button | Type | On click → | Notes |
|---|---|---|---|
| Tab: Missing Persons | Tab | `GET /admin/missing-persons` | |
| Tab: Donation Campaigns | Tab | `GET /admin/donation-campaigns` | |
| Tab: Aid Requests | Tab | `GET /admin/aid-requests` | |
| Row: View (any tab) | Icon | opens the matching detail panel (reuses citizen/NGO detail content, read-only for admin) | |

#### Escalations & Coordination — Pattern W-List (tabs) / W-Conversation · `/admin/escalations`

Structurally identical to NGO's Coordination screen, system-wide scope.

| Button | Type | On click → | Notes |
|---|---|---|---|
| Tab: Escalations | Tab | shows all open/resolved escalations, including auto-escalated (M15 FE-13) | |
| Row: Resolve | Icon | `PATCH /escalations/{id}/resolve` | |
| Row: Assign to NGO | Icon | opens picker dialog | |
| Tab: Messages | Tab | cross-org group conversations | |

#### Analytics — Pattern W-Dashboard · `/admin/analytics`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Date range picker | Input | rescopes all charts | |
| Region filter | Dropdown | rescopes all charts | |
| Chart widgets (Volunteer Activity, NGO Performance, Hazard Trends, Response Efficiency) | — | `GET /admin/analytics/overview` | Non-interactive display; export handled via Reports screen, not inline here |
| "Generate Report from this view" | Secondary | pre-fills Reports screen's Generate dialog with current filters | |

#### Reports — Pattern W-List · `/admin/reports`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Generate Report | Primary | opens Generate dialog (type: planning/resource_allocation/post_event_assessment + region + date) → `POST /admin/reports` | |
| Row: View/Download | Icon | `/admin/reports/:id` | |

#### Audit Log — Pattern W-List · `/admin/audit-log`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Filter (actor / target table / date range) | Inputs | `GET /admin/audit-log?...` | |
| Row: View Details | Icon | expands row inline to show full `metadata` JSON | Read-only, no actions — this table is a write-only sink from every other domain |

#### Users & Accounts — Pattern W-List · `/admin/users`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Search / role filter | Input/Dropdown | `GET /admin/accounts?...` | |
| Row: View | Icon | `/admin/users/:id` | |
| Row: Suspend/Reactivate | Icon | `PATCH /admin/accounts/{id}/status` → confirm dialog | |

**Account Detail (`/admin/users/:id`):** profile summary, credibility score + itemized history
(read-only, sourced from `credibility_events`), moderation-actions history list, action buttons:

| Button | Type | On click → | Notes |
|---|---|---|---|
| Suspend / Reactivate | Danger-outline / Secondary | `PATCH .../status` → confirm dialog | |
| + Log Moderation Action | Primary | opens dialog (type: warn/suspend/block/unblock + reason) → `POST /admin/accounts/{id}/moderation-actions` | |

#### NGOs — Pattern W-List · `/admin/ngos`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Status filter (Pending Approval/Active/Suspended/Rejected) | Tabs | filters table | |
| Row: View | Icon | `/admin/ngos/:id` | |
| Row: Approve | Icon (safe) | `POST /admin/ngos/{ngoID}/approve` → confirm dialog | Only for `pending_approval` rows |
| Row: Reject | Icon (critical) | `POST /admin/ngos/{ngoID}/reject` → reason dialog | Only for `pending_approval` rows |

**NGO Detail (`/admin/ngos/:id`):** org profile, operational regions map, volunteer roster (read-
only), Approve/Reject buttons (if pending).

#### Regions — Pattern W-List · `/admin/regions`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Level filter (Province/District/Tehsil) | Tabs | filters + drives hierarchical table indentation | |
| + Add Region | Primary | opens Add Region drawer (name, level, parent, boundary-upload/draw) → `POST /admin/regions` | |
| Row: View/Edit | Icon | `/admin/regions/:id` → edit drawer → `PATCH /admin/regions/{id}` | |

#### Facilities — Pattern W-List (tabs) · `/admin/facilities`

| Button | Type | On click → | Notes |
|---|---|---|---|
| Tab: Shelters | Tab | `GET /shelters` (system-wide, read/oversight — NGO owns write access via `/ngo/shelters`) | |
| Tab: Infrastructure | Tab | `GET /infrastructure` | |
| + Add Infrastructure | Primary | opens Add drawer → `POST /admin/infrastructure` | Infrastructure tab only |
| Row: Update Status (Infrastructure) | Icon | `PATCH /admin/infrastructure/{id}/status` | |
| Tab: Essential Locations | Tab | `GET /essential-locations` | |
| + Add Essential Location | Primary | opens Add drawer → `POST /admin/essential-locations` | |

#### Offline Map Packages — Pattern W-List · `/admin/offline-maps`

| Button | Type | On click → | Notes |
|---|---|---|---|
| + Register Package | Primary | opens dialog (region, package URL, version, size) → `POST /admin/offline-map-packages` | Generation itself is an out-of-band background job; this registers its output |
| Row: View | Icon | shows metadata, no further action | |

#### My Account — Pattern W-Settings · `/admin/settings/account`

Same shape as NGO's My Account.

---

## 7. Navigation & link-integrity audit

Every screen listed with (a) who links **to** it and (b) a count check against §6's button tables
— confirms no orphan screens (unreachable) and no dangling buttons (destination not defined
anywhere in §2/§6).

### 7.1 Citizen Web

| Screen | Linked from |
|---|---|
| `/app/onboarding/region` | Post-registration redirect (first login only) |
| `/app/home` | Login redirect, top nav "Home", logo click |
| `/app/map` | Top nav "Map", Home quick action, Home alert banner, Shelter Detail back, Incident Detail "View on Map", Resources "Navigate" actions |
| `/app/map/shelters/:id` | Map marker/list tap, Home "Nearby Shelters" quick action (via `?layer=shelters` then tap) |
| `/app/community` | Top nav "Community", Home "View All", Report Incident drawer close (returns here) |
| `/app/community/:id` | Community Feed card, Home report card, Map incident marker tooltip |
| `/app/resources` (+ tabs) | Top nav "Resources", Home "View All" (aid), Map bottom-panel actions |
| `/app/resources/aid/:id` | Aid tab row, Home aid card |
| `/app/resources/campaigns/:id` | Campaigns tab card, Profile "Donation History" rows |
| `/app/resources/missing-persons/:id` | Missing Persons tab card |
| `/app/navigate` | Home quick action, Map "Find Safe Route", Alert Takeover "Open Full Navigation", Shelter Detail "Navigate Here" |
| `/app/safety-groups` (+ `:id`) | Profile sub-nav, Home Family Safety "View Details" |
| `/app/messages/:id` | Incident Detail "Message", Aid Request Detail "Message" |
| `/app/profile` (+ sub-routes) | Avatar menu, top nav (implicit via avatar) |
| `/app/profile/ngo` | Profile sub-nav |
| `/app/profile/invitations` | Profile sub-nav, Notifications panel (invitation notification) |
| Alert Takeover (overlay) | Push/foreground trigger on active critical alert, deep link |
| Chatbot (overlay) | Top bar chat toggle, present everywhere |

Every citizen screen has ≥1 entry point; every button target above resolves to a route or overlay
defined in §2.2/§6.2.

### 7.2 NGO Web

| Screen | Linked from |
|---|---|
| `/ngo/dashboard` | Login redirect, sidebar "Dashboard", logo |
| `/ngo/incidents` (+ `:id`) | Sidebar, Dashboard KPI card, Task detail links |
| `/ngo/aid-requests` (+ `:id`) | Sidebar, Dashboard KPI card |
| `/ngo/missing-persons` (+ `:id`) | Sidebar |
| `/ngo/tasks` | Sidebar, Dashboard "Assigned to You" widget, Incidents/Aid Requests "Assign" action (opens dialog, not a nav — but the created task is then visible here) |
| `/ngo/volunteers` | Sidebar, Tasks reassign dialog ("view volunteer") |
| `/ngo/shelters` (+ `:id`) | Sidebar, Dashboard map widget |
| `/ngo/campaigns` (+ `:id`) | Sidebar |
| `/ngo/alerts` | Sidebar |
| `/ngo/field-observations` | Sidebar, Volunteers "View Activity" |
| `/ngo/feedback` | Sidebar |
| `/ngo/coordination` | Sidebar, Incident/Task escalation actions |
| `/ngo/reports` (+ `:id`) | Sidebar |
| `/ngo/settings/organization` | Sidebar footer, avatar menu (`ngo_admin` only) |
| `/ngo/settings/account` | Sidebar footer, avatar menu |

### 7.3 Admin Web

| Screen | Linked from |
|---|---|
| `/admin/dashboard` | Login redirect, sidebar "Dashboard", logo |
| `/admin/hazard-zones` (+ `:id`) | Sidebar, Dashboard KPI/map widget |
| `/admin/incident-reports` (+ `:id`) | Sidebar, Dashboard KPI card |
| `/admin/alerts` | Sidebar, Dashboard "Pending Approvals" is separate — this via KPI "Active Alerts" |
| `/admin/tasks` | Sidebar, Incident/Relief Ops "Assign" actions land created rows here |
| `/admin/relief-operations` | Sidebar, Dashboard KPI card |
| `/admin/escalations` | Sidebar, Incident Reports auto-escalation path |
| `/admin/analytics` | Sidebar |
| `/admin/reports` (+ `:id`) | Sidebar, Analytics "Generate Report from this view" |
| `/admin/audit-log` | Sidebar, Dashboard "View Full Audit Log" |
| `/admin/users` (+ `:id`) | Sidebar |
| `/admin/ngos` (+ `:id`) | Sidebar, Dashboard "Pending Approvals" widget |
| `/admin/regions` (+ `:id`) | Sidebar |
| `/admin/facilities` | Sidebar |
| `/admin/offline-maps` | Sidebar |
| `/admin/settings/account` | Sidebar footer, avatar menu |

---

## 8. Explicitly out of scope / deferred for web

- **Offline map packages (consumption)**: registering a package is an Admin web action (§6.4),
  but *downloading/using* an offline map is inherently a mobile-only capability (browser tabs
  can't persist large offline vector-tile packs the way `@rnmapbox/maps`'s offline manager does).
  No "download for offline" button exists anywhere in Citizen Web.
- **Background/always-on location sharing**: web's Safety Group location-sharing toggle only
  works while the browser tab is open and foregrounded (the browser Geolocation API has no
  background-task equivalent to `expo-task-manager`) — the toggle's helper text should say so
  explicitly, rather than implying mobile-equivalent behavior.
- **Native push notification action buttons** (e.g., "I'm Safe" answerable directly from the OS
  notification tray without opening the app): web push notifications support actions in some
  browsers but not reliably across the board — Alert Takeover is the guaranteed path for
  responding on web; a web push notification here is a *supplement* (tap → opens Alert Takeover),
  not a self-contained action surface the way mobile's Notifee integration is.
- **Voice/group calls**: specified (§6.2, §5) as an in-browser WebRTC overlay but flagged lower
  priority for the *citizen* web surface specifically — the mobile app is the primary field-use
  surface for this feature; web calling is a nice-to-have for citizens', NGO's, and Admin's desk-
  based coordination use, not a load-bearing crisis-response path.
- **Camera capture**: web uses a standard `<input type="file" accept="image/*,video/*" capture>`
  picker rather than a custom in-app camera UI — acceptable parity loss versus mobile's native
  camera, browsers don't offer an equivalent custom-camera-UI capability worth building for.

---

## 9. Cross-plan corrections found while building this document

Building the full FE-coverage matrix (§3) against every Module-1 FE surfaced two citizen-facing
screens the mobile plan (`MOBILE_DESIGN_PLAN.md`) omitted entirely. Both apply to mobile *and*
are included in this web plan (§6.2) — flagging here so the mobile plan gets patched to match,
not just the web one:

1. **NGO self-registration (M1 FE-7, citizen half)** — `POST /ngos/register` is callable by any
   logged-in citizen; the mobile plan's screen inventory never gave this a screen. Fix: add a
   "My NGO" section under mobile Profile (mirrors `/app/profile/ngo` here) — a status card (no
   NGO / pending / active) plus a "Register an NGO" form when none exists.
2. **Volunteer invitation response (M1 FE-9, citizen half)** — `GET /volunteer-invitations`,
   `PATCH .../accept`, `PATCH .../decline` are citizen-facing (an NGO invites an existing citizen
   account to volunteer; that citizen needs somewhere to see and respond to the invite). Fix: add
   an "Invitations" section under mobile Profile (mirrors `/app/profile/invitations` here),
   surfaced with a badge count if ≥1 pending, and also reachable from a notification tap.

Both will be patched into `MOBILE_DESIGN_PLAN.md` §4.2 (Profile & Account) as a follow-up edit.

---

## 10. Handoff checklist

- [ ] Import/reuse the token set and component library from `MOBILE_DESIGN_PLAN.md` §1–2 before
      building any web-specific screen — do not redefine colors/type/radii locally.
- [ ] Build the two navigation shells (Citizen top-nav, NGO/Admin sidebar) as reusable layout
      components before assembling individual screens.
- [ ] Build the data table, drawer, dialog, split-view, and board-view primitives (§5) — every
      list/detail screen in §6.3/§6.4 depends on these.
- [ ] Verify every route in §2 has a corresponding screen spec in §6, and every "On click →" target
      in §6 resolves to a route/overlay defined in §2 — §7's audit is the working checklist for this,
      re-run it after any screen is added or renamed at high-fidelity.
- [ ] Confirm `ngo_volunteer`-restricted screens/actions (Organization Settings hidden, Volunteers
      screen read-only) are modeled as a real permission check in the design tool's prototype
      interactions, not just a note in this doc.
- [ ] Design both a wide-desktop (≥1440px) and a laptop-width (1024–1439px) frame for every
      W-List/W-Dashboard/W-Map-Split screen — these are the two realistic usage widths for NGO/
      Admin staff; tablet-width Citizen Web frames matter more for that surface given field use.
- [ ] Run the same color-blindness simulation pass specified in the mobile plan's handoff
      checklist against this app's data-table status columns and chart palettes specifically —
      new surfaces (charts, board-view priority badges) that don't exist on mobile.
