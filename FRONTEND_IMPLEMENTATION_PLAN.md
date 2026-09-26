# LittleLife Web — Frontend Implementation Plan

**Status:** living document. Update the status column in each phase's route table as the Go
backend ships more of `IMPLEMENTATION_ROADMAP.md`; nothing else about a phase should need to
change when that happens — that's the entire point of the service-layer split in Phase 0.

**Working agreement — testing cadence (agreed 2026-09-24, applies from Phase 3):** testing is light per screen and
heavy per phase. **Per screen:** unit tests, a probe of any new backend routes, *one* focused real-backend E2E spec run
on its own, and the visual check. **Not run per screen:** the full E2E suite and the edge-case matrix — those are written
down in the phase's *Deferred tests* list and run at **phase end**, together with the full suite. Details, and why it's a
middle path rather than "all E2E at the end", are under *Cross-cutting testing strategy*.

## Progress so far

**Phase 0 — Foundation & Architecture: ✅ Done.**

**Phase 1 — Identity & Account Shell: ✅ Done.** Built, tested (unit + E2E against the
real local backend), and visually verified: Login, Register, Logout, Verify Email (OTP), the
onboarding profile-completion step, Forgot/Reset Password, Edit Profile (name portion), Account
Settings (deactivate/delete), My NGO (register + live status), Invitations, and — the first NGO
screen — Organization Settings, My Account for both NGO staff and platform admins, Volunteers
(the roster, invite, and remove), the first Admin screens — Users & Accounts with its account
detail — and NGOs (the applications inbox, every organisation, and approve/reject). That closes out the full auth-screen set plus every citizen `/app/profile/*` screen this
phase owns (steps 1–3 of Phase 1's build order), all of the NGO half of step 6, and step 7 —
Users & Accounts and, last, NGOs (list, detail, approve/reject), which closes **Phase 1**.

**Phase 2 — Geo Primitives: ✅ Done.** Admin Regions (the hierarchy tree, a region's boundary, add and edit,
and the organisations assigned to each region), the shared drill-down **region picker**, Organization Settings'
operational-region chips (add, remove), the admin NGO pages' regions (a card on the detail, a Regions column on the
list) and the citizen's **home region** — the optional onboarding step, its place on Edit Profile, and the profile
header line — are built, tested against the real backend and visually verified. The last three came after you added
the backend routes and the `home_region_id` field they were waiting for.

**Phase 3 — Facilities, Flood Intelligence & the Map: ✅ Done** (one screen, Offline Map Packages, skipped by decision — see below). The first screen, the citizen **Map** (`/app/map`), is
built, tested against the real backend and visually verified: the flood overlay drawn from real zone geometry, shelter /
infrastructure / essential-location markers behind layer chips, search, a selection card for a place or a zone, "Go to my location"
with the server's risk check, a legend, and a phone layout that switches between the map and a list. Building it on **real** data
found three things the mockups and the backend docs didn't say — the facility routes answer only per region, the flood pipeline
leaves every old zone active (~20 copies of each grid cell; a nationwide overlay was 6.7 MB when first probed), and the map's opening fit could be lost to
its own zoom animation — all recorded below. The second screen, **Shelter Detail** (`/app/map/shelters/:id`, reached from the map card's
View Details), is built too: the shelter's identity, capacity, an embedded map (the same `MapCanvas`) with the flood zones around it,
and the distance from the visitor on request. The third, **Resources** (`/app/resources`), is built as the hub's tab shell with its **Local
resources** tab live: the shelters, pharmacies, grocery stores and ATMs of the citizen's home region, filtered by kind, nearest first on
request, and a way to tell everyone a place is open or closed (a real report, filed under the citizen's own account). Its other three
tabs (Aid requests, Campaigns, Missing persons) are Phase 6's screens and show a placeholder. The fourth, the admin **Hazard Zones &
Predictions** (`/admin/hazard-zones` and `/:id`), is built: the paginated zone table beside a map with a confidence slider, the model's
predictions as a second view, declaring a zone (checked before anything is sent) and resolving one (asked first), and a page per zone.
The fifth, the NGO **Shelters** (`/ngo/shelters` and `/:id`), is built for both NGO roles: every shelter the organisation manages with its totals,
filters and search; occupancy updated inside the row (any staff); registering a shelter with a map to place it, and editing its status and
certification (admins only, since that is all the API lets them do); and a page per shelter with the map, the flood zones around it, and whether
citizens can see it at all. The sixth, the admin **Facilities** (`/admin/facilities`), is built: three tabs — **Shelters** (read-only oversight, with the organisation that runs each), **Infrastructure**
(add one, update its status) and **Essential locations** (add one, read its report log) — over a region scope, with a per-place map that says whether it sits inside an active hazard zone. The seventh and last, Offline Map Packages, is **skipped for now by decision (2026-09-25)**: the backend only stores a pointer to a bundle it does not generate and none exists yet (the five rows in the database are placeholders), the mockup is a build dashboard with no backing routes, and there is no list route. The thin version — register dialog, per-region lookup — is written up under *Offline Map Packages (skipped)* below and can be built once real packages exist. **The phase-end pass ran on 2026-09-25:** every deferred test that can be run against the real backend was written and run (81 new E2E tests in seven spec files, plus the unit tests each finding needed), the full E2E suite was run spec by spec with the guarded cleanup between files, and the pass found and fixed **nine real bugs** that no earlier test could have — four that stopped a keyboard user or took a phone page down, and a set of admin and NGO tables that were unusable at 768–1024px. Details under *Testing done so far (Phase-end pass)* and *Real bugs*. **Still waiting on decisions or on the backend:** the citizen floor on `POST /hazard-zones/risk-check` (deferred tests 6 and 13), what to call the score the model produces (see *Backend gaps*), and the four small product questions listed at the end of the phase-end section.

**Phase 4 — Trust: 🚧 in progress.** The first screen, **Safety Groups** (`/app/safety-groups` and `/:id`), is built, tested against the
real backend (two real browser contexts, one per person) and visually verified. The backend has **no group entity** — only pairwise connections between two
accounts — so the screen is the account's *circle*: how people can invite you (your email, and your Member ID with Copy), requests waiting on you (Accept / Decline),
the people you're connected to, requests you've sent (Cancel) and declined ones (Remove); an Invite dialog that takes an **email** (or, from a link underneath, a Member
ID); a page per connection with its facts and Remove; and a count on the sidebar's Safety Groups item for requests waiting on you. **People are shown by name, then email**
(both added to the API on your request, 2026-09-25) — except that the backend deliberately keeps a recipient's details from the person who asked until they accept, so a
request you sent shows the email you typed (remembered on this device), or "Member XXXXXXXX". The mockup's "Create group", member counts, check-in request and
per-member location switch have nothing behind them and are not built (see *Real deviations* and *Backend gaps found building Safety Groups*). The Profile sub-nav also
collapses to one button on a phone. The second screen, **Credibility** (`/app/profile/credibility`), is built too: the account's own score as a ring (from `GET /trust-score`), when it last changed, "Not scored yet" for an account that has never
been scored (the API's implicit `0` is not a score), and a plain account of what the score is for. The mockup's level, progress, statistics, "how to raise your score" and history have nothing behind them and are not drawn.
**Alert Preferences** (`/app/profile/alert-preferences`) is built: the four channel switches, the minimum severity as one radio group and the alert language,
each **saving the moment it changes** (only that field is sent; a live "Saving… / All changes saved"; a refused change puts the old value back and says why), with quiet hours and saved alert locations not drawn because
the API has neither. **Edit Profile's "remaining fields" turned out to be none** — the profile is a name and a home region and nothing else — so the page gained a read-only "Your account" card (the email, verified, member since)
instead. **Activity Timeline** (`/app/profile/activity`) is built too, once you added its route (`GET /profile/activity-timeline`, to the contract I wrote, 2026-09-25):
everything the account has reported, voted on, requested, donated or sighted, newest first, as first-person sentences (with status pills) under a heading per day, filterable by kind
(URL-mirrored), a page at a time with "Load more". A shelter's status report links to the shelter; every other subject is plain text until its screen exists. **Live location** — the plan's first real-time piece — is built into Safety Groups: one **Share my live location** switch (a browser
position watch sent over the relay's WebSocket to everyone connected), a **Live** badge on the rows of members who are sharing, and on a connected member's page a map with their position, when it was last heard and the coordinates. It rests on a reusable reconnecting-socket engine (backoff with jitter, a fresh token
on every attempt, a probe that tells a refused handshake from a dead network) that Phase 7's chat and navigation will use, and it is honest about the web's limits: sharing works only while the tab is open and in front. **Every Phase 4 screen is now built; the phase-end pass (full E2E suite and the deferred tests) has not been run.**

**Phase 5 — Community Intelligence: 🚧 in progress.** The first screen, the citizen **Community Feed** (`/app/community`), is built (2026-09-26),
tested against the real backend and visually verified: every report nationwide (one `bbox` request — reports carry no region) with the official
updates for the citizen's home region mixed in, **Latest / Verified / Nearby / Q&A** tabs, search and the three real category chips (all in the URL),
cards with a photo, status and **Upvote / Downvote** (the citizen's own vote pressed), and rejected reports hidden and counted (your decision).
Voting first waited for the backend — no route read which way a citizen voted, and you chose to wait rather than guess from browser storage; you then
added `GET /incident-reports/my-votes` to the contract (`supporting-material/backend-requests/incident-report-my-votes.md`, ✅ built 2026-09-26 on the
backend's `feature-report-my-votes` branch) and the buttons were wired the same day. The second screen, **Incident Detail** (`/app/community/:incidentId`), is
built too (2026-09-26): the report found in the feed's own list (there is no by-id route), its media, the large vote pair, a small map with the distance on request,
and a Progress timeline that only ticks what the API records — the screenshots caught it claiming a verification that never happened. The feed's cards now open it.
The Report Incident drawer is next.
Phase 4's phase-end pass has still not been run.

**Phases 6–10:** not started. Full detail on what's done and how lives in each phase's own
section below (each phase's Screens table has a Status column, ✅/🚧/⬜); this section is the
short version.

### Real deviations from the mockups, found and resolved while building (not silent departures)

- **Login's "Email or phone" field → "Email" only.** `POST /auth/login` only ever accepts
  `{email, password}` — there is no phone-login route anywhere in Identity.
- **Register dropped name, phone+SMS-OTP, and the language picker entirely.**
  `POST /auth/register` accepts exactly `{email, password}`. Confirmed with you: onboarding
  collects the rest afterward, gated, via profile `PATCH` routes — see below.
- **Verify Email dropped the mockup's SMS/voice-call framing for email delivery.** The backend's
  OTP is emailed only (`api/00-identity.md`) — never texted. Confirmed with you as the fix.
- **The region-picker onboarding step was deferred, then built in Phase 2.** At first there was no backend field
  anywhere to persist a citizen's home region (Profile only had `name`), so onboarding was name-only and
  `/app/onboarding/region` a placeholder. You then added `home_region_id` to the profile; the step now exists as an
  **optional, skippable** one after the two mandatory steps (see the *Home region* bullet below).
- **Mapbox → Leaflet** (§2.1) — decided before Phase 1 started, still holding.
- **Forgot Password never branches UI on whether the email is registered.** `POST
  /auth/password/forgot` always returns the same `200` regardless (deliberately
  enumeration-safe) — the screen shows one confirmation state, period; there is no "email not
  found" error to build, and building one would misrepresent what the backend actually does.
  `POST /auth/password/reset`, by contrast, genuinely is not enumeration-safe (a real `404` for
  an unknown email) — the backend's own deliberate asymmetry between the two routes, both
  surfaced as-is rather than smoothed over into fake-consistent frontend behavior.
- **Reset Password is a manual code-entry form, not a magic link.** First built as a
  click-a-link screen (read `email`/`token` from the URL only, gate the form behind their
  presence) — corrected per your steer that the real flow is "reset code to email/or logs,
  then provide this code along email... no magic links." Confirmed empirically against the real
  backend too: unlike the OTP's 6-digit code (rejected at the wrong length before it even
  reaches business logic), `POST /auth/password/reset`'s `token` has no length constraint at
  all — a 1-char, 6-char, and 40-char fake token all hit the identical `invalid or expired code`
  — and there's no real mailer in dev (the token is only server-logged), so a click-only screen
  would have nothing to click. `email`, `token`, and both password fields are now all real,
  editable form inputs (`schemas.ts`'s `resetPasswordSchema`); a `?email=&token=` URL still
  pre-fills them as a convenience (real email link, or one pasted from a dev server log) but is
  never required. Forgot Password's confirmation panel now also links forward into
  `/reset-password?email=...` so the flow has a next step to take, not just "back to login."
- **Edit Profile's sub-nav header drops the mockup's location/verified-badge/level chip.** The
  only real pixel reference for the shared W-Settings sub-nav (Batch 2 §2g "Profile ›
  Invitations") shows a header block with the account's home region ("Johi, Dadu"), a verified
  checkmark, and a credibility "Level 4" badge next to the name. The location has since arrived (the home region, Phase 2: the header shows "Sukkur City, Sukkur" when one is set); the verified badge and level are Trust (Phase 4, not built), so they are still left out. `ProfileSidebar` renders only real fields (`name`, the home region), same principle as every other deviation here: build what's real, don't fabricate the rest. Same
  reasoning for the mockup's "Invitations" nav item pending-count badge — first omitted (no real
  count), **now built** from the real `GET /volunteer-invitations` count once Invitations existed.
- **Account Settings has exactly two rows, not the mockup's full security panel.** Batch 4 NGO
  §4m ("My Account") is the closest pixel reference to a settings screen with destructive account
  rows, but it's staff-facing and mostly fictional relative to the real backend — 2FA, recovery
  codes, and an active-sessions list have no backing route anywhere in `api/00-identity.md`. Only
  its row *layout* (icon + title/description + trailing action, divided rows in one card) is
  reused; the content is exactly the two real routes `WEB_DESIGN_PLAN.md` §6.2 documents —
  Deactivate (caution icon, reversible) and Delete (critical icon, irreversible) — nothing else.
- **My NGO's status card needed a backend route that didn't exist — the backend added it.**
  `WEB_DESIGN_PLAN.md` §9 describes "a status card (no NGO / pending / active) plus a 'Register an
  NGO' form when none exists." The first build couldn't do that: `api/00-identity.md` had no route
  for a citizen to read back their own submission — `GET /ngo/me` resolves via `accounts.ngo_id`,
  which stays empty until an admin approves, so it 403s for exactly the accounts that need it —
  and the screen fell back to a session-only pending card that a reload forgot. **You hit that
  live** (submitted an NGO, reopened the page, got the register form again). The gap was real, not
  a frontend bug; you added **`GET /ngos/mine`** on the backend (latest submission by
  `created_by`, any status, same body as `GET /ngo/me`, `RequireAuth` + `RequireVerified`, `404`
  when none), and the screen now renders what the server says, so it survives a reload:
  `404` → the register form (an empty state, not an error — `getMyNgoRegistration` resolves it to
  `null`); `pending_approval` → status card, no form (a second submit would `409`); `rejected` →
  status card *and* the form again (a rejected row doesn't block a resubmit); `active` → status
  card with **Log in again** (approval promotes the account to `ngo_admin` and revokes its refresh
  tokens, but this session's access token still carries the old role); a real failure (`401`/`403`/
  network) → an error card with **Try again**, never the empty-state form. A successful submit
  invalidates the query and waits for the refetch, so the card that replaces the form is the
  server's real row, not one rebuilt from the thin `201` body. Deviations that remain: there is
  **no rejection reason** (the schema doesn't store one, so the card says "not approved" and no
  more), and `suspended`/`deactivated` (post-approval statuses) are typed and rendered defensively
  rather than designed. This web repo's copy of `api/00-identity.md` under `supporting-material/`
  predates the route — the backend's own doc is the authoritative one.
  Both `GET /ngos/mine` and `POST /ngos/register` are `RequireVerified`, not just `RequireAuth`
  (unlike `GET`/`PATCH /profile`), so the `window.__authStore` debug-hook technique (see below)
  correctly can't bypass them: a client-side-only-spoofed session gets a real
  `403 "email verification required"` from either. Those real `403`s are E2E-tested for real; the
  states that need a genuinely verified account (pending/rejected/active, and the submit-then-
  refetch swap) are covered by stubbing **only `GET /ngos/mine`** (and, for the submit test, the
  one `POST` response) with correctly-shaped fakes, so the real client code — query, status card,
  form swap, refetch, logout — still runs for real. A deliberate, narrow exception to "E2E hits
  the real backend," not a silent one. Lesson from this one: every original test passed while the
  reload behavior was wrong, because the states a reload changes were exactly the ones the suite
  couldn't reach for real — worth remembering when a "success" state is only reachable by stub.

- **Invitations builds the mockup's pending list, not its history or inviter detail.** Pixel
  reference: Batch 2 §2g "Profile › Invitations". Two parts of it have no backing data:
  `GET /volunteer-invitations` returns **pending invitations only**, so the mockup's "PAST · n"
  section (declined/accepted rows with dates) isn't built; and each row carries just `ngo_name` +
  `created_at`, so the card's meta line is "Invited <date>" instead of "Invited by <person> · <role>"
  plus a region/coverage line — nothing invented to fill the gap. Added beyond the mockup: an
  empty state, a load-failure card with **Try again**, and a per-card in-flight state. **Accept
  signs the user out on purpose**: the server promotes the account to `ngo_volunteer` and revokes
  its sessions, but this tab's access token still carries the old `user` role, so success runs the
  real `POST /auth/logout`, clears auth, and lands on `/login` with "You're now a volunteer with
  <NGO>…" (via `pendingMessage`) — matching the mockup's own copy, "you'll be signed out of the
  citizen app and continue in the NGO console" — and logging in again lands in `/ngo/dashboard`.
  No confirm dialog, again following the mockup (its info banner about one-role-per-account does
  that job). Decline touches nothing else on the account, so it just refetches and stays put. Any
  accept/decline failure (`404`, `409 "invitation is not pending"`, `409 "ngo is not active"`) shows
  the server's own message and refetches, since the likeliest cause is the invitation changing
  after the page loaded. `RequireAuth` only (not `RequireVerified`), unlike My NGO.

- **Organization Settings builds the profile card and the deactivate control; the rest of the
  mockup has nothing behind it.** Pixel reference: Batch 4 NGO §4l, plus `WEB_DESIGN_PLAN.md` §6.3's
  button table. Built from the real `GET`/`PATCH /ngo/me` and `POST /ngo/me/deactivate`: an initials
  tile, the name with its status badge and a real "Registered <month year>", and three editable
  fields — name, contact email, contact phone. Left out because no field or route exists: the logo
  upload (the camera badge), "Registration no.", the public description, the "Notifications &
  defaults" toggles, and the 7-item settings sub-nav (Team & roles / Integrations / Billing… have no
  screen — only Profile and Danger zone are real sections, so a one-page layout replaces it). The
  mockup's "Emergency phone" label became "Contact phone": the API just calls it `contact_phone`.
  **Operational regions were deferred, then built in Phase 2** (see the *Region picker* bullet below):
  `GET/POST/DELETE /ngo/me/regions` needed the shared region picker first, and a remove-only chip list
  would have been a half-feature. Two placement choices:
  Save/Discard sit at the foot of the card (§6.3: "Save (contact info section)") instead of the
  mockup's page-header bar, so they stay beside the fields on a phone; and the deactivate control
  borrows the critical-tinted row from §4m's "Leave organisation" since §4l has none. **Save sends
  only the fields that changed** — the API is a real partial patch and its doc warns that echoing an
  untouched `contact_email: ""` would clear it — and if trimming leaves nothing different it makes
  no request instead of tripping the API's "at least one field" `400`; the server's normalised
  response (e.g. the lower-cased email) is written back into the form. **Deactivation is one-way**
  (`POST /ngo/me/deactivate` has no reactivation route), so the confirm dialog leads with that, says
  staff aren't signed out or touched (the backend doesn't cascade), and names the one consequence
  it does enforce (no more volunteer invitations). Read from the backend: there's **no status guard
  on edits**, so a deactivated organisation is still editable — mirrored honestly rather than
  invented away; the deactivate button is simply replaced by a plain statement once it can only fail
  (`409 "ngo is not active"`). **`ngo_admin` only, enforced, not just hidden:** the sidebar already
  hid the link from volunteers (`adminOnly`), but the route now also sits behind a nested
  `RequireRole allowed={['ngo_admin']}` — a volunteer typing the URL is bounced to their landing
  route (`GET /ngo/me` itself is open to volunteers, so the frontend guard is the real gate for the
  screen; `PATCH`/deactivate would `403` server-side regardless).

- **My Account is one screen for four roles, and builds the real subset of the staff mockup.**
  Pixel reference: Batch 4 NGO §4m; `WEB_DESIGN_PLAN.md` §6.3/§6.4 say only "same shape as
  Citizen's Edit Profile/Account Settings, scoped to the staff member's own account" (the admin
  route is "same as NGO's"), so `/ngo/settings/account` and `/admin/settings/account` mount one
  `MyAccountPage` under their own layouts, for `ngo_admin`, `ngo_volunteer`, `admin` and
  `super_admin` alike. Three sections, each with its own state: **Profile** (avatar with initials,
  the name — editable via `PATCH /profile` — role chip, an organisation chip for NGO staff from
  `GET /ngo/me`, and the email read-only since no route changes it), **Password**
  (`PATCH /auth/password`, the first time that route is wired) and **Account** (deactivate/delete,
  the same two routes as the citizen screen). Left out because nothing backs them: the mockup's job
  title, mobile number, interface-language picker, notification toggles, 2FA, recovery codes,
  "Last changed 3 months ago", the active-sessions list, "Since <date>" (`GET /auth/me` has no
  created-at), and **"Leave organisation"** — the design's only destructive row for staff — which has
  no route. **Changing the password is a forced sign-out, not a "saved" toast:** the API revokes
  every refresh token — including the caller's own — and clears the cookie, so the session is dead
  even though the access token hasn't expired; per the doc's own instruction the page clears auth
  and goes to `/login` ("Your password was changed…"), and the E2E confirms the old session is
  really gone and the old password stops working. **Deactivate/delete are offered to every role,
  because the backend restricts neither** (read from the Go code: no role check, no "last admin" or
  "last NGO admin" guard) — so an `ngo_admin` or `super_admin` can delete themselves and leave an
  organisation or the platform without one. That's a product decision the API doesn't make for us;
  the copy for staff says they lose their console access too, but no extra guard was invented
  here — worth deciding whether the backend should refuse it. **Reuse, not copy:** the citizen
  Edit Profile and Account Settings screens' logic moved into two hooks (`useEditProfile`,
  `useAccountLifecycle`) that both screens now call, `AccountSettingsPanel`/`DeleteAccountDialog`
  gained optional copy/placement props, and the shared sign-out-after-a-revoking-action sequence
  became `useEndSession` — all with the citizen tests unchanged and green. The account menu's
  avatar dropdown in the NGO/Admin shell now links to My Account (the design's "Sidebar footer,
  avatar menu"). **Real data finding, unrelated to this screen:** two seeded accounts in the dev
  database (`admin@test.com` `super_admin`, `ngo-admin@test.com` `ngo_admin`) have **no profile
  row**, and the login screen calls `GET /profile`, so they cannot sign in through the web UI at all
  (`404 "profile not found"`); real staff are promoted citizens and always have one. A profile-load
  failure on this screen is handled anyway — it takes down only the name field, with a retry, while
  the password and account sections keep working.

- **Volunteers is the first W-List screen: the roster, invite and remove — for `ngo_admin` only, with
  no mockup and no activity history.** There is no Volunteers pixel reference in any batch, so the
  list borrows the nearest one (the NGO allocations table, Batch 4 §4f: uppercase 11px column labels
  over 48px rows, pill status badges) and `WEB_DESIGN_PLAN.md` §6.3's button table supplies the
  actions. Built from the real `GET /ngo/volunteers`, `POST /ngo/volunteers/invitations` and
  `PATCH /ngo/volunteers/{id}/deactivate`. **Not built, because nothing backs it:** the row's "View
  Activity" (task/observation history — no task or field-observation routes exist yet, Phase 7),
  any name column (rows carry `id`, `email`, `status`, `created_at` only; names live in the profile,
  which has no NGO-side route), a "joined" date (`created_at` is the *account's*, so the column says
  "Account created" rather than pretend), and search/filter/pagination (the roster is one unpaginated
  array and the spec lists none). **The volunteer's "read-only version" is dropped:** the doc (§6.3)
  says a volunteer sees a read-only, task-history-only view, but `GET /ngo/volunteers` is
  `ngo_admin`-only (verified: a volunteer gets `403 "insufficient permissions"`) and there is no task
  history yet, so there'd be nothing to show. Instead it follows Organization Settings: the sidebar
  link is `adminOnly` and the route sits behind the nested `RequireRole allowed={['ngo_admin']}`;
  revisit when Tasks exists. **"Deactivate" is labelled "Remove", on purpose.** The route is named
  deactivate, but it doesn't touch `accounts.status` — it clears `ngo_id`, resets the role to a
  plain citizen, and revokes their sessions; the account stays active. Calling that "Deactivate"
  would tell an admin the person's account is disabled, so the button and dialog say Remove and
  state exactly what happens (back to a citizen, not suspended or deleted, signed out, can be invited
  again — the E2E confirms the account is `active`, role `user`, and that the removed person can log
  straight back in to `/app/home`). **Three real backend gaps found by probing, none papered over:**
  (1) there is **no route listing the invitations an organisation has sent**, so a sent invitation is
  acknowledged with a page-level notice and then can't be seen again — the person appears on the
  roster only once they accept; (2) **duplicate invitations are allowed** — the same citizen invited
  twice gets two `201`s and two pending rows (`ngo_volunteer_invitations` has no uniqueness
  constraint), so they'd see two cards on their Invitations screen; (3) the API doc says an admin
  inviting themselves gets `400 "cannot invite yourself"`, but the role check runs first and they
  really get `409 "invited account must be a citizen…"`, a confusing message for a mistyped address —
  so the dialog catches the caller's own email client-side (no request) and says so plainly. Worth a
  backend follow-up for (1) and (2): a `GET /ngo/volunteers/invitations` and a unique partial index
  on pending `(ngo_id, invited_account_id)`. **The NGO's status is read only to avoid a certain
  failure:** `GET /ngo/me` (shared cache with Organization Settings and My Account) decides whether to
  show Invite; a deactivated organisation would get `409 "ngo is not active"`, so the button is
  replaced by a plain statement and removal stays available (the backend has no such guard on
  removal). If that lookup itself fails the button stays and the server keeps the final say.
  Removal refetches on success *and* on failure, since the likeliest failure is
  `403 "not a volunteer under your ngo"` because the roster changed after it loaded (E2E provokes
  exactly that by demoting the account in Postgres behind the open page).

- **Users & Accounts (list + detail) builds the real fields, searches and filters on its own, and
  adds the guards the backend lacks.** Pixel reference for the list: Batch 5 §5d (search, role
  pills, a status dropdown, a table with uppercase 11px column labels, a rows-per-page footer). The
  detail has no mockup, so it follows `WEB_DESIGN_PLAN.md` §6.4's text: profile summary, credibility,
  moderation history, Suspend/Reactivate, + Log Moderation Action. **An account summary carries only
  `id`, `email`, `role`, `status`, `email_verified` and two timestamps**, so the mockup's
  name/handle/phone, Organisation, Region, Reports and Credibility columns, its "Credibility < 50%"
  filter, and "Invite admin" (no route) are not built, and the detail has no name (profile names have
  no admin-side route). **Search and the role filter are done client-side, because the API can't:**
  `GET /admin/accounts` takes only `limit`/`offset` — the spec's "Search / role filter → `GET
  /admin/accounts?...`" isn't real. Rather than pretend a page of 20 is the platform,
  `getAllAccounts()` loads every account (pages of 100, in parallel after the first, de-duplicated
  by id in case signups shift the offsets, capped at 5,000 with a visible notice if it ever
  truncates) and the screen searches (email or a pasted id), filters (role, status) and pages that.
  Fine for a few thousand accounts, wrong past that; the real fix is server-side `q`/`role`/`status`
  parameters, and `getAllAccounts` is then the one function to swap. (When this was built the dev
  database held ~1,050 accounts, mostly E2E residue, so it ran for real at 11 requests a load; after
  the clean-up described in the debug-hook entry it holds ~100 and a load is one request.) **Status has a fourth
  value the doc omits, `pending_verification`** — 446 of ~980 accounts were in it when this was
  built; it's typed, badged and filterable (the Volunteers roster got the same shared badge).
  **Guards the backend doesn't have, added in the UI.** Verified against the real backend:
  `PATCH /admin/accounts/{id}/status` has no self- or role-guard — an admin suspending *themselves*
  gets `200` and is locked out on the spot (`403 "account is not active"`), and nothing stops
  suspending another admin or the last super admin. Your own account therefore gets no status or log
  controls (a moderation entry against yourself is a `400` server-side anyway) and says why;
  suspending another platform admin is allowed, and its dialog says it removes their console access.
  `reactivate` flips *any* non-active status to `active`, so on a `pending_verification` account it
  would activate it without the email ever being verified (verified: it comes back `active` with
  `email_verified: false`); Reactivate is offered only for suspended and deactivated accounts, and
  its dialog warns when the email is still unverified. Note the consequence: an unverified account
  that is suspended can only come back as `active`-but-unverified, never to `pending_verification`.
  **One confirmation, both effects.** The moderation log is a separate append-only record that does
  *not* follow status changes (its own doc says a UI should almost always do both), so Suspend/
  Reactivate asks for a required reason and, once the status change succeeds, saves it as a
  `suspend`/`unblock` log entry. The outcomes are kept apart on purpose: a `409` (already in that
  state — someone else got there first) is not an error, so it says so and refreshes; and if the
  status changed but the log entry didn't, the notice says the account **was** changed and where to
  record it, rather than an error that invites a second, failing attempt. The separate "Log
  moderation action" dialog (warn/suspend/block/unblock + reason) says plainly that it doesn't
  change the status. **Credibility is the score only.** `GET /accounts/{id}/trust-score` reports an
  implicit `0` with no `updated_at` for an account with no stored row — "never scored", not "scored
  zero" — so that shows as "Not scored yet"; the itemised history (`credibility_events`) is a later
  backend phase and the card says so. The bar assumes 0–100, which every stored score fits (the API
  states no scale). **Recorded-by names:** moderation entries carry only the recording admin's
  account id, so the few distinct ids are resolved to emails through `GET /admin/accounts/{id}`
  (cached) — "You" for yourself, a short id if a lookup fails. **The view lives in the URL** (search,
  role, status, page, rows per page), so a reload or Back from an account lands on the same view;
  see the real bug below for why that's mirrored from state rather than driven by it.

- **NGOs (list + detail + approve/reject) had no backend to build on — you added three routes — and
  builds the real fields only.** The first look found that the Identity admin group registered just
  `POST approve` and `POST reject`: with no way to list or open an NGO, an admin could never find a
  pending application, so approve/reject were unreachable from any screen (the plan's own route table
  had only ever listed those two). Per the standing rule, nothing was built against a guess: the
  contract was specified and you added **`GET /admin/ngos`** (paged like accounts, plus a `?status=`
  filter), **`GET /admin/ngos/{id}`** and **`GET /admin/ngos/{id}/volunteers`** (a `404` for an
  unknown NGO, so `[]` really means none). Items carry `created_by_email` (the applicant — what an
  admin needs to judge an application), `approved_by_email`/`approved_at`, and `volunteer_count`.
  **Verified against the real server, including what the doc doesn't say:** `approved_by_email`/
  `approved_at` are the admin's *decision*, whichever way — a rejected NGO carries them too, so the
  detail says "Rejected by …" or "Approved by …" from the status; and **approving an
  already-approved NGO returns `409 "this account is already affiliated with an ngo"`, not "ngo is
  not pending approval"** (that one is what rejecting an active NGO, or approving a rejected one,
  returns) — and the same message is also what a genuinely pending NGO gets if its applicant has since
  joined another organisation. So a `409` is never called "already decided": the notice says "Couldn't
  approve X: <the server's words>. The view has been refreshed." and the refreshed list tells the
  truth. **Approving really is two things:** the NGO turns `active`, and the applicant becomes
  `ngo_admin` with their sessions revoked (checked in Postgres: role and `ngo_id` set, zero live
  refresh tokens) — so the dialog says they must log in again, and the E2E confirms a reload of their
  old session bounces to login. **Rejecting touches nothing else** (the applicant stays a citizen and
  can apply again, which the E2E also confirms through My NGO); and because the route takes no body
  and the schema has no column for it, **there is no reason field** — the spec's "reason dialog"
  became a confirm dialog that says plainly no reason is recorded or shown (a field would promise
  something the system can't keep). **Choices worth knowing:** the list opens on **Pending approval**
  (the actionable tab; the mockup opens on Approved); tabs are the five real `ngo_status` values plus
  All (the mockup's "Approved" is `active`, and **Suspended will normally be empty — nothing in the
  API can set it**); and, like the accounts list, every organisation is loaded once (one request until
  there are 100) so the tabs, their counts and a search the API doesn't offer (name, contact email,
  applicant email, or a pasted id) are done client-side — the backend's `?status=` filter is unused.
  The view (tab, search, page, rows per page) lives in the URL, mirrored from state, and Back from an
  organisation returns to the same view. **Not built:** the mockup's tasks-done, response-time and feedback columns, its region and capability filters and "Export" (no data or routes), and the detail's **operational-regions map** (the map is Phase 3's component; the regions are listed instead — and the list gained a **Regions** column — once Phase 2's admin routes existed, see the *Admin coverage* bullet). Extras beyond the mockup: the applicant links to their
  account page and each volunteer links to theirs. **This finally makes the whole registration loop
  testable for real**, which nothing before could: a citizen submits through the real My NGO screen, an
  admin approves here, and the citizen logs back in as its NGO admin. The E2E only ever touches its own
  `E2E …` NGOs, found by a unique search — your two real pending applications are never clicked.

- **Admin Regions (Phase 2) — the API checks almost nothing, so the form does.** One route serves
  `/admin/regions` and `/admin/regions/:id` (an optional `:id`, so the filter and what's expanded survive
  moving between regions). Master–detail as in mockup §5f: a searchable, level-filterable province ›
  district › tehsil tree on the left (carets, sub-region counts; a search or level filter turns it into a
  flat list of matches with each one's parents underneath, since a match inside a collapsed branch would be
  invisible) and the selected region on the right — its path, level, sub-regions (with "Add district/tehsil"
  preset to that parent), the boundary, and id/created/updated. The URL is the selection and the filter
  rides along on every link; on a phone one pane shows at a time (the tree, or the region with an "All
  regions" way back). Add and Edit share one form in a new side-sheet `Drawer` primitive. **`GET /regions`
  is loaded once and everything is derived from it** — there is no per-region request — because the API has
  no pagination, no name search and **returns every region's full boundary in the list**; harmless for
  seven regions, not for a real import of hundreds of districts and tehsils (the fix belongs backend-side,
  e.g. an `include_boundary=false` option, and `getRegions` is the one function to adapt).
  **What the backend lets through, verified against the real API, and what the UI therefore enforces:**
  an open ring, a self-crossing bow-tie and longitude 200 all return `201`; a `MultiPolygon` or `Point` is a
  bare `500` (the column is `geometry(Polygon, 4326)`); a district can be created under a tehsil or with no parent, a province can be given one, and — when this was first built — `PATCH` saved a **parent cycle** (only "its own parent" was refused; the backend has since added a loop check, see the *Admin coverage* bullet). So the boundary field reads what is pasted or uploaded as it changes and lists *every* problem
  before saving — not JSON, not a Polygon (a `Feature`, or a one-feature `FeatureCollection`, is unwrapped;
  a `MultiPolygon` is refused with the reason), a ring that isn't closed or has under four points, a point
  outside ±180°/±90° (with a hint that longitude and latitude may be swapped), and a ring that crosses or
  touches itself (altitude values are dropped, since the column is 2-D) — and draws a valid one so a wrong
  shape is visible before it is saved. Parents are limited to exactly one level up and never the region
  itself or anything below it; a region that has sub-regions can't change level; a district or tehsil must
  have a parent (except one that already has none — the real data has one, so it stays editable). Edit
  sends **only the fields that changed** — an unchanged `parent_region_id: ""` would detach the region, and
  an empty patch is a `400` — and a save with nothing changed is caught before the request. A bare `500`
  on a save that sent a boundary is explained as the database refusing the shape rather than shown as
  "internal server error". **The map isn't here:** it is Phase 3's shared component, so the boundary is drawn
  as a flat SVG outline (longitude squeezed by cos(latitude), holes cut out, very dense rings thinned) with
  its ring/point count and extent, and can be downloaded as a `.geojson` `Feature` that the form's upload reads
  straight back. **Not built, because nothing backs it:** population/area/code, assigning an NGO from the page (only an NGO's own admin can change its coverage), "Import boundaries" (no bulk route),
  "View analytics", and **any delete** (there is no `DELETE /admin/regions` — and other tables reference
  `regions` by foreign key, so one wouldn't be casual). Extras: download, and adding a sub-region straight
  from its parent's page. **Large boundaries are handled on purpose:** the self-crossing check is quadratic if
  written the obvious way and froze the form on a pasted district-sized outline, so above ~400 segments it
  uses a grid sized to the average segment (200,000 points in ~0.2 s, versus ~5.7 s with a grid sized to the
  bounding box), tested for exact agreement with the pairwise version on random and tangled rings.

- **Region picker (Phase 2) — drill-down as the plan specified, plus search; and Organization Settings' regions.**
  `RegionPicker` (`src/features/regions/`, presentational, with `useRegionPicker` holding the drill-down trail,
  search text and the one chosen region) lists one level at a time — top level, or what's inside the region you
  opened — with a breadcrumb back up. **Every row is selectable at its own level** (an NGO can cover a whole
  province or a single tehsil), and a row with sub-regions has a *separate* arrow to open them, so choosing and
  browsing don't compete; rows are native radio buttons, so arrow keys and screen readers just work. Typing
  switches to a flat list across all levels with each result's parents (a drill-down alone is slow on hundreds
  of tehsils). A region can be marked unavailable with a reason — listed, disabled, never hidden — and what's
  inside it stays reachable. Regions with no parent (the API allows them, and the real data has one) sit at the
  top level rather than vanishing. The full region list carries every boundary, so **the picker only fetches
  it when it's opened** and shares the Admin Regions cache entry. **Organization Settings** gained an
  *Operational regions* card: removable chips (name + level), *Add region* (the picker in a dialog), and a
  confirm-first remove that says nothing is deleted and it can be re-added. Add and remove write straight into
  the cached list and refetch for the server's version; an add that finds the region already assigned (`409`,
  e.g. a teammate got there first — reproduced for real in the E2E by adding it through the API behind the
  page's back) or a remove that finds it already gone (`404`) shows the server's own words and refreshes. A
  region already covered is disabled in the picker so the normal path never sends a request the API would
  refuse. The card loads and fails on its own — a regions outage doesn't take the profile form down.
  **Where it deviates from the mockup:** §4l says regions are "assigned by NDMA — request changes below", but the
  API lets an NGO's own admin add and remove coverage, so that is what's built; whether that's the intended
  policy is a product question worth raising. **Not built:** nothing further here — what was missing (which NGOs cover a region; a region list on the NGO detail page) came with the admin routes described next. The same dialog and picker also serve the home region.

- **Admin coverage (Phase 2, once the backend routes existed).** You added `GET /admin/regions/{id}/ngos` and
  `GET /admin/ngos/{id}/regions`, `region_count` on every admin NGO, and a loop check on region `PATCH`; all were probed
  against the real server before building (shapes and error texts match the docs). **Admin Regions** gained a *NGOs
  covering this region* card — each organisation with its status, when *this* region was assigned, and how many regions
  and volunteers it has, linking to its page. It says plainly that only **direct assignments** are listed (an NGO on
  Sindh isn't listed under Sukkur), because an empty list there doesn't mean nobody can act in the region; it's a
  separate request per selected region and fails inside its own card. The **NGO detail** gained an *Operational regions*
  card (each region with its level, its full path — the API supplies it, so no region list is loaded — and assigned date,
  linking back to its Regions page), and the **NGOs list** a **Regions** column from `region_count` (no request per
  row; the E2E checks the count equals the length of the detail's list). Neither offers to assign or remove: only an NGO's
  own admin can change its coverage. **The loop check changed one thing:** the form already left out a region's
  descendants, so a refusal can only happen when someone else re-parented regions after the list loaded — reproduced for
  real in the E2E by turning a province into a district *under* the region from behind the page — and then the form shows
  the server's words plus "the list has been refreshed", refreshes it, and clears the stale parent choice (a retry would
  only be refused again). While adding the Regions column, the table's **Actions column turned out to clip** its Reject
  button at 1440px (found in the screenshot); the fixed columns were rebalanced and the button now ends exactly at the row's
  padding.

- **Home region (Phase 2, once `home_region_id` existed) — optional, and a race no unit test could see.** The backend
  accepts `home_region_id` on `PATCH /profile` (omit = unchanged, `""` = clear, a UUID = set, any level) and returns
  `home_region_id/name/level/path` on `GET /profile` — the keys **omitted entirely** while none is set — and treats it as
  optional and skippable. **Onboarding** (`/app/onboarding/region`, `WEB_DESIGN_PLAN.md` §6.2's full-viewport variant: brand
  mark, "Skip for now" top-right, heading, the shared picker, Continue disabled until something is chosen) comes after the
  name step for a citizen; staff go straight to their console. It is **never enforced by a guard** and nothing remembers a
  skip — the backend has no notion of a complete profile — so a later login lands in the app, and the home region is set,
  changed or removed on **Edit Profile** (a card with the region, its level and path, *Change* / *Remove*; the current one is
  listed in the picker but can't be picked again; removal is one click, no confirmation). The **profile header** shows it as
  "Sukkur City, Sukkur", built from `home_region_path` alone, so no region list is loaded to display it. Deviations from the
  spec: one-level drill-down with search instead of two columns (the shared picker), and Continue accepts a region at
  **any** level, since the API does. **The race:** the first real-backend E2E landed on `/app/home` instead of the region
  step, though the unit test passed. Marking the profile complete makes `RequireIncompleteProfile` redirect in the *same
  update* as the page's own `navigate()`, and the guard's redirect wins — the same shape as the Account Settings message
  bug. A unit test *with the real guard around the page* reproduces it, and the fix is the same idea as `pendingMessage`: a
  one-shot `postOnboardingRoute` in the auth store that the guard honours and the region step clears on arrival (dropped on
  sign-out so it can't leak to the next account; in memory only).

- **Map (Phase 3, first screen) — built on what the API really does, which is narrower than the mockup in three ways and
  wider in one.** `/app/map` is a full-height page (`CitizenLayout` gained a `fullBleed` mode: no page scroll, the map fills the
  space under the nav). From `md` up it is a 400px pane plus the map; on a phone the pane and the map are two views behind a
  **Map / List & filters** switch, with the layer chips and the selected card laid over the map. State lives in `MapPage`;
  `MapCanvas` (Leaflet, OSM tiles, polygons, `divIcon` markers, the control stack) and the pane parts are presentational, so the
  admin Hazard Zones screen can reuse `MapCanvas` with its own container. *(1) Places are region-scoped.* `GET /shelters`,
  `/infrastructure` and `/essential-locations` **require `region_id`** and answer with a spatial join — no bbox, no "nearby", no
  nationwide list — so the map asks once for each **top-level** region (a place inside a district is also returned for its
  province, so roots cover everything reachable; repeats are dropped) and filters in the browser. A layer that is off is never
  requested, and a region already fetched is never asked again. In this database 2 of the 8 infrastructure rows lie outside
  every region and **cannot be reached at all**. *(2) The chips are Flood · Shelters · Infrastructure · **Essentials**.* Reports
  and Missing Persons are left out until Phases 5 and 6 can put something in them; Essentials (ATMs, grocery stores, pharmacies)
  is added because the plan lists the markers and the data is real — an essential place nobody has reported on is **"Status
  unknown"**, never guessed open. *(3) Only what the API carries is on the cards.* No street address, no "run by <NGO>" (a shelter
  has only a `managed_by_ngo_id` and no public route turns it into a name), no distance until the viewer has been located; search
  is over the loaded places' name, type and status (there is no geocoder, so the mockup's "roads" is dropped from the placeholder)
  and over hazard risk/basis. *(4) Wider:* a pane list of "Active hazards in view" (a keyboard user can't focus an SVG polygon),
  the Essentials layer, and a legend that explains the colours in the map's own terms. **Flood rendering follows §2.3:** each zone
  is its real polygon, outlined by risk (low amber, medium orange, high red) and filled on a near-white → green → yellow → red ramp
  by `confidence_score`. The phase-end pass **settled what that score is** (it had first been read as "the model's confidence in the zone's risk level"): compared cell by cell with `map-preview`'s manifest, the stored `confidence_score` values of **all 197 cells**
are exactly that cell's `mean_prob` values above the ingest floor of 0.01, and **none** are its `peak_prob` — so it is the model's *mean flood probability* over the ~64 km box (about the share of it expected to flood), the honest value §2.3 asked for, and the
colour ramp is right. The card and legend still say "model confidence", which is the API's word for it and slightly overstates what it means (see *Backend gaps*); a zone an admin declared by hand has none and is one flat colour. The overlay is asked for by the visible box, rounded outwards to 0.1° so a
  small pan reuses the cached response, with the previous zones kept on screen while the next box loads. **Real data changed
  three decisions:** (a) the pipeline leaves every old zone active, so one grid cell arrives up to ~32 times with an identical
  boundary — the map keeps **one zone per distinct boundary** (worst risk, then most confident, then newest) in the map *and* the
  list; (b) drawn zones are ordered least-severe first so the worst sits on top, and the selected zone is brought to the front —
  a large low-risk cell had been covering a small high-risk one and swallowing its clicks; (c) the route had no size limit (nationwide, when probed: 19,989 zones, **6.7 MB**), so the
  map first refused to request views over 150 square degrees. **That guard is gone:** the backend then made the citizen overlay
  return only real flooding (model output under `medium` — confidence 0.34 — is never sent, and `?min_risk=` can only narrow it
  further; hand-declared zones always show) and gzip the response, which took the whole country to 640 zones, 218 KB (24 KB on the
  wire). The map now asks for whatever box is in view at any zoom, and a country-wide view is a useful overview (70 zones after
  collapsing repeats, verified in a browser). The legend says "Model zones under 34% confidence aren't shown"
  (`CITIZEN_MODEL_FLOOR` in `floodColor.ts`, the server's number). "Go to my location" is on demand only (nothing asks for the position on load); the
  server's `risk-check` gets the position rounded to three decimals and its answer is shown as given — inside a zone, how far
  the nearest one is, or none anywhere — with a **Show zone** button. **Not built:** the §2.3 minimum-probability slider (the server now enforces the citizen floor and offers no way
  under it; the slider is the admin overlay's `min_confidence`, so it belongs to Admin Hazard Zones), offline packages, and the mockup's Report Incident / Request Help buttons (Phases 5 and 6). **Two cautions for later:** the
  tiles come from OpenStreetMap's public server, whose usage policy doesn't allow production traffic (a tile provider is needed
  before launch); and every marker is a DOM node Leaflet keeps whether or not it is in view — fine at the current volume, but
  clustering or culling is needed if places run to thousands.

- **Shelter Detail (Phase 3, second screen) — the mobile spec's page, minus what the API doesn't carry, plus a map where the
  address would be.** There is no web mockup for it, only the button table (Back, Navigate Here) and the mobile spec's Pattern C
  (photo placeholder, name, status badge, capacity bar, certification badge, address and distance, a pinned Navigate Here), so the
  page follows those, from `GET /shelters/{id}` alone (public; a `404` for an unknown id, a `400` for one that isn't a UUID — both
  read as "Shelter not found"). **Built:** Back to map; a header with an **illustration in place of a photo** (the API has none, and
  a broken image is never shown) — a house, or a tent for a relief center, tinted green when open and red when closed; the name,
  what it is, the Open/Closed and certification badges; a **Capacity** card (the same meter as the map's card — 265 / 400, 66%,
  "Over capacity — 30 more than it holds." held at a full bar, "This shelter is closed right now.", and when it was last updated);
  a **Location** card; and a **Details** card (type, certification, registered, last updated). **Navigate Here** goes to
  `/app/navigate?destination_shelter_id=` (Phase 7, still a placeholder) and is **pinned to the bottom of a phone screen** as the
  mobile spec has it, beside the name from `md` up (one element, positioned by CSS, so it isn't in the page twice). **Deviations:**
  *(1) No address, so a map.* The API has coordinates and no street address, so the Location card shows the coordinates and an
  **embedded `MapCanvas`** — the shared map component, reused rather than rebuilt (Phase 3's exit criterion): the shelter's marker,
  selected, and the same citizen flood overlay the map draws for the box in view, so "is it in a flood zone?" is answered by looking.
  It opens about 35 km across (a model zone is ~60 km, so the zone's edges show), and the mouse wheel does not zoom it
  (`MapCanvas` gained a `scrollWheelZoom` option), so scrolling down the page isn't captured by it. *(2) Distance only on request.*
  Nothing asks for the position on load; **Show distance from me** (or the map's own locate button) does, then shows "15 km away",
  draws the visitor and fits the map to both places; a refusal is said in terms of the distance. *(3) Nothing about who runs it.*
  A shelter has only `managed_by_ngo_id`, and no public route turns it into a name, so — as on the map's card — there is no "run by".
  **Considered and left out:** reporting a shelter's status (`POST /shelters/{id}/status-reports`) — it is real, but advisory and
  **write-only** (no route reads a shelter's reports back, and the report never changes the shelter's own status), so the citizen
  could press it and never see any effect; it belongs with Resources › Local's report flow, if wanted at all. A **flood-risk line for
  the shelter** (the server's `risk-check` on its coordinates) is also left out for now: that route still counts model zones the
  citizen overlay hides (see *Backend gaps*), so it would say "inside a low-risk hazard zone" over a map showing none — worth adding
  once the backend applies the same floor. **Shared code touched:** the capacity meter and certification badge were lifted out of
  the map's `PlaceCard` into `src/features/shelters/` and are used by both; the location note's browser-status half became
  `LocationStatusNote`, used by both (`LocationNote` composes it); the map spec was re-run afterwards and passes.

- **Resources › Local (Phase 3, third screen) — the plan's tab shell rather than the mockup's overview, and only the part the API backs.**
  Two references disagree: the pixel mockup (Batch 3 §3c) is an *overview* page — five tiles, nearby shelters with a Navigate button,
  three emergency-contact numbers, "Missing persons near you", a preparedness-guide banner — while the later `WEB_DESIGN_PLAN.md` makes
  `/app/resources` a **tab shell** (`?tab=local|aid|campaigns|missing`) whose Local tab is category chips plus rows with **Navigate** and
  **Mark as Closed/Open**. The plan is the route contract, so that is what is built. **The shell:** a proper tablist (arrow keys, Home and
  End, one tab in the tab order, each tab naming its panel); the tab is in the URL, Local when absent or unknown, and `missing-persons`
  (the detail pages' back-link spelling) is accepted for `missing`; Aid requests, Campaigns and Missing persons show "Not built yet — ships
  in Phase 6" until that phase fills them. **The Local tab** lists **shelters and essential locations together** — the mockup's "nearby
  shelters" and the spec's shops — filtered by chips (All · Shelters · Pharmacies · Grocery stores · ATMs), each with its count. **Fuel
  and Water are not offered**: the API knows only three kinds of essential location (ATM, grocery store, pharmacy), so there is nothing
  to list under them. *(1) What "local" means.* The routes are region-scoped and there is no "nearby", so the list is the citizen's
  **home region** by default (a switch offers **Everywhere** — every top-level region, as the map does), and with no home region it lists
  everywhere and says how to set one. Nothing is asked for until the profile and the region list have both answered, so the wrong scope
  is never fetched first; the requests share the map's cache. **Nearest first** asks for the position only when pressed, then sorts by
  distance and shows each; otherwise the order is by name. Twenty-five rows show at a time with **Show more** (essential locations are
  described as bulk-imported, so a region may hold thousands). *(2) Reporting.* **Mark as closed / open** is
  `POST /essential-locations/{id}/status-reports` straight from the button, as the spec has it, with a notice ("Thanks — … is now shown
  as closed.") and a refetch, so what is shown is what the server now says. Verified against the real server: `current_status` on the list
  is the **latest** report, and flips back when the opposite is filed; the report is **attributed in the database to the account that
  pressed the button** although the API never returns who (the E2E reads it back); and another citizen, in another session, then sees the
  same status. A place nobody has reported on is "Status unknown" and offers **both** buttons; one reported open offers only "closed",
  and the reverse. The doc says the route does not check the place exists — the real server answers `404 "essential location not found"`,
  so a report about a place that has just gone says it wasn't sent and refreshes the list (provoked for real in the E2E by deleting the row
  behind the open page). *(3) Shelters have no report button:* `POST /shelters/{id}/status-reports` is advisory and write-only, so the row
  offers **Details** (to the Shelter page) instead, and shows the shelter's own open/closed, its occupancy bar and Navigate.
  *(4) Navigate:* a shelter goes to `/app/navigate?destination_shelter_id=` (as on the map); every other place to
  `/app/navigate?destination=<lat>,<lng>` — the spec's "destination=…", spelled out as coordinates. The route planner is Phase 7.
  **Not built, because nothing backs it:** the mockup's **Emergency contacts** (Rescue 1122, an NDMA number, Edhi 115 — static numbers with
  no source in the API or the docs; they need someone to confirm the right numbers before they go into a screen people rely on in an
  emergency), the **Flood preparedness guide** (no content), and the mockup's tile row and "Missing persons near you" (Phase 6's data).
  **Shared code touched:** `useMapRegions()` now also returns the citizen's `home` region; `placeGlyph` is exported from `placeIcon.tsx` so
  the list shows the same icons as the map's markers; and `LocationStatusNote` (split out for Shelter Detail) is reused for a refused location.

- **Hazard Zones & Predictions (Phase 3, fourth screen) — built on the backend's new admin routes, without the spec's "linked incident
  reports", and with the table and the map fed by different routes.** No pixel mockup exists, only the button table (status tabs, date
  range, Declare, a row → its page, Resolve) and "prediction metadata … linked incident reports … Resolve" for the detail. **The page**
  (`/admin/hazard-zones`, admin and super_admin) is W-Map-Split: from `lg` up the table sits left (filters fixed, rows scrolling) and the map
  right; on a phone it is **List | Map**, and the pane scrolls as one (the filters alone had filled the screen). **The table** is
  `GET /admin/hazard-zones`, a **paginated envelope** the server pages (20 / 50 / 100, with the range "1–20 of 3,982"), newest first, filtered
  by **Active / Resolved** and a **detected from / to** date range (start of the first day to the end of the last, in the viewer's time zone,
  as RFC 3339 — the API answers a malformed value with a hard `400`, so a range that runs backwards is refused on the page and nothing is
  asked). The view lives in the URL. Rows read "High-risk flood zone" (a model zone) or "…hazard zone" (a declared one), who made it, when,
  a short id (rows share titles), a status badge, and two icon buttons: **Show on map** and, for an active zone, **Resolve**. **The map is a
  different route** — `GET /admin/map/flood-overlay`: every *active* zone in the visible box, **low-confidence model output included** (the
  citizen overlay never returns a model zone under 34%, so the legend loses that note here), one per distinct boundary, with the **confidence
  slider** as `min_confidence` (declared zones have none and always stay; the request carries it only above zero). Because that overlay holds only active
  zones, the **Resolved** tab draws the table page's own zones instead (the table rows carry their boundary). **Show on map** fits the map to the zone and
  selects it, and the zone is drawn even if the slider or the box would have hidden it; a click on an outline opens the zone's page. The
  map's own view is only known once it has stopped moving, so "Use the map's current view" in the declare dialog gives the view the map last
  settled on. **Predictions** is a second view of the same page: `GET /admin/flood-predictions` (paginated the same way), newest first, each with its
  level, model version, the window it is valid for, and a confidence bar on the map's own ramp; a date range on when it was *generated*. There is no
  map here — a prediction has no geometry. **Declare hazard zone** (a dialog, built to be reused by the NGO dashboard, since an `ngo_admin`
  may declare too) takes a risk level and a boundary — pasted, uploaded as `.geojson`, or taken from the map's view — and checks it as it is typed with
  Phase 2's boundary rules (valid JSON, a single Polygon, a closed ring, real coordinates, no self-crossing, a `Feature` unwrapped, altitude dropped),
  drawing the outline and listing every problem before anything is sent; `source` is never asked for (the server derives it from the caller's role). The new zone
  is active at once, so the page switches to Active, first page, and points the map at it. **Verified against the real server: the backend checks none of it** —
  an open ring, a bow-tie and longitude 200 are all `201`, and a MultiPolygon or a Point is a bare `500` — so the client's checks are the only ones.
  **Resolve** asks first (the zone leaves the citizen map and stops counting in "am I in a hazard zone?" checks, and there is **no route to
  reactivate**, so the dialog says it can't be undone). An already-resolved zone is a **`400 "hazard zone is not active"`** — not the `409` other double
  transitions use — and an unknown one a `404`; both are reported ("… The list has been refreshed.") rather than left as an error in the dialog, and provoked for real in the E2E by
  resolving a zone in the database behind the open page. **The detail page** (`/admin/hazard-zones/:id`) reads `GET /hazard-zones/{id}` — the public tooltip shape, since
  there is **no admin route by id** — so it shows source, level, status, detected / resolved, the outline's size, the id, the prediction (confidence bar, model,
  validity window, forecast time) or, for a declared zone, that it has none, a map of the zone, and **Resolve** while active; it cannot show *which account*
  declared a zone or its region (those are only in the admin list). **Not built, because nothing backs it:** the spec's **linked incident reports** (no route
  relates a report to a zone), the declaring account's name, and a source filter on the table (see *Backend gaps*). **Shared code touched:** `MapCanvas`'s
  locate button and `onRecenter` became optional (this map has no use for the visitor's position), `MapLegend` takes `showCitizenFloor`, the zone sorting helpers are
  generic over the entry type (so the admin overlay's `source` survives them), and `parseBoundary` takes the noun for its two messages that say "region" — the
  Regions and Shelter Detail and citizen-map specs were re-run and pass.

- **NGO Shelters (Phase 3, fifth screen) — the mockup's list, plus a register drawer and an edit drawer that can only change two things, plus a detail page
  with a map; what each NGO role is offered follows what the API lets it do.** Pixel reference for the list: Batch 2 §2e (four figures, the table, the
  occupancy editor opened inside a row); the detail has no mockup, so it follows the citizen shelter page. **One read feeds the list:**
  `GET /ngo/shelters`, a direct filter on the managing organisation — unordered, unpaginated, no `region_id` on the rows (though the doc says it is the
  public shape) — so the order (by name), the four KPI figures (total capacity, occupied with its share, how many are at capacity, how many await
  certification), five filters (All · Open · Closed · At capacity · Pending certification, each counted *within the current search* so a pill never promises rows the
  search has hidden) and the search (name, kind, open/closed, certification wording) are all worked out in the browser; the view lives in the URL
  (`?show=&q=`), mirrored from state, and Back from a shelter returns to it. **Rows** carry a ring-tinted icon (the occupancy tone; grey when closed), the name, the
  kind and coordinates (the mockup's address line — the API has no street address), Open/Closed, certification, an occupancy bar, how long ago it changed, and
  **View / Update occupancy / Edit**. **Occupancy is edited inside the row** (one editor at a time; a stepper, and "of 450 · was 380 · 92% after save", or why a
  number is refused — empty, fractional, negative, over the capacity — *before* any request; Enter saves, Escape cancels, and the keyboard returns to the row's
  button when it closes, which a drawer would do for itself but an inline editor doesn't), and the same editor sits in the detail page's card. **The role split is the API's,
  verified:** occupancy is open to admin and volunteer alike; **registering and editing are `ngo_admin` only** (a volunteer gets `403 "insufficient permissions"`), so
  a volunteer is simply not offered those — the sidebar link is not admin-only, unlike Volunteers'. **Register drawer:** name, kind (shelter or relief center), capacity
  and the location — a small map (`LocationPicker`, new, in `src/features/map/`) where a click places a pin and dragging it adjusts, **or** the latitude and longitude typed
  (the fields are the source of truth; the pin follows them after a short pause and a click or drag writes them; the pin is deliberately not a tab stop, since it can't be
  moved from the keyboard), and **Use my location**, which asks the browser only when pressed. **The API checks almost none of it, so the form does:** longitude 200, latitude
  95 and a swapped pair are all `201`, and a Polygon, a three-number point and a capacity over 2,147,483,647 are bare `500`s (all verified) — the form names every problem
  at once, says when a "latitude" is beyond 90 but would be a fine longitude (they are probably the wrong way round), and accepts a capacity of 1 to 2,147,483,647. **It says up front what
  can't be undone:** a shelter's name, kind, capacity and place *can never be changed* afterwards (see *Backend gaps*). **And it says whether citizens will ever see the
  point:** the facility reads are per region, so a point outside every region is never returned to a citizen; the drawer (and the detail page) works out, in the browser with a
  point-in-polygon over the shared `GET /regions` list — fetched only while the drawer or page is open — either "In <region path> — citizens looking at that region will see it" or —
  for a point in no region — a note (the drawer: red, "can't be saved"; the detail page: the warning that citizens won't see it), and says nothing if the regions couldn't be loaded rather than saying
  "outside" wrongly. **The drawer goes further than that since real use — see *Location picker: shows the regions and refuses a point outside them*.** **Edit drawer:** `PATCH /shelters/{id}` takes exactly
  two fields — open/closed and certification — so those are the only controls; the name, kind, capacity and location are shown read-only with the reason; **only what changed is sent**
  (an empty patch is a `400`, and Save is off until something differs). **Detail page:** there is no NGO-side read by id, so it reads the public `GET /shelters/{id}` (same entry and same
  not-found rules as the citizen's page) and `GET /ngo/me` to tell whether the shelter is theirs; another organisation's shelter is shown read-only with a notice (the API would `403`
  every write to it), a shelter with no managing organisation counts as not theirs, and if the organisation lookup fails the controls are shown and the server keeps the final say. It
  reuses the citizen page's map section — the shelter's marker with the flood zones around it — now a shared component, and adds the region note and a "Managed by" row. **Not built:** the
  mockup's region chip ("Dadu · Jamshoro · Sehwan" — this list is by organisation, not region), an address, pagination (the API has none; fine for tens of shelters), a delete (there
  is none), and Navigate Here (it is the citizen's). **Shared code touched:** the citizen shelter page's map section became `ShelterLocation` (used by both pages), the capacity meter's tone
  maps moved to `capacityTones.ts`, `ShelterLocationCard` takes `children`, `ShelterFactsCard` takes extra rows, `ShelterDetailState` takes its back link, `MapCanvas` exports `MapResizer`
  and the tile URL moved to `tiles.ts` (the one file to change for the production tile provider the *Map* bullet says is needed), and a global rule now wraps the selected-marker tooltip — the
  citizen-map and Shelter Detail specs were re-run and pass.

- **Facilities (Phase 3, sixth screen) — three tabs over region-scoped reads: shelters as oversight, infrastructure you can add to and re-status, essential locations you can add to and audit; nothing can
  be edited or deleted, because the API has no route to.** Pixel reference: Batch 5 §5g (search, type pills, a table with uppercase labels and ring-tinted icons, an Add drawer with a pin); the spec is the
  button table (three tabs, Add Infrastructure, Update Status, Add Essential Location). **There is no system-wide read** — the spec's "`GET /shelters` (system-wide)" isn't real: every list needs a
  `region_id` (verified again, for all three) — so **"everywhere" is one request per top-level region** (as the citizen map does) and a chosen region is one request. The scope control (mockup's "Sindh ▾") is a button
  that opens the shared region picker at any level, with an × back to everywhere; it lives in the URL (`?region=`), and an id in the URL that isn't a region is treated as everywhere, with a notice, **rather than sent**
  (a malformed one would be a `400`). Nothing is asked until the region list has loaded; only the **tab that is showing** is read; the reads use the citizen map's own cache keys, so a region read anywhere is not read again;
  and if some regions' requests fail the rest are still shown, with a notice that the list **may be missing places** and a retry — a partial list that looked complete would be worse than none. Search, two pill
  groups (type, status, each counted within the search and the other group), paging (20 / 50 / 100) and a natural sort by name ("Pharmacy 2" before "Pharmacy 12") are all done in the browser, and the view (tab, region,
  search, filters, page) lives in the URL, mirrored from state. **Shelters — oversight, not management:** name, kind and coordinates (no address), **the organisation, as a name** (a shelter carries only
  `managed_by_ngo_id`, but an admin can read `GET /admin/ngos`, so it is looked up — linking to that organisation's page; "No organisation" for a shelter nobody manages; "An organisation" if the names can't be loaded,
  with a notice), open/closed, certification, occupancy, when it changed — and the search reaches the organisation's name. There is no Add and no edit: shelters belong to the organisation that runs them. **Infrastructure:**
  the kind, coordinates, a status badge, when the status was last set, when it was added; **Update status** opens a dialog (safe / at risk / damaged, the current one marked, any status may follow any other) and **saving
  the status it already has is a real `200` that moves "last updated"** (verified) — so it is offered, as **Confirm status**, with a line saying that is all it does — and a `404` (someone removed it) closes the dialog
  with "no longer exists … the list has been refreshed". **Add infrastructure** takes a name, a type and a point, and says up front that it **starts as Safe** and that its name, type and position can't be changed and it
  can't be removed. **Essential locations:** the latest reported status — **"Status unknown", never open, for a place nobody has reported on** — when it was reported, when it was added; **Status reports** opens the place's
  whole report log, newest first, with the one citizens see marked (this is the only screen that reads `GET …/status-reports`; the reporter is never returned, and the dialog says any account can report as often as it
  likes); **Add essential location** says it is the manual fallback (these are meant to be bulk-imported) and that it starts with no status, since only a citizen's report gives it one. **The Location dialog replaces the
  mockup's "Hazard" column and "41 in flood zones" count**, which need a hazard check per place and the API only checks one point at a time: each row's map-pin opens a map of the place with the active zones (**the admin
  overlay — every active zone, low-confidence model output included, which citizens are never shown**), its coordinates, which region it is in (or the warning that it is in none), and whether it lies **inside an active hazard
  zone** — worked out by a point-in-polygon against a small fixed box around the point rather than whatever is in view, so panning can't change the answer, and never "clear" when the zones couldn't be loaded — with a link to
  that zone's page. **What the API lets an admin do to a bad point is nothing:** verified for infrastructure and essential locations exactly as for shelters — longitude 200, latitude 95, a swapped pair and a point outside
  every region are all `201`, a Polygon or a three-number point is a bare `500`, duplicate names are allowed — and **a place outside every region is created but no route can ever list, edit or delete it** (the first version's E2E added
  one and proved no region query returns it; the UI no longer lets one be added). So both Add drawers use the coordinate rules and location fields that were **extracted from the shelter register form** (`pointForm`, `PointFields`, `usePointPicker`,
  `CoverageNote`) — every problem named at once, the swapped-coordinates hint, a click or drag on the map writing the fields, "Use my location" on demand — *first* warned before saving that a point in no
  region "can't be found, corrected or removed later" and said so in the notice after; **they now refuse such a point** (see *Location picker: shows the regions and refuses a point outside them*), and the
  notice after saving says which region it is in ("It is in Sindh › Sukkur"), worked out from the values submitted. **Not built, because nothing backs it:** the mockup's kinds (depot, helipad, water point, command post — the API has hospital, bridge and utility), its Contact fields, "Capacity / stock", the Hazard column and
  count, an initial status on Add (the route can't set one), editing a name or position, any delete, and a shelter detail (admins have none). **Roles:** the Admin route group; an `ngo_admin` and a citizen are bounced from
  the page and refused `403 "insufficient permissions"` by every admin write (verified). **Shared code touched:** a generic `TabBar` (extracted from the Resources tab list, which now uses it), the coordinate rules,
  location fields and picker hook (extracted from the NGO's Register Shelter drawer, which now uses them), `CoverageNote` (moved to `src/features/regions/`, with an optional extra sentence) and a pure `coverageFor` — the
  NGO shelters and citizen Resources specs were re-run and pass.
- **Location picker: shows the regions and refuses a point outside them (a follow-up, after real use of NGO Shelters and Facilities).** Found by using it: an NGO admin registered
  two shelters (“me moiz ho” at 67.37°E 30.37°N and “test” at 69.83°E 31.02°N — Balochistan / Khyber Pakhtunkhwa, north of every region the platform has) and they showed in the
  NGO's own list but in no admin list, no citizen map and no Resources tab. Nothing was wrong with the filter: every facility read is per region by a spatial join, the NGO's list
  is by organisation, and the API accepts a point in no region (`201`), so the shelter exists and is unreachable. The warning the drawer already showed was easy to miss, and
  asking people to know what regions exist is the wrong demand. **What changed, for the NGO's Register Shelter drawer and the admin's two Add drawers (all three share the
  picker):** (1) the map draws **every region as a shaded shape** (`GET /regions` boundaries — already fetched for the coverage note — widest level first so a district sits over
  its province; hovering names the area; a click on a shape still places the pin) with a line saying places can only be added inside the shaded areas; (2) it **opens framed on
  all the shaded areas** (once, when they arrive, and only if there is no pin yet) instead of on the whole country; (3) a **“Jump to an area…” menu** lists every region by its
  whole path (`Sindh › Sukkur`, tree order, native `<select>` so a phone gets its own picker) and brings the map to the one chosen; (4) a point typed or found by “Use my
  location” that is in no region is shown **together with the shaded areas**, not zoomed into a blank map; (5) the note under the map — moved up to sit right under it, where a
  click's result is seen — is now red and plain: “This spot is outside the shaded areas, so it can't be saved — nobody would ever see a place here. Click inside a shaded area, or
  check the coordinates”, plus what to do (the NGO: ask an administrator to add the area; the admin: add a region under Regions first); (6) **saving is refused**: the submit
  handler works out coverage from the values being submitted (not from the 300 ms-settled display), sets an error on the latitude (“Pick a spot inside a shaded area of the
  map.”), focuses it and scrolls it into view, and sends nothing. **Decisions worth knowing:** it blocks rather than warns because a place outside every region is one no one can
  ever see, list, correct or remove (there is no delete); it **fails open** — if the regions couldn't be loaded, or there are none, coverage is “can't tell” and the API decides,
  so a failed request can never stop someone registering; and the consequence for real use is that **places outside the regions that exist can't be added until an admin adds a
  region** (today the platform has Sindh and a few test areas), which the message says. The two shelters already saved outside remain (no delete route; the NGO detail page still
  says citizens won't see them) — a new region over them makes them appear at once, as regions are matched live. **Not built:** a place-name search on the picker, drawing regions
  lighter or by level (all are one shade; nested ones read darker where they overlap), an NGO-list badge for a shelter that is in no region (nothing new can be created that way
  now). **Code:** `regions/coverageAreas.ts` (which regions can be drawn, the box around them, the menu's entries), `useRegionList`, `usePointPicker` returning `areas` and
  `coverageAt`, `CoverageNote` with a `blocking` mode (a place that already exists keeps the old wording), `OUTSIDE_AREAS_MESSAGE`, and a one-line CSS rule removing the focus
  ring a click leaves on a shaded shape.


- **A second onboarding gate, not just email verification.** Your framing ("onboarding... they
  can't skip this... patch the profile accordingly") made profile-completion (`name`) an equally
  mandatory second gate, chained after verification. `RequireRole` (`src/routes/guards.tsx`) now
  checks both `emailVerified` and `profileComplete`; two new guards —
  `RequireUnverifiedSession` (`/verify-email`) and `RequireIncompleteProfile`
  (`/app/onboarding/profile`) — enforce each step can only be reached in the right window, in
  both directions (can't skip ahead, can't revisit a completed step). `nextAuthRoute()`
  (`src/store/auth.ts`) is the single "what's next" function every auth-flow screen navigates
  through and what the guards enforce, so the two can never drift apart.
- **No dev proxy.** The backend now allows CORS from the Vite origin directly (fixed
  backend-side, verified live) — removed the Origin-rewrite proxy workaround from
  `vite.config.ts` entirely; the app calls `http://localhost:8080/api/v1` directly via
  `.env.local`'s `VITE_API_BASE_URL`.
- **A dev-only debug hook** (`window.__authStore`, set in `App.tsx` behind
  `import.meta.env.DEV` — compiled away from production builds) — lets manual/E2E checks set
  auth state directly to reach onboarding-gated screens for visual verification without a real
  OTP, which isn't obtainable through any response body (the backend only logs it server-side).
  First actually exercised in a committed test with Edit Profile (`e2e/profile-edit.spec.ts`) —
  register + log in for a real cookie session, then flip `emailVerified`/`profileComplete`
  client-side so the route guards let the test through; every subsequent API call (`GET`/`PATCH
  /profile`) still hits the real backend with that real session, only the guard's opinion is
  faked. Must navigate client-side after the override (`history.pushState` + a `popstate`
  event), never `page.goto` — a hard reload re-bootstraps auth from the real, still-unverified
  cookie session and wipes the override. Doing the override while still mounted on a route whose
  own guard reacts to it (e.g. `/verify-email`) also races that guard's own redirect effect —
  let it settle first, then navigate again. **Its real limit, found building My NGO:** it only
  fools *frontend route guards*, which read the client-side store — a backend route that itself
  checks verification status server-side (`RequireVerified`, e.g. `POST /ngos/register`) still
  correctly rejects the real access token, which genuinely still carries `email_verified: false`.
  Only `RequireAuth`-only routes (`GET`/`PATCH /profile`, `POST /auth/me/deactivate`, etc.) are
  reachable this way; `RequireVerified` ones (`GET /ngos/mine`, `POST /ngos/register`) are not.
  (Dead end explored while looking for a workaround: the real OTP isn't recoverable from the
  backend's data stores — Redis holds a hash of it, not the plaintext. **The workaround that does
  work, first used for Invitations:** web sessions may read the backend freely and seed rows into
  *existing* Postgres tables (never schema changes, never backend code), so `e2e/helpers/seed.ts`
  marks a freshly-registered `e2e-` account verified + active and gives it a profile name *before*
  its first login — the token's `email_verified` claim is minted at login, so the session is
  genuinely verified and onboarded. No `window.__authStore` spoofing and no stubbed responses; it
  reaches `RequireVerified` routes and every screen behind the onboarding gates for real. The
  helper only ever writes to `e2e-` accounts / `E2E ` NGOs. Those rows are never deleted, so they
  accumulate in the dev database run after run — and `seedPendingInvitation`'s throwaway "founder"
  admin was originally inserted with **no password hash**, which the backend couldn't load (a `500`
  on any query touching it, including the default page of `GET /admin/accounts`; 40 such
  `e2e-founder-*` rows had piled up before it was noticed). Founders now copy the invited account's
  hash, so new runs no longer create unloadable accounts. **Cleaned up once, by hand:** after a
  dry run in a rolled-back transaction, all 1,086 `e2e-…@example.com` accounts and 310 `E2E ` NGOs
  (with their profiles, alert preferences, trust scores, moderation entries, invitations and refresh
  tokens) were deleted in one guarded transaction — the dev database went from 1,189 to 103 accounts
  and 326 to 16 NGOs, every real row untouched, and before deleting anything it was checked that no
  foreign key crossed the test/real boundary in either direction. **Nothing deletes them
  automatically**: a full E2E run adds a hundred or so accounts, so they accumulate again (and the
  Users & Accounts list grows with them, since it loads every account). This makes My NGO's stubbed states
  (pending/rejected/active) replaceable with real ones — a follow-up, not yet done.)
- **`ProfileLayout` — a new shared shell for every `/app/profile/*` screen**, nested inside
  `CitizenLayout`'s own `<Outlet>` (so it only owns the sidebar/content split, not the top nav).
  Fetches the account's `name` once via a shared `PROFILE_QUERY_KEY` (`src/api/profiling.ts`) so
  the sidebar header and Edit Profile's form read the same TanStack Query cache entry instead of
  both fetching independently — and a successful `PATCH /profile` writes straight into that same
  cache entry (`queryClient.setQueryData`), so the sidebar's name updates immediately with no
  second round trip. Every `/app/profile/*` route (built or still a placeholder) is nested under
  it, so the sub-nav stays present and consistent while navigating between them instead of
  flickering in and out per-screen.
- **Cross-screen handoff to /login via a one-shot auth-store field, not router `state`.**
  `ResetPasswordPage` and Account Settings' deactivate/delete all return no session to carry
  forward, so a redirect + message is the only way to close the loop — `LoginForm` shows it as a
  status banner, hidden the moment a real `serverError` also appears so it never looks like stale
  advice sitting next to a fresh failure. First built as `navigate('/login', {state:
  {infoMessage}})`, which worked fine for Reset Password (a pre-auth screen, nothing else
  competing for `/login`'s next render) but silently lost the message for Account Settings — see
  the real-bug entry below for why, and `pendingMessage`'s own comment in `store/auth.ts` for the
  fix. No toast/notification infrastructure was built for this — still a targeted, one-off
  pattern for "screen A tells screen B something after a redirect," just backed by the store
  instead of router state now that a second, guarded-route caller exists.
- **A generic `Dialog` primitive** (`src/components/ui/dialog.tsx`, wrapping
  `@radix-ui/react-dialog`) — first real consumer is Account Settings' Deactivate/Delete confirm
  dialogs, built generically (not Account-Settings-specific) since "opens confirm dialog" /
  "opens password-confirmation dialog" recurs across nearly every later NGO/Admin screen's own
  button spec (`WEB_DESIGN_PLAN.md`'s "On click →" column). Same shadcn-pattern-not-CLI approach
  as every other component here.
- **MSW's role expanded slightly beyond Phase 7's original scope.** Still the mocking layer for
  not-yet-built domains as planned, but also used with per-test `server.use()` overrides for
  deterministic unit tests of *built* domains (Login/Register/Verify/Onboarding's own tests) —
  cheaper and more reliable than hitting the real network in a unit test, while E2E still runs
  against the real backend for the same flows.

- **Safety Groups: no groups, no "Create group" (Phase 4).** The mockup (Batch 3 §3e) and `WEB_DESIGN_PLAN.md` picture named groups ("Rehman family · 5 members · created
  by you · check-in requested 42 min ago") with a Create Group button, a member list with Safe / No response / Need help counts, "Add member" and "Request check-in". The backend has
  none of that: `safety_connections` is one row per *pair* of accounts with a `family` / `safety_group` type. So the screen shows the circle as sections (Requests for you ·
  Connected · Waiting for a reply · Declined); the primary action is **Invite member** (not Create Group); nothing about group names, member counts, safe/need-help status or
  check-ins is drawn, because none of it exists to draw. The route keeps its own URL (`/app/safety-groups`, per §2) but renders inside the Profile sub-nav (the mockup and the sidebar both
  put it there). The per-member **live-location switch** is not on the detail page — it needs the WebSocket, which is its own build step — so nothing on the page pretends to share a location yet.
- **Safety Groups: people are shown by name, then email — but an outgoing request shows what *you* typed (Phase 4).** The connection object carries `requester_name/email` and `recipient_name/email`
  (added 2026-09-25). The backend's rule (`06-trust.md`, *who sees whom*): you always see your own; once accepted both see each other's; until then the person asked sees who is asking, but the
  **requester sees nothing about the recipient — even after a decline** (account ids are public, so answering a request-by-id with an email would turn any id into an address). So the label is
  name → email → "Member 8D0D395C", and a request you sent would always be the last. The email you typed when inviting is therefore remembered on this device (`localStorage`, keyed by your own
  account id, only what you entered, guarded because storage can throw) and put back on that row until the real details arrive; a request sent by Member ID, or after the storage is cleared, shows "Member …".
- **Inviting is by email, with the Member ID still offered.** `POST /safety-connections` takes `recipient_email` (the default in the dialog; the server trims and lowercases it) or `recipient_account_id`.
  Only the *shape* of what's typed is checked in the browser. Everything else is the server's call and shown in its own words — your own email/id, an existing or crossed request, an accepted
  connection — except "recipient account not found", which is put in plainer terms ("We couldn't find an active LittleLife member with that email"), because it also covers an account that exists but
  isn't an active citizen (unverified, suspended, an NGO or admin account) and the server deliberately doesn't say which. The list page's "How people invite you" card shows your email and your Member ID (Copy).

- **Credibility: score only, in a white card with a teal ring (Phase 4).** The mockup (Batch 3 §3h) is a pink gradient hero — a ring at 88, "Level 4 · Trusted reporter", "Your reports are verified 2× faster and weighted higher in alert
  fusion", a progress bar "88 / 95 to Level 5" — then four statistics (reports submitted / verified / rejected / upvotes), "How to raise your score" with points, and "Recent changes". `GET /trust-score` returns `{account_id, score,
  updated_at?}` and nothing else, and nothing writes scores yet, so **none of the level, progress, statistics, tips or history is drawn** (each would be invented). What remains is the ring, "Last updated", and a short "How it works" —
  written as intent ("designed to rise when your reports are verified by NGOs and admins…", from `06-trust.md`'s description of what will feed the score), not as something that is happening. The hero is a white card with a teal ring
  (the design system's "trust" colour, the same as the admin card's bar) because the gradient was built around the level line and white text on pink is below AA at the small sizes it used. The sidebar's "Level 4" chip is likewise not shown.
  An account with no stored row comes back as `score: 0` with **no `updated_at`** and is shown as "Not scored yet" — a stored `0` (it has an `updated_at`) is a score of zero.

- **Alert Preferences: auto-save, backend severity names, no quiet hours or alert locations (Phase 4).** The design plan's button table says the toggles/pickers **auto-save on change, no separate Save button**, while the mockup (Batch 3 §3g)
  draws "Discard / Save preferences" — the plan's rule is followed. Each change is applied to the screen at once, sent as a partial patch of **only that field** (the API doc's warning: round-tripping values could switch off a channel the user
  never touched), and saved one at a time in order (`scope`), so two quick taps can't arrive backwards or flicker back. The mockup's severities (Safe / Caution / High / Critical) are shown as the backend's own (`general_advisory` / `watch` /
  `warning` / `critical_emergency`, lowest to highest), described as a *minimum* — so a critical emergency always gets through. **Quiet hours and "Alert locations" are not drawn:** the API has neither. SMS, WhatsApp and voice calls go to a
  phone number and **the system stores none** (no column on `accounts` or `profiles`), which the page says once under the channels instead of letting the switches imply a delivery that can't happen. The language is a select of English / Urdu /
  Sindhi (`en` / `ur` / `sd` — the codes the accounts in the database hold; the API stores any non-blank text, so an unfamiliar value is shown as an extra option rather than misreported).
- **Edit Profile has no "remaining fields" (Phase 4).** The plan expected more personal fields; `05-profiling.md` says plainly that personal details are exactly `name`, and the table has `name` and `home_region_id` only — no phone, photo or date of birth.
  Rather than invent fields, the page gained a read-only **Your account** card with what the API does return: the sign-in email (with a Verified badge) and the profile's creation date ("Member since"). It is text, not inputs — no route changes an email.

- **Activity Timeline: sentences written here, links only where a screen exists (Phase 4).** The backend sends structured facts (`type` + `detail`), not prose, so it can be translated: `describeActivity` turns each event into a first-person sentence ("You reported flooding",
  "You requested medical help", "You donated 5,000", "You reported a shelter as open") plus status / severity pills, in one place Phase 9's i18n can swap. A `type` the screen doesn't know is **skipped** (the backend may add kinds; the doc says a client ignores them) and a status or
  category it has no wording for is shown as plain words. **Donation amounts print with no currency** — the API sends a bare number and states none. **Only a shelter's status report is a link** (`/app/map/shelters/:id`, a real screen); reports, votes, aid requests, campaigns
  and missing persons stay plain text until Phases 5–6 build their pages (the doc's own advice: only link where the target exists), and an essential location has no page. Events are grouped under a heading per day in the *viewer's* zone ("Today", "Yesterday", "24 September 2026"), the
  time as `HH:mm`. Paging is by offset — "Load more" asks for `offset` = the events already held and a page shorter than 25 is the last — and pages are merged with each id kept once, since an event arriving between two presses would otherwise repeat one. The mockup's chat "interactions"
  wait on Communication (not in the API yet).

### Component library actually built so far (`src/components/ui/`)

`Button` (variants: primary, secondary, ghost, dangerOutline, criticalSolid, safeSolid — the
latter two reserved for real emergency actions, never generic destructive ones, per the design
system's own rule), `Input` (leading icon + trailing slot; the `<input>` itself owns the full
visible box rather than a wrapper div — see the Safari fix below), `PasswordInput` (show/hide
toggle, optional leading lock icon), `OtpInput` (6 boxes, auto-advance/backspace/paste,
fully responsive down to 320px), `Checkbox` (real native input, `group-has-checked:` for visual
styling), `Dialog` (wraps `@radix-ui/react-dialog` — overlay, centered content, title/description,
close button), `Drawer` (the same Radix dialog as a full-height side sheet, full width on a phone, for forms
too structured for a small dialog), `Badge`, `Label`, `Select` (a native select with a chevron), `Textarea`, `Switch` (Radix Switch — `role="switch"`, Space toggles, a bordered track so state doesn't rest on colour alone; first used by Alert Preferences), `CopyButton` (copies a string with the async Clipboard API and says "Copied" — or that it couldn't, so the text can be selected instead; used by Safety Groups for Member IDs), `Notice`
(a page-level `role="status"` banner), `TabBar` (a proper tablist over one panel — arrow keys, Home and End — used by Resources and Facilities), and `ListPagination` (rows-per-page and previous/next, shared by
the admin lists); `button-variants.ts` exports `buttonVariants` for links styled as buttons. **Not built via shadcn's CLI** — every component is hand-built
directly against the verified design tokens (§2.4); shadcn's generated components assume a
different, Material-adjacent visual language that would need a full rewrite to match this design
system anyway, so §2.2's original "shadcn/ui" line undersold what actually happened — Radix
primitives (dropdown menu, etc.) plus `class-variance-authority` directly, shadcn's *pattern*
without its generated code.

### Real bugs found and fixed along the way

- **Safari's native autofill highlight nested visibly inside `Input`'s own border** — the
  leading icon was a flex *sibling* of the `<input>`, so the real input element's own DOM box
  was narrower than the visible field, and Safari's autofill chrome anchors to the actual
  element. Fixed by making the `<input>` own the full visible box, icon absolutely-positioned on
  top instead of laid out beside it.
- **Two separate flexbox `min-width: auto` overflow bugs** — one in `AuthLayout`'s mobile
  column, one in `VerifyEmailForm`'s OTP row — both the classic case of a flex descendant's
  content-driven minimum width silently forcing an ancestor wider than the viewport. Fixed with
  `min-w-0` at each level; the OTP fix also switched the 6 boxes from fixed 52px to `flex-1`
  with a capped max width, so they shrink gracefully on any narrow phone (verified: zero
  overflow down to 320px) instead of clipping.
- **Every `@phosphor-icons/react` import across the codebase used deprecated bare names**
  (`Buildings` instead of `BuildingsIcon`, etc.) — renamed project-wide before it spread further.
- **`sed -i` writes to tracked project files silently don't persist** in this harness (reverted
  on the next tool call) — switched to the Edit tool for all renames.
- A `Button`'s loading state stripped its accessible name entirely (spinner-only, nothing for a
  screen reader) — fixed with a visually-hidden label that survives the loading state — which
  then broke multi-child buttons' flex `gap` layout (the Google button's icon+label+badge);
  fixed with `display: contents` on the label wrapper so it doesn't introduce a box that breaks
  the parent's own flex layout.
- **`ProfileSidebar` mistook a loaded-but-empty name for "still loading."** First cut checked
  `name ? loaded : skeleton` — but a freshly-registered account's real `name` is `""` (the
  documented "not yet set" state, same as onboarding), and `""` is falsy in JS, so the sidebar
  would show its loading skeleton forever for exactly the account most likely to be looking at
  this screen. Caught during visual verification (real backend, real freshly-registered
  account), fixed by checking `name !== null` instead — `null` means "not fetched yet," `""`
  means "fetched, genuinely empty," and the two now render distinctly (skeleton vs. a real
  "Add your name" fallback).
- **Router `state` silently lost the post-deactivate/delete redirect message** — caught during
  visual verification against the real backend (the "Your account has been deleted." banner just
  didn't show up). Root cause: `AccountSettingsPage` clears auth state and navigates away from a
  route `RequireRole` guards; `RequireRole` reacts to that same state change and fires its own
  *stateless* `<Navigate to="/login">`, racing the page's own state-carrying `navigate()` call —
  whichever redirect's history entry wins, the other one's `state` payload is gone. This exact
  race never showed up on Reset Password (a pre-auth screen with no guard fighting it) or on
  plain logout (no `state` payload to lose in the first place), so it was latent until this
  screen's redirect actually needed one. Fixed by moving the message into the auth store itself
  (`pendingMessage`, see the "New architecture" entry above) — a store field survives any number
  of redirects in between, unlike a single `navigate()` call's payload.
- **The `pendingMessage` fix's first attempt broke under React StrictMode** — read via a single
  combined "consume" action (`get X, clear X` in one call) inside a `useState(() => ...)` lazy
  initializer. StrictMode double-invokes lazy initializers in dev specifically to catch impure
  side effects, and this one wasn't pure: the first, thrown-away invocation cleared the message
  before the second (kept) one ever ran, so it never reached the screen — in dev only, not in a
  production build, which is exactly why this class of bug is easy to ship unnoticed. Fixed by
  splitting the read (pure, in the initializer) from the clear (a real side effect, moved to a
  `useEffect`) — `useEffect`'s own StrictMode double-fire is harmless here since clearing an
  already-null field is a no-op.
- **The TanStack Query cache survived logout, so the next account in the same tab could be served
  the previous account's data.** Found while adding a second per-user cached query (pending
  invitations, alongside the profile name): `staleTime` is 30s and nothing cleared the cache when
  the session ended, so logging out and signing in as someone else inside that window would show
  the previous person's name in the Profile sidebar (and their invitations) until a refetch
  landed — a privacy leak, not just stale UI. Proved with failing tests first
  (`src/lib/queryClient.test.ts`: two red, two green), then fixed once, centrally: a subscription
  in `queryClient.ts` clears the whole cache whenever the signed-in account goes away or changes.
  It keys off the auth store, so every path is covered — logout, deactivate/delete, a failed silent
  refresh in the axios interceptor — without each caller remembering; a plain token refresh for the
  same account (same `user.id`) and the first login (null → user) deliberately keep the cache.
- **The NGO/Admin shell was unusable on a phone: the sidebar never collapsed, leaving the content
  ~150px.** Found while visually verifying Organization Settings at 390px — the page measured
  `main` at 150px because `OpsLayout`'s 240px rail sat beside it at every width. Not specific to
  this screen: every NGO/Admin screen still to come would have been squeezed the same way, and the
  brief is mobile + web for all of them. Fixed once in the shell: from `md` (768px) up nothing
  changes (in-flow rail, full width ↔ icons-only), below `md` the sidebar is an off-canvas drawer —
  closed by default and `invisible` when closed so it's out of the tab order, opened from a header
  menu button, closed by the backdrop, Escape, or choosing a link. Labels are hidden only with
  `md:hidden` (never by JS state), so a rail collapsed on desktop can't leave the drawer icon-only.
  Content padding is `p-4` on phones. Measured after: `main` is the full 390px, no horizontal
  overflow; unit-tested (closed by default, open/backdrop/Escape/link-click, desktop toggle intact).
- **The shared `Dialog` ran flush against both screen edges on a phone, and a long title ran into its
  close button.** Found screenshotting Volunteers' Remove dialog at 390px — its title carries an email
  address, which is long. The primitive was `w-full` with no margin, so every dialog in the app
  (Account Settings' two, Organization Settings' deactivate, and the new ones) touched the edges, and
  titles had no room reserved beside the absolutely positioned "X". Fixed once in `dialog.tsx`: the
  width is `calc(100% - 2rem)` (still capped at the 440px max) and `DialogTitle` reserves padding at
  its end. Wrapping of emails inside the roster rows also moved from `break-all` (which chopped them
  mid-word) to `overflow-wrap: anywhere` (which breaks at the hyphens first).
- **The accounts list's filters silently undid each other when changed in the same tick.** React
  Router's `setSearchParams` updater is handed the params of the *last render*, so clicking a role
  pill and then typing in search before React re-rendered made the second update rebuild from stale
  params and drop the first. It surfaced in E2E ("Citizen" stayed pressed after clicking "All",
  because Playwright acts faster than a person), but a quick user can hit it. Fixed by making React
  state the source of truth — read from the URL once, mirrored back to it by an effect — with a unit
  test that fires two changes inside one `act` (which reproduces it in jsdom).
- **The accounts table's columns drifted from row to row.** Each row is its own grid and its last
  column was `auto`, so it sized to that row's buttons: a Reactivate row is wider than a Suspend
  row, and the caller's own row has none, which pushed Role/Status/Created out of line with the
  header and with each other. Caught in screenshots; the actions column is now fixed-width, with a
  fixed slot for the status button so "View" lines up too.
- **`Button`'s `asChild` prop has never worked.** It renders two children (the optional spinner and
  the label wrapper) into Radix's `Slot`, which needs exactly one. Nothing used it until the list
  wanted a link that looks like a button; that link uses `buttonVariants` instead (moved to
  `button-variants.ts` so `button.tsx` still only exports a component). The prop itself is left as
  found.
- **The NGO table's View button rendered as a 4px dot.** It was written as
  `buttonVariants({ ..., className: 'w-9 px-0' })`, but `cva` only *concatenates* `className`, so the
  variant's own `px-4` stayed in the string and won on stylesheet order, leaving the 16px eye icon 4px
  of room. Passing an extra class into `buttonVariants` is not a safe way to override it; it has to go
  through `cn` (which is `twMerge`). Caught only by looking at the screenshot — every test passed.
- **A screen reader heard a bare "2" for a volunteer count.** From `md` up the row's column headers are
  `aria-hidden` (the rows are grids of divs), and the words that made a cell self-describing — "2
  volunteers", "Applicant …", "Submitted …" — were `md:hidden`, i.e. `display: none`, so not announced
  either. They're `md:sr-only` now: visually gone on desktop, still read. (The accounts table's "Created"
  prefix has the same shape and is a known, smaller instance.)
- **Checking a pasted boundary for self-intersection froze the form.** The natural check compares every
  pair of segments; that's fine for a square and unusable for a real district outline with tens of
  thousands of points. Found by benchmarking before shipping rather than by a user: a grid keyed to the
  bounding box was still superlinear (a boundary only occupies a thin band of it, so cells crowd — 200,000
  points took 5.7 s), and sizing cells to the *average segment length* fixed it (216 ms), with the few
  segments far longer than average compared against everything directly. The two implementations are
  tested against each other on random rings so the fast one can't quietly disagree.
- **The region tree's level chips wrapped onto a second line** at the tree's 320px width — one pixel-level
  measurement (all four chips share a top offset) after tightening their padding.
- **Every button had lost either its label colour or its label size — since the first screen.** `cn()` is
  `twMerge`, which knows Tailwind's own font sizes but not this project's `@theme` tokens (`text-body-lg`,
  `text-label`, `text-body-sm`…), so it took them for text *colours* and, given `text-white` next to `text-body-lg`,
  kept only the later one. `size="lg"` primary buttons (Login, Register, Continue…) rendered **dark** text on pink; `sm`
  secondary and ghost buttons lost their `primary-700` text (Approve, Download GeoJSON, Add region…); `md` buttons lost the
  13px `text-label` and fell back to 16px. Every test passed, and every earlier screenshot review missed it — it surfaced when a screenshot of
  the new onboarding Continue button showed a dark label on the pink primary button, and was confirmed by reading the computed colour
  (`rgb(34,16,25)` on the login button, `rgb(255,255,255)` after). Fixed once, in `lib/utils.ts`, by declaring the theme's
  size tokens to `twMerge` (tested: colour and size now coexist, later ones still replace earlier ones, and the button
  variants keep both). **This is a global typography change:** wherever a screen merges a token size with a colour through
  `cn`, text now renders at its designed size and colour — button labels, and body text in a number of lists — so screens built
  earlier look slightly different (tighter, closer to the mockups). The unit suite and a visual pass over Login, NGOs, Regions
  and Organization Settings found nothing broken; the change is one file to revert if it isn't wanted. Keep the token list in
  `utils.ts` in step with the `--text-*` sizes in `index.css`.
- **The map's opening fit to the home region could be silently lost (found by the real-backend E2E; no unit test could see it).**
  The map first fits the wider frame, then the box around every region, then the citizen's home region as each request answers.
  Leaflet **drops a `fitBounds` made while an earlier animated zoom is still running** — it thinks the zoom in flight is the one
  you asked for — so when the regions arrived just before the profile, the fit to the home region vanished and the map stayed
  zoomed out over the whole country (and, being too wide, without flood zones). It only happened for some orderings of the two
  responses, which is why one E2E test passed and the next one, identical, failed. Fixed by making the opening fit un-animated
  (which is also what a page load should do); a unit test spies on `fitBounds` and checks every fit the canvas makes has
  `animate: false`.
- **The legend's title and close button were hidden under the layer chips on a phone (found by the screenshot).** The chips are
  laid over the map by the page, but the canvas is its own stacking context, so the whole canvas — including its control stack and
  the legend — sat *under* anything the page put over it, whatever the `z-index`s said. Fixed by giving `MapCanvas` an `overlays`
  slot rendered inside that context, below the controls; a check that the close button is the topmost element at its own centre
  and can be tapped now passes. (Every test was green before: this needs a real layout.)
- **A race between "is this view too big?" and "which box do I ask for?" (found by a unit test; since moot).** The 150-square-degree
  size check read the live viewport while the request used the debounced one, so zooming from the whole country back to a district
  briefly requested the country-sized box — the very 6.7 MB request the check existed to prevent. Fixed by deriving both from one
  debounced viewport; the check itself was later removed when the backend's floor made the whole country cheap (see the *Map* bullet).
- **Leaflet treats two quick clicks on a control as a double-tap and swallows the second.** Registering a double-click guard
  with `DomEvent.on` installs Leaflet's touch double-tap emulation, which cancels the real click — on a phone, the second of
  two quick taps on "+" would do nothing. (`DomEvent.disableClickPropagation` had the related problem of also stopping
  `mousedown`.) The control stack now uses a plain native `dblclick` listener plus Leaflet's wheel guard. jsdom claims touch
  support, so the canvas tests set Leaflet's `L_NO_TOUCH` flag *before* importing it (an ordinary `import` at the top of the file
  runs first and defeats it).
- **The "load-stall" flake had a real cause: this Mac's TCP stack (found 2026-09-24).** `page.goto: net::ERR_ABORTED` — which
  Phases 1 and 2 put down to memory pressure and re-ran — is the browser's connection to the dev server never being answered.
  Probing showed a `connect()` to `[::1]:5173` hanging while `:8080` (which also listens on IPv4) answered at once; Vite listens
  on IPv6 loopback only. `netstat` showed ~27,900 sockets in `TIME_WAIT` that **were not draining at all** over eight minutes
  (8,740 to :5173, 6,300 to :8080, 7,700 to :443, 850 to :5432), and the machine's uptime was 85 days — past the ~49.7 days at
  which a known macOS TCP-timer bug leaves `TIME_WAIT` sockets from ever expiring. Every connection the browser, the tests and
  `curl` had closed since then permanently used one of the ~16,000 loopback source ports, and IPv6's pool was nearly gone (a
  fresh port, 5174, hung too; IPv4 loopback was fine). It also stalls the backend's own calls now and then (a registration that
  took 5 s, or never came back). **Nothing here can be fixed from the project; a reboot clears it.** Until then the map's
  E2E runs against a second Vite instance bound to `127.0.0.1` (`vite --host 127.0.0.1 --port 5174`, with
  `VITE_API_BASE_URL=http://127.0.0.1:8080/api/v1`), through an untracked `playwright.local.config.ts` and
  `E2E_API=http://127.0.0.1:8080/api/v1` — the developer's own Vite on :5173 is left alone — and the spec retries a document
  that gets no answer (`visit`) and a registration that gets none (`register`, with a fresh email each time). Every failure in
  that period was a stalled request; none was the application.
- **Shelter Detail's first screenshots showed two layout faults no test could (found by looking).** The embedded map opened so tight
  on the shelter that a flood zone around it filled the whole frame as one flat orange block — it now opens ~35 km across, and the
  zone's outline and edges show. And on desktop the right column's Details card drifted far below Capacity, because the tall Location
  card spans both grid rows and the extra height was shared out between them; the rows are now `auto` then `1fr`, so Details sits
  directly under Capacity.
- **Resources' rows didn't line up, and a status badge stretched across a phone (found by the screenshots).** Each row was a flex line whose
  right-hand group took the width of its own buttons, so Navigate sat at a different x on every row — and a place nobody has reported on,
  with two report buttons, pushed further than the rest; on a phone the badge stretched to the full width of the card. The desktop row is
  now a grid with fixed columns (name, status, Navigate, reports — wide enough for both report buttons side by side), and the badge is
  `items-start`.
- **A spec that assumed an empty database failed only because earlier runs had left rows (found by re-running it).** Resources' first E2E
  listed exactly the five places of its own world — but every earlier run's world was seeded at the same coordinates, so their places
  joined the home region's spatial query and the list held 15. Cleanup runs at the end of a phase, so leftovers are normal. The spec now
  puts each run's world at a random 0.6° square of its own (12–17°N, 76–84°E) and passes twice in a row without cleaning. The map and
  Shelter Detail specs were still on fixed locations then; they got the same treatment with the Hazard Zones screen (below).
- **On a phone the hazard-zone filters filled the screen, leaving one row of the list (found by the screenshot).** The pane was a fixed block of controls (two
  stacked date inputs, the pills, the slider) above a scrolling list, which on 390×844 left about 140px for rows. Below `lg` the whole pane now scrolls as one, the two dates
  sit side by side, and rows wrap their titles instead of truncating them.
- **The specs with a fixed world location failed on a database that still held earlier runs' rows (found by re-running the map spec after this screen's runs).** The
  Resources and Hazard Zones specs already put their world at a random spot each run; the citizen-map and Shelter Detail specs used fixed coordinates and asserted exact
  counts, so any leftover E2E zone at that spot made them fail (three worlds' worth of zones were drawn where two were expected). All four now use a random 0.6° square
  at 16–21°N, 70–78°E — south of the flood pipeline's grid — and the two older ones passed on a dirty database straight after.
- **The shelters table crushed its name column to a few letters on a tablet (found by the screenshot).** The six-column grid started at `lg` (1024px), but the console's
  240px sidebar leaves a 1024px window about 735px, and the four fixed columns take 480px of it — the name wrapped one or two characters per line. It now starts at `xl`; below it each row is a
  card, on a tablet with the actions at its top right and the occupancy bar capped at a readable width, on a phone stacked under the name. (A viewport breakpoint alone can't know how wide the
  content is under a sidebar; the NGO and Admin screens built earlier use `md` for their tables and are worth a look at 768–1024 in the phase-end visual pass.)
- **A focus ring that only half showed (found by the screenshot).** The occupancy stepper clipped its buttons and field with `overflow-hidden`, and the design system's global
  `:focus-visible` rule is *unlayered*, so it beats every Tailwind utility — a `focus:outline-none` or `focus-visible:-outline-offset-2` on a component can't change it — which left a focused
  field showing two vertical bars where the ring was clipped. The group no longer clips (the end buttons are rounded instead), so the ring draws in full. Worth remembering: restyling the
  focus ring on a component needs an unlayered rule, not a utility class.
- **A long shelter name ran the map's tooltip across the whole map (found by the screenshot; the citizen map and shelter page had the same fault).** Leaflet draws the label on a selected marker
  with `white-space: nowrap`. Letting it wrap with `overflow-wrap: anywhere` was worse — the box shrank to one character wide (a shrink-to-fit box takes the smallest content width) — and
  `width: max-content; max-width: 16rem` is what works. It is a global rule with a more specific selector, because leaflet.css loads after the app's stylesheet.
- **Leftover E2E rows made the citizen-map spec fail again (found by re-running it after this screen).** It drew 3 zones where 2 are expected: every spec seeds a flood zone somewhere in the
  same 8°×5° area and none is cleaned until the phase ends, so after this screen's runs (the spec five times and the visual pass five times, each seeding its own world) one of them overlapped the map's view. Random
  placement lowers the odds per leftover row but every run adds rows; it passed 6 of 6 straight after the guarded cleanup. That is why the cleanup is part of each screen's routine — **if a
  map or zone spec fails on a count, clean first.**
- **Adding a place said nothing about its region if it was saved right after typing (found by the real-backend E2E).** The "added" notice read the region note's state, which follows the typed coordinates after a
  300 ms pause, so a fast save got "was added." with no "It is in …". The notice is now worked out from the values actually being submitted (a pure `coverageFor` over the cached region list), and a unit
  test saves straight after typing.- **Shelters registered from a real NGO account vanished from the admin list (found by using the screens — no test could have).** They were saved at points no region covers, so
  every region-scoped list, including the admin's and the citizens', omitted them while the NGO's own list (by organisation) showed them. The screens had warned; the warning was
  not enough and the demand behind it — know which regions exist — was wrong. Fixed by drawing the regions on the picker and refusing a point outside them (see *Location
  picker*). A reminder that the E2E's “a point in no region is accepted by the API” test had proved the trap but not that a person would notice it.

- **A status label was read as "At risk(current)" (found by a unit test).** The gap before "(current)" was a CSS margin, which a screen reader doesn't hear; it is now a real space.
- **Names sorted "…12, …17, …2, …22" (found by the screenshot).** Plain string collation; essential locations are meant to be bulk-imported and their names are full of numbers, so the list now sorts numbers as numbers.
- **Leftover rows from the visual pass made Resources' "Everywhere" test fail (found by re-running it after this screen).** "Everywhere" lists every region's places by name, 25 at a time; the visual world's 26
  essential locations sorted ahead of that test's row, so it fell onto the second page. Not a code fault — it passed 6 of 6 after the cleanup — but a reminder that **the visual pass leaves the most rows of anything,
  so clean up after it and before re-running the older specs.** (A test-only slip too: one test's PATCH handler mutated a fixture shared with the next.)
- **The phase-end pass found nine real bugs — the deferred tests earned their keep.** Each was found by a test written from the deferred list, fixed once in shared code, and
  pinned with a unit test that was checked to fail without the fix.
- **Enter and Space did nothing on a focused map marker (found by the keyboard E2E).** Leaflet 1.9.4 makes a marker a focusable `role="button"` and its docs say Enter clicks it,
  but the code never does: a keyboard user could Tab to a marker and nothing happened. `MapCanvas` now selects on Enter and on Space.
- **On a phone the map jumped half a screen and back when switching Map → List → Map (found by the phone E2E).** `MapResizer` re-measured the map whenever its container changed,
  including when it was hidden (0×0), and Leaflet keeps the centre by *panning* — so hiding panned the map by half its size and showing panned it back, with the markers a frame
  or more out of place in between. It now leaves a hidden map alone.
- **On a phone, "Show on map" in the Hazard Zones list took the whole page down to a white screen (found by the phone E2E).** The page mounts the map hidden and, in the same
  update, asks it to fly to the zone; Leaflet's `flyTo` divides by the map's size, so on a map still cached as 0×0 it computes NaN ("Invalid LatLng"). The citizen map was exposed
  the same way (choosing a zone from the list). `FocusController` now re-measures first and does nothing while the map genuinely has no size.
- **Fast arrow keys on a tab list went to the wrong tab (found by the keyboard E2E).** `TabBar` measured each arrow from the page's `active` tab, which lags a keypress (the tab
  lives in the URL), so a second arrow pressed before it caught up — a held key — was measured from where the first had started. It now measures from the tab that has focus. (An
  existing unit test had encoded the stale behaviour and was corrected.)
- **Every dialog and drawer opened from a row's button lost keyboard focus when it closed (found by the keyboard E2E).** Radix returns focus to a dialog's own `Trigger`; these
  are opened from page state, so there is none, and focus fell to the top of the page. `Dialog` and `Drawer` now remember what had focus when `open` turned true — noticed while
  rendering, because the register drawer's autofocused Name field takes focus before Radix reports the dialog open (the first version missed that; the NGO keyboard E2E caught it)
  — and return to it, unless it has gone or the caller chose otherwise.
- **"Is this place inside an active hazard zone?" could repeat a thirty-second-old answer (found by the cross-role E2E).** The admin's Location dialog shared the overlay cache
  (30 s), so a zone resolved a moment ago was still reported. The check now keeps nothing after it closes and asks afresh each opening.
- **The two ways of testing a point against a boundary disagree, and the browser had to learn which is which (found by the border and hazard E2Es).** The API's region join counts
  a point exactly on the shared edge of two regions as inside **both**; the server's own risk check counts a point exactly on a hazard zone's edge as **outside**. The browser's
  ray casting counted two of a square's four edges and not the others. `regionContains` is now explicit — boundary included by default (regions), `includeBoundary: false` for
  zones (agreeing with the risk check, which the E2E now compares against for an edge, a hole, the ring around it and three stacked zones). A unit-test fixture that had put a
  shelter exactly on a zone's edge only "worked" by that inconsistency.
- **A save could be refused on a region list up to thirty seconds old, and the notice could name no region (found by the picker E2E).** The reason the register and Add drawers
  refuse a save is "outside every region", and an administrator may have added the region since the list was fetched. The submit now asks for a fresh list before refusing
  (failing open if it can't), and the notice names the region from that list.
- **Users, NGOs, Volunteers, Regions and several detail pages were unusable at 768–1024px (found by the tablet check).** The NGO shelters table had taught this lesson once (the
  console's 240px sidebar leaves a 768px window ~480px and a 1024px one ~735px), but the earlier lists still switched to their column grid at `md`: at 768 the Users and NGOs name
  columns were a character wide, and the Regions detail beside its tree was 140px. The tables now start at `xl` (cards below it), the Regions tree beside its detail and the
  two-column detail pages start at `lg`/`xl`, the Hazard Zones table-beside-map split starts at 1280 (below it: List | Map), and the three-column detail pages at `xl`. A new
  check loads each list at 768 and 1024, fails on anything clipped or sticking out, and keeps a screenshot to look at.
- **The Profile sub-nav pushed every profile page a screen down on a phone (raised by you, 2026-09-25).** Nine stacked links sat above the page's own content on `/app/profile/*` and Safety Groups, so the
  first request in Safety Groups was below the fold. Below `md` the links now collapse behind one button that names the current section (its own count on it, plus an outlined pill for what's waiting in the *other*
  sections, so a shut menu doesn't hide a pending request); tapping a link, or Escape (focus returns to the button), closes it. From `md` up nothing changed. The open state is "open *for this path*" in
  `ProfileLayout`, so following any link or the back button closes it without an effect. `profileNav.ts` now holds the item list and `currentProfileNavItem` (the same matching rule as `NavLink`). Checked at 390, 767/768 and 1440.
- **Safety Groups' rows were squeezed at 768–1023px (found by the visual check, first look).** The same lesson a third time: the Profile sub-nav takes ~300px from the content
  column between `md` and `lg`, and the rows put Accept / Decline beside the name from `sm`, leaving "Member 72B4E4FA" wrapping onto two lines; the Member ID card had the same fault. The
  inline actions now start at `lg` (below it they sit under the name, full width, as on a phone). **Rule going forward: anything inside a page that has a sidebar switches to its wide
  layout at `lg`, not `sm`/`md`.**


---

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
| Styling | Tailwind CSS **v4** (CSS-first `@theme` config, not a JS config file), tokens sourced from the verified design system (§2.4) |
| Components | Hand-built directly against the design tokens, using Radix primitives (dropdown menu, etc.) + `class-variance-authority` for variants — shadcn's *pattern*, not its CLI-generated components (see Progress log — shadcn's own components assume a different visual language that would need a full rewrite anyway) |
| Icons | **`@phosphor-icons/react`** — the actual design system's icon set (not lucide-react — that was only ever a default for the unused "Modernist" `_ds/` folder, which nothing in the real mockups references). **Import every icon by its `*Icon`-suffixed name** (`BuildingsIcon`, not `Buildings`) — the bare names are deprecated aliases in the installed version |
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
  peak or mean semantics on the Go side (**confirmed on 2026-09-25 against the real ingested zones: it is `mean_prob`, exactly — see the Map bullet under *Real deviations*, and `map-preview`'s colour stops are the app's, stop for stop**) (check `internal/floodintel/domain` before assuming), and
  prefer whichever is closer to `mean_prob`'s meaning.
  - **Test with real backend-shaped data before assuming any of this transfers 1:1** — the backend
    computes `risk_level` server-side from `confidence_score` via fixed thresholds (<0.34 low,
    0.34–0.67 medium, ≥0.67 high per the roadmap), which is a different number than either
    `peak_prob` or `mean_prob` in the raw manifest. Don't assume the Go API's `confidence_score`
    is numerically identical to the raw manifest's `mean_prob` just because both are "a probability
    0–1" — verify against a real ingested prediction once Phase 3 starts, and adjust the color
    mapping if they diverge.
- **A min-probability filter slider** (as `map-preview` has) — most patches have ~0 flood signal (6,783 of 19,964 in the real
  manifest), so an unfiltered render is visual noise. **Resolved on the server, differently for each audience:** citizens never
  receive model zones under 0.34 (no parameter reaches below it, so no slider is offered), and admins get the whole picture with
  `GET /admin/map/flood-overlay?bbox=&min_confidence=` — that `min_confidence` (0–1, inclusive; hand-declared zones always pass) *is*
  the slider, for Admin Hazard Zones.
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
  `identity.ts` and `profiling.ts` are partially filled in now (`login`, `getMe`, `logout`,
  `register`, `verifyEmail`, `resendVerification`, `getProfile`, `updateProfile`) — the rest of
  each file's real routes get added screen by screen as their phase is built, per the original plan.
- **Auth store** (`src/store/auth.ts`, Zustand): in-memory access token + `AuthUser` (`id`,
  `email`, `role`, `emailVerified`, `profileComplete`), `setAuth`/`clearAuth`/`markProfileComplete`.
  Never persisted to `localStorage`/`sessionStorage` (XSS surface, verified with a real E2E check,
  not just a code comment) — a page refresh re-derives it via `POST /auth/refresh` (cookie-based
  for web, per the API's `X-Client` convention — web sends no `X-Client` header, so the refresh
  token stays an httpOnly cookie, never touched by JS). `nextAuthRoute(user)` is the single
  function every auth-flow screen and every guard uses to decide "where does this user go next"
  through the mandatory chain (verify email → complete profile → the app) — see the Progress log.
- **Axios instance** (`src/api/client.ts`): `withCredentials: true`; request interceptor attaches
  `Authorization: Bearer <token>`; response interceptor catches a `401`, calls `/auth/refresh`
  once (deduped across concurrent requests), retries the original request, and clears auth state
  on refresh failure (route guards handle the redirect, not the interceptor itself).
- **Route guards** (`src/routes/guards.tsx`): `RequireRole({allowed})` gates `/app/*` (`user`),
  `/ngo/*` (`ngo_admin`/`ngo_volunteer`), `/admin/*` (`admin`/`super_admin`) — and, beyond role,
  also requires `emailVerified` and `profileComplete`, redirecting into the onboarding chain
  otherwise. `RedirectIfAuthenticated` sends an already-authenticated visitor away from
  `/login`/`/register`/etc. to wherever `nextAuthRoute` says, not straight to their role's
  landing route (an unverified account hitting `/login` again should land back in the chain, not
  bounce past it). `RequireUnverifiedSession` (`/verify-email`) and `RequireIncompleteProfile`
  (`/app/onboarding/profile`) gate the two onboarding steps themselves, each allowing entry only
  in the correct window. No in-app role switcher (`WEB_DESIGN_PLAN.md` §0).
- **Auth flow shell** (`src/layouts/AuthLayout.tsx`): shared chrome for every Pattern W-Auth
  screen — Login, Register, Verify Email, Forgot Password, and Reset Password all built on it
  now — fixed 620px brand panel matching the pixel mockups exactly, with per-screen `heroHeadline`/
  `heroContent`/`heroPreHeadline` (the OTP step indicator) slots and a `cardWidth` prop, since
  Login/Register/OTP each specify slightly different card widths and hero content in their own
  mockups. Below `md` it collapses to a compact header (not part of the pixel spec — the mockups
  only cover 1440 desktop, this is a deliberate, documented extrapolation).
- **Two nav shells**: Citizen top-nav (per `WEB_DESIGN_PLAN.md` §4.1, `src/layouts/CitizenLayout.tsx`)
  and the shared NGO/Admin sidebar (§4.2, `src/layouts/OpsLayout.tsx`) — built from
  `Ops Sidebar.dc.html` almost directly, a real parameterized (`role: 'admin'|'ngo'`) reference
  implementation, not just a mockup. Both wired to a shared `AccountMenu` (`src/features/auth/`)
  for logout.
- **MSW setup**: `src/mocks/handlers/*.ts` per not-yet-built domain, `src/mocks/browser.ts` (dev)
  and `src/mocks/server.ts` (tests). Handlers shaped to match the *documented* eventual contract in
  `WEB_DESIGN_PLAN.md` §6's "On click →" column, so swapping to real is a contract-compatible
  change. Also used, beyond the original Phase 7 scope, via per-test `server.use()` overrides for
  deterministic unit tests of already-built domains (see Progress log) — E2E still hits the real
  backend for those.
- **i18n scaffold**: `en`/`ur` namespaces, `dir` + font-family (`Inter`/`Manrope` ↔ `Noto Sans
  Arabic`) driven off locale.
- **Testing scaffold**: Vitest + RTL config, Playwright config pointed at the local Vite dev
  server, calling the local Go backend **directly** (no dev proxy — the backend allows CORS from
  the Vite origin natively; see Progress log) wherever a phase's backend is real.

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

## Phase 0 — Foundation & Architecture ✅ Done

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
`npm run test` and a Playwright smoke run both pass; lint/typecheck clean. **Met.**

---

## Phase 1 — Identity & Account Shell ✅ Done

Covers every screen backed by `internal/identity` across all three roles. This is first because
role-based routing (Phase 0) needs real login to actually exercise it, and every later phase's
screens sit behind auth.

### Screens

| Screen | Route | Role | Pattern | Status |
|---|---|---|---|---|
| Login | `/login` | All | W-Auth | ✅ Built |
| Register | `/register` | Citizen | W-Auth | ✅ Built |
| Verify Email (OTP) | `/verify-email` | Citizen | W-Auth | ✅ Built |
| Onboarding — Complete Profile **(NEW, see Progress log — mandatory step 2/2, no name changed but not originally its own line item)** | `/app/onboarding/profile` | Citizen | W-Auth | ✅ Built |
| Logout (via `AccountMenu`, both nav shells) | n/a — menu action | All | — | ✅ Built |
| Forgot / Reset Password | `/forgot-password`, `/reset-password` | All | W-Auth | ✅ Built |
| Edit Profile (name portion only — full profile is Phase 4) | `/app/profile/edit` | Citizen | W-Settings | ✅ Built |
| Account Settings (deactivate/delete) | `/app/profile/account-settings` | Citizen | W-Settings | ✅ Built |
| My NGO **(NEW screen, per WEB_DESIGN_PLAN §9)** | `/app/profile/ngo` | Citizen | W-Settings | ✅ Built |
| Invitations **(NEW screen, per WEB_DESIGN_PLAN §9)** | `/app/profile/invitations` | Citizen | W-Settings | ✅ Built |
| Organization Settings (profile, operational regions, deactivate) | `/ngo/settings/organization` | NGO (`ngo_admin` only) | W-Settings | ✅ Built |
| My Account (profile name, password, deactivate/delete — one page for all four staff roles) | `/ngo/settings/account`, `/admin/settings/account` | NGO, Admin | W-Settings | ✅ Built |
| Volunteers (roster, invite, remove — `ngo_admin` only) | `/ngo/volunteers` | NGO | W-List | ✅ Built |
| Users & Accounts (+ detail) | `/admin/users`, `/admin/users/:id` | Admin | W-List / W-Detail | ✅ Built |
| NGOs (+ detail, approve/reject) | `/admin/ngos`, `/admin/ngos/:id` | Admin | W-List / W-Detail | ✅ Built |

### Backend routes (all ✅ built — `api/00-identity.md`)

| Route | Used by | Status |
|---|---|---|
| `POST /auth/register` | Register | ✅ Wired |
| `POST /auth/verify-email`, `POST /auth/resend-verification` | Verify Email | ✅ Wired |
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Login, auth store bootstrap, global logout | ✅ Wired |
| `GET /profile`, `PATCH /profile` | Onboarding profile step; Edit Profile — the name, and from Phase 2 the optional `home_region_id` (full profile screen still Phase 4) | ✅ Wired |
| `PATCH /auth/password` | My Account → Password (forced sign-out on success). The citizen Account Settings screen has no password row in its spec, so citizens still change theirs via Forgot Password | ✅ Wired |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | Forgot/Reset Password | ✅ Wired |
| `POST /auth/me/deactivate`, `POST /auth/me/delete` | Account Settings | ✅ Wired |
| `POST /ngos/register` | My NGO → Register form | ✅ Wired |
| `GET /ngos/mine` **(added to the backend after My NGO's first build — see Progress log)** | My NGO → status card (pending / rejected / active), survives a reload | ✅ Wired |
| `GET /admin/ngos?status=&limit=&offset=`, `GET /admin/ngos/{ngoID}`, `GET /admin/ngos/{ngoID}/volunteers` **(added to the backend for this screen — see Progress log)** | Admin NGOs: the list loads every organisation once (the `status` filter is unused), the detail and its read-only volunteer roster | ✅ Wired |
| `POST /admin/ngos/{ngoID}/approve`, `POST /admin/ngos/{ngoID}/reject` | Admin NGOs list and detail — both take **no body**, so there is no rejection reason; approving also promotes the applicant and revokes their sessions | ✅ Wired |
| `GET /ngo/me`, `PATCH /ngo/me`, `POST /ngo/me/deactivate` | Organization Settings | ✅ Wired |
| `POST /ngo/volunteers/invitations`, `GET /ngo/volunteers`, `PATCH /ngo/volunteers/{id}/deactivate` | Volunteers (NGO side) — the last one is labelled "Remove" in the UI since it doesn't deactivate the account | ✅ Wired |
| `GET /volunteer-invitations`, `PATCH /volunteer-invitations/{id}/accept`, `PATCH /volunteer-invitations/{id}/decline` | Invitations (citizen side); the count also feeds the Profile sidebar badge | ✅ Wired |
| `GET /admin/accounts?limit=&offset=`, `GET /admin/accounts/{id}`, `PATCH /admin/accounts/{id}/status` | Users & Accounts — the list pages through everything with `limit=100` and searches/filters client-side (the API can't); status is Suspend/Reactivate only (`block`/`unblock` are synonyms) | ✅ Wired |

### Build steps
1. ✅ **Complete.** Login/Register/OTP/Forgot/Reset Password all wired for real immediately (no
   mock needed, nothing to mock against) — this is what makes every subsequent phase testable as
   a logged-in user.
2. ✅ Auth store + interceptor's refresh-and-retry wired against the real backend; the token
   lifecycle (login → expire → silent refresh → still-authed) is proven by the
   "access token never touches browser storage" E2E test and the refresh-retry logic in
   `src/api/client.ts` — every later phase depends on this working.
   - ✅ **Added, not in the original plan:** the onboarding-completion step (name via
     `PATCH /profile`) as a mandatory gate alongside email verification — see Progress log.
3. ✅ Edit Profile (name portion), plus the shared `ProfileLayout` W-Settings sub-nav shell every
   later `/app/profile/*` screen (built or still placeholder) now renders inside — see Progress
   log's "New architecture" entry.
4. ✅ Account Settings (deactivate/delete), plus the generic `Dialog` primitive it needed — see
   Progress log.
5. ✅ My NGO (register form + live status card via `GET /ngos/mine` — see Progress log).
   ✅ Invitations (pending list, accept → sign out and re-login as a volunteer, decline, and the
   sidebar's real count badge) — the last `/app/profile/*` screen, so the citizen half of Phase 1
   is complete.
6. ✅ Organization Settings (profile edit + deactivate; the operational-region chips were retrofitted in Phase 2),
   plus the `ngo_admin`-only nested route guard and the responsive NGO/Admin shell it needed — see
   Progress log. ✅ My Account (both roles' routes; see Progress log). ✅ Volunteers (NGO) — the roster,
   invite and remove, `ngo_admin` only; see Progress log for the three backend gaps it surfaced.
7. ✅ Users & Accounts (list + detail, with the moderation history and credibility card it embeds — see Progress log). ✅ NGOs (Admin) — the applications inbox, every organisation, the detail with its roster, and approve/reject; built once the three read routes it needed existed (see Progress log).

### Testing
- ✅ Component: form validation (Zod schemas matching each route's documented required fields),
  password-rule live checklist → **implemented as a strength meter, not a hard gate, since the
  backend only enforces an 8-char minimum, no complexity rule**, OTP auto-submit-on-6th-digit,
  Forgot Password's confirmation state (never an "email not found" branch — see Progress log),
  Reset Password's manual `email`/`token` form fields with URL-param `defaultValues` prefill
  (no link-validity gate — see Progress log), Edit Profile's loading skeleton vs. loaded-but-
  empty-name states (the `null` vs `""` distinction — see the real-bug entry in Progress log),
  Saved-indicator dirty-tracking, `ProfileLayout`'s shared query cache feeding both the sidebar
  and the form, Account Settings' two dialogs (open/close, form reset between opens, error
  banners), the `pendingMessage` store field itself (set → shown once on `/login` → cleared), and
  My NGO's status-driven rendering (a `404` resolves to the register form; a fresh mount shows an
  existing pending row with no form; rejected shows the card *and* the form with a single `h1`;
  active → **Log in again** really logs out and sets the `/login` message; a real failure shows an
  error card that recovers on retry; submit → refetch swaps in the server's row; a `409` from a
  stale page surfaces as an ordinary form error), Invitations (list / empty / load-failure states;
  decline refetches and stays signed in; accept signs out through a real logout with the NGO named
  in the `/login` message; `409`s surface the server's message and refetch; per-card in-flight
  state), the Profile sidebar's real invitation-count badge (shown for n>0, absent for 0/unknown/a
  failed fetch), the query cache being dropped on logout / account switch but kept on a plain
  token refresh (`queryClient.test.ts`), Organization Settings (pre-fill incl. server-omitted
  contact fields; Save sends *only* changed fields, an emptied field as `""`, and makes no request
  when trimming changes nothing; Discard; client validation before the network; server errors;
  deactivate → refetch shows the server's status; cancel does nothing; `409` in the dialog), the
  `ngo_admin`-only route guard (admin in; volunteer, citizen and platform admin each bounced to
  their own landing route), the responsive NGO/Admin shell (drawer closed by default and out of
  the tab order, open/backdrop/Escape/link-click, desktop rail toggle intact), and My Account (name
  card: read-only email, role/organisation chips, skeleton, load-failure with retry that leaves the
  other sections alive; password card validation; the page: NGO admin vs. platform admin — no
  `GET /ngo/me` for the latter — a failed org lookup just omitting the chip, the real partial save,
  a password change ending the session with the message, a wrong current password staying signed in,
  and staff-worded delete/deactivate ending the session), plus the avatar-menu "My Account" link
  for both consoles, and Volunteers (roster rows with status and the honestly-labelled "Account
  created" date; loading/empty/failure-with-retry as three distinct states; invite sends the trimmed
  email, closes, and acknowledges with a notice, keeps the dialog open with the server's own message
  on a refusal, catches a malformed email and the admin's own address before the network, and
  reopens clean; a deactivated organisation swaps the Invite button for an explanation while removal
  stays; an organisation-lookup failure still leaves Invite available; remove confirms first, sends
  the right account id, refetches, and on a stale-roster `403` shows the server's message and
  refreshes; cancel does nothing), plus the sidebar hiding Volunteers and Organization Settings from
  an `ngo_volunteer` and showing both to an `ngo_admin`, and Users & Accounts (the filter, count and
  which-status-action logic as pure functions — search matches email or id case-insensitively,
  Reactivate is never offered for a pending-verification account, nothing at all for your own; the
  toolbar, table with the own row marked and given no action, pagination ranges, the load/no-match
  states; the status dialog's copy per action and per role with the reason required and trimmed; the
  log dialog; the detail's parts — a real score vs "Not scored yet" vs a stored zero, history states,
  not-found vs load error; `getAllAccounts` for one page, none, many, offset-drift de-duplication
  and the safety cap; the list page — every page loaded, search across all of them, role/status
  filters, clear, URL state read and clamped, two changes in one tick, paging and filter-resets-page,
  suspend/reactivate including a failed log entry, a 409, a refused change and a clean reopen; and
  the detail page — real fields, recording admins named, 404/400 vs a real error, per-card failures
  that leave the rest alone, suspend/reactivate, your own account, and a log entry leaving status
  untouched), and NGOs (the filter logic — tabs, counts, and a search over name, contact email,
  applicant email and id; which organisations can be decided; the toolbar's tabs and counts, the
  table with Approve/Reject only on pending rows, the decision dialog's copy for each decision — no
  reason field on reject — the detail's header, profile card with its Approved/Rejected wording,
  volunteer roster and load states; `getAllNgos` for one page, none and many; the list page — every
  page loaded, opening on Pending, tabs, cross-tab search, URL state read and clamped, two changes
  in one tick, approve and reject with their notices, a cancelled confirmation, both flavours of
  `409`, another failure kept in the dialog, a clean reopen; and the detail page — real fields,
  404/400 vs a real error, a failed roster isolated to its card, approve and reject from the page,
  and a 409).
- ✅ E2E (Playwright, real backend, for what's built): register → land on `/verify-email` (not
  `/app/onboarding/region` — that assumption was wrong, see Progress log); login of an
  unverified account → lands in the onboarding chain, not the role landing route; an unverified
  citizen cannot reach `/app/home`, `/ngo/dashboard`, or `/admin/dashboard` by direct navigation;
  logout clears the session server-side (verified by re-attempting a protected route after);
  invalid-code OTP shows the real backend error; resend calls the real endpoint; Forgot Password
  shows an identical confirmation for both a real and a fabricated email (proves the
  enumeration-safety actually holds, not just assumed); Reset Password with a fabricated
  token/unknown email gets the real `404 "account not found"`, a real account with a wrong token
  gets the real `400 "invalid or expired code"` — both genuine backend round trips, not stubs;
  Edit Profile loads a real freshly-registered account's real (empty) name, saves a real new name
  via a genuine `PATCH /profile`, and the sidebar reflects it live — reached via the
  `window.__authStore` debug-hook technique (see Progress log's "New architecture" entry), which
  is a real backend round trip for every API call even though the route-guard pass itself is
  faked client-side, not a genuine completed OTP flow. Account Settings deactivates a real
  account for real, then proves reactivation by actually logging back in and landing on real
  (still-unverified) `/verify-email` — not just checking a 200 came back; a wrong password on
  delete gets the real `401 "invalid email or password"`; a real delete redirects to `/login`
  with the message and a follow-up real login attempt confirms the account is genuinely gone. My
  NGO's validation errors never call the network (real assertion, not just an inference); both
  its real `GET /ngos/mine` and `POST /ngos/register` get a genuine `403 "email verification
  required"` from the backend for the debug-hook's spoofed session (proving `RequireVerified`
  routes can't be bypassed that way — see Progress log), and the load failure surfaces as an error
  card with a retry rather than the empty-state form. Its pending / rejected / active states, and
  the submit-then-refetch swap, are the one deliberate exception to "E2E hits the real backend" in
  this whole suite — only `GET /ngos/mine` (and the one `POST` response, in the submit test) are
  stubbed with correctly-shaped fakes, since a genuinely verified account isn't producible here;
  the real client code around them, including the "open the page again" remount and the real
  logout behind **Log in again**, still runs for real (also see Progress log).
  **Invitations is the first spec with no spoofing and no stubbed responses at all**
  (`e2e/profile-invitations.spec.ts`, using `e2e/helpers/seed.ts` — see the debug-hook entry): a
  real registration, the account marked verified + onboarded in Postgres before it logs in, and a
  real `E2E` NGO's pending invitation seeded against it. Then everything is genuine — the list and
  the sidebar badge (visible on Edit Profile before Invitations is even opened), a real decline
  that leaves the account a citizen, a real accept whose promotion is confirmed by reading the
  account's role back from the database (`ngo_volunteer`, `ngo_id` set) and whose re-login really
  lands on `/ngo/dashboard`, and a real `409 "invitation is not pending"` provoked by changing the
  row under an open page. **Organization Settings is the second such spec**
  (`e2e/ngo-organization-settings.spec.ts`): a registered account is made the `ngo_admin` of a
  seeded active `E2E` NGO — the state a real admin approval leaves — and logs in through the real
  UI. It loads the real values, saves and survives a hard reload with the row read back from the
  database, proves the partial patch on the real backend (clearing the email leaves the name and
  phone untouched), shows the server's lower-casing of the email, confirms validation never calls
  the network, and deactivates for real (cancel does nothing; confirm flips the row to
  `deactivated` and signs nobody out). A seeded `ngo_volunteer` of the same NGO sees no sidebar link
  and is bounced to `/ngo/dashboard` when visiting the URL directly. **My Account is the third**
  (`e2e/account-my-account.spec.ts`), with a seeded `ngo_admin`, `ngo_volunteer` and platform
  `admin`: real name/email/role/organisation, a save read back from the database and surviving a
  reload, a blank name never calling the network, a wrong current password getting the real `401`
  and staying signed in, a real password change that lands on `/login` with a message and *really*
  kills the session (a protected route bounces, the old password is rejected, the new one logs in
  to the right console), deactivate → database says `deactivated` → logging in again flips it back
  to `active`, and delete (wrong password rejected, then the row soft-deleted). The volunteer reaches
  it too (it isn't admin-only) and the platform admin's route shows no organisation. **Volunteers is
  the fourth** (`e2e/ngo-volunteers.spec.ts`), the first to drive two real browser sessions against
  each other: a seeded `ngo_admin` lists exactly its own organisation's volunteers (with their real
  active/suspended status, and never a second organisation's), sees the empty state when there are
  none, and reaches the screen from the sidebar. The full loop runs for real — the admin invites a
  citizen through the dialog, the invitation is confirmed `pending` in Postgres with the citizen's
  role untouched, the citizen logs in from a separate session and accepts it from
  `/app/profile/invitations` (role becomes `ngo_volunteer`), and the person then appears on the
  admin's roster. Refusals are the backend's own (`404 "account not found"`, `409 "must be a
  citizen"` for someone already staff — the invitation count in the database stays zero), the admin's
  own address and a malformed one never reach the network (counted with a route spy), removal is read
  back from the database (role `user`, no `ngo_id`, account still `active`, and the removed person
  logs straight back in to `/app/home`), cancelling changes nothing, a roster gone stale under an
  open page gets the real `403`, and a deactivated organisation shows no Invite button but keeps its
  roster and removal. A seeded `ngo_volunteer` has no sidebar link, is bounced from the URL, and a
  direct `GET /ngo/volunteers` with their real token returns the real `403` — so the gate is proven
  on both sides. **Users & Accounts is the fifth** (`e2e/admin-users.spec.ts`), a seeded platform
  admin against the real ~1,000-account list: a fresh registration is found by email with its real
  `Pending verification` status; role and status filters and the no-match state work; paging reaches
  21–40 and the breadcrumb from an account returns to the same page; Suspend and Reactivate from a row
  need a reason, with the status and the moderation log read back from Postgres; a stored credibility
  score shows, and an unscored account says "Not scored yet"; an unknown and a malformed id both give
  "not found"; suspending from the detail page really locks the citizen out (their login is refused
  with "account is not active" in a second browser session) until reactivated, and the history lists
  both entries, newest first, as "You"; logging a moderation action leaves the status alone; another
  admin's entry (recorded through the API) is shown under their real email; an account that changed
  behind the open page gets the real `409`, reported as "already suspended" with nothing logged; your
  own account has no controls; and an NGO admin is bounced from the URL and gets a real `403` from
  the API. Registrations there use the standalone `request` fixture, never `page.request`: a register
  call sets the new account's session cookie, which in the shared jar silently replaced the signed-in
  admin's. **NGOs is the sixth** (`e2e/admin-ngos.spec.ts`) and runs the whole registration loop for
  real: a verified citizen submits through the real My NGO screen, the admin finds the application in
  the Pending tab with its applicant and contact details and approves it, the database shows the NGO
  `active` and the applicant `ngo_admin` with their `ngo_id`, the applicant's old session is dead (a
  reload bounces to login), and logging in again lands in `/ngo/dashboard` with the organisation in
  Organization Settings. A rejection leaves the NGO `rejected` and the applicant a citizen, whose
  session lives on and whose My NGO shows "Not approved" *and* the form again. An application decided
  behind the open page gets the real `409`, reported as "Couldn't approve …" with the view refreshed
  and nobody promoted. The tabs each show only their status (pending, active, rejected, deactivated),
  All shows all four, and search reaches the contact email and the applicant's; a real volunteer count
  shows and Back from an organisation returns to the same filtered view; the detail shows the real
  fields, links the applicant and each volunteer to their account, records the decision, and an
  unknown or malformed id says "not found"; an NGO admin is bounced from the URL and gets a real `403`
  from the API. Applications are made through the real `POST /ngos/register` (accounts verified in
  Postgres first, since it needs a verified token).
  - ⬜ Still not possible: a full "register → really verify via the real OTP → land in the app" E2E
    path and "request reset → really reset → log in with the new password" — both need a real
    OTP/reset token, only server-logged (Redis holds a hash). The DB-seeding helper is the
    substitute for the verified-session half; it doesn't exercise the OTP screens themselves.
    Follow-ups now unblocked: replace My NGO's stubbed pending/rejected/active states with real
    ones the same way, and the *user's own* real verified account (with a real pending NGO) is a
    manual check — reopen `/app/profile/ngo` and it should show the pending card, not the form.
  - ✅ NGO registration → admin approval → promoted account login — now covered end to end
    (`admin-ngos.spec.ts`), as is volunteer invitation → accept → promoted (`ngo-volunteers.spec.ts`).
    **Follow-up now trivial:** My NGO's still-stubbed pending/rejected/active E2E states can be made
    real the same way (submit through the API, decide as an admin) — not yet done.
- ⬜ Manual: 401-refresh-retry against a real expired token.
- ⚠ Known environmental flake, not a code fault: with the default 4 Playwright workers on a busy
  machine (macOS background jobs pegging the CPU), a fresh page's first `page.goto` can exceed the
  30s test timeout and fail as `net::ERR_ABORTED` — a *different* test each run, while `curl` to the
  dev server stays instant. The same suite passes fully with `npx playwright test --workers=2`.
  Seen again at `--workers=2` while finishing Volunteers (two consecutive full runs, and 9 of 30
  executions in a repeat run of that spec): every failure was `page.goto: net::ERR_ABORTED` before
  any assertion ran — never an assertion failure — while the dev server answered 30 parallel
  requests in under 50 ms and the same tests passed 10/10 earlier. The machine is 8 GB with about
  6 of 7 GB of swap in use, which fits a renderer being starved or killed under two Chromium
  workers plus Vite, Docker and an IDE. **Checked with `--workers=1`: the full suite passed 65/65
  (3.9 min), against the backend after it was restarted with the `COALESCE(password_hash, '')`
  fix** — one run, but consistent with the memory-pressure explanation, and it shows the suite is
  green on the new backend code. It was never the backend: the Go process hadn't been restarted
  during the failing runs, and the failures are browser-side aborts before any API call. Use
  `--workers=1` on this machine when a clean result matters. **A later full run sharpened the
  mechanism, and showed `--workers=1` reduces this but doesn't eliminate it:** with Users & Accounts'
  14 new tests (79 in all, 6.2 min, one worker) 77 passed and 2 failed — verify-email's resend and
  Volunteers' stale-roster test — each as `Test timeout of 30000ms exceeded` *while `page.goto` was
  still waiting for `load`*. So the `ERR_ABORTED` is what Playwright reports when the 30 s test
  timeout tears down a navigation that had not finished, i.e. the fresh page's load (hundreds of
  unbundled modules from Vite) stalled for the whole budget; it isn't a spontaneous abort. Both tests
  pass when re-run alone (9.5 s), and the machine still showed ~6 GB of swap in use and a load average
  near 4 with none of this running. Read a lone `goto` timeout in a long run as this, not a
  regression; re-run those tests before suspecting the code. **The last full run (NGOs' 10 tests
  added: 89 in all, 9.5 min, one worker) lost 8 to it** — seven as `Test timeout of 30000ms` on
  `page.goto`, plus an old Account Settings test whose page was fully reloaded mid-test, wiping its
  client-side auth override so it landed on `/verify-email` — spread across five specs, old and new,
  with swap at ~6.3 GB; all eight passed re-run together in 46 s. So: 89/89 green, but not in a single
  uninterrupted run on this machine. A longer test/navigation timeout in `playwright.config.ts` is the
  obvious mitigation and has deliberately been left alone.

**Exit criteria:** every role can register/login/manage their own account for real; NGO
approval and volunteer promotion flows work end-to-end against the real backend. **Met** — the
full auth-screen set (register/login/logout/verify/onboard/forgot/reset), every citizen
`/app/profile/*` screen, Organization Settings and My Account for the NGO and admin consoles,
Volunteers, Users & Accounts (with moderation) and NGOs (with approve/reject) are real and tested
against the real backend, and both promotion flows — NGO registration → admin approval → NGO admin,
and volunteer invitation → accept → volunteer — run end to end. What remains open in this phase is
listed under Testing (the OTP-dependent flows, real states for My NGO's stubbed cards).

---

## Phase 2 — Geo Primitives ✅ Done

Small phase, but everything downstream that picks a region depends on it. It was built in two passes: first
everything the backend supported at the time (Admin Regions, the shared picker, Organization Settings' regions), then
— after you added the routes and the profile field it was waiting for — the rest (admin coverage, the citizen's home
region).

### Screens

| Screen | Route | Role | Status |
|---|---|---|---|
| Onboarding — Region Picker (optional, skippable) | `/app/onboarding/region` | Citizen | ✅ Built — after the name step, never enforced by a guard; saves `home_region_id`. See the *Home region* bullet under *Real deviations* |
| Regions (+ detail) | `/admin/regions`, `/admin/regions/:id` | Admin | ✅ Built — tree, detail, add, edit, and the organisations assigned to each region (no delete: the API has none). See the *Admin Regions* and *Admin coverage* bullets |

The **region picker is a shared component** (province › district › tehsil drill-down, with search), used by
Organization Settings' operational regions, the home-region dialog on Edit Profile and the onboarding step.

| Also built | Where | Status |
|---|---|---|
| Region picker (shared component) + its dialog | `src/features/regions/RegionPicker.tsx`, `RegionPickerDialog.tsx`, `useRegionPicker.ts`, `useRegionChoice.ts` | ✅ Built |
| Organization Settings — operational-region chips (add / remove) | `/ngo/settings/organization` | ✅ Built |
| Home region — Edit Profile card (set / change / remove) and the profile header line | `/app/profile/edit`, the `/app/profile/*` sidebar | ✅ Built |
| Admin NGO detail — operational regions card | `/admin/ngos/:id` | ✅ Built |
| Admin NGOs list — Regions column | `/admin/ngos` | ✅ Built |

### Backend routes (✅ built — `api/01-geo.md`, `api/05-profiling.md`, `api/00-identity.md`)

| Route | Used by |
|---|---|
| `GET /regions?level=&parent_region_id=` | Region picker, Admin Regions, onboarding step (public, no auth) — the screens read the one list and derive everything from it |
| `POST /admin/regions`, `PATCH /admin/regions/{id}` | Admin Regions (the `PATCH` now also refuses a parent loop with a `400`) |
| `GET /admin/regions/{regionID}/ngos?status=` | Admin Regions — *NGOs covering this region* (direct assignments only; `status` is unused, every status is shown) |
| `GET /admin/ngos/{ngoID}/regions` | Admin NGO detail — *Operational regions* (no `boundary`; each item carries its `path`) |
| `region_count` on `GET /admin/ngos` items and `GET /admin/ngos/{id}` | Admin NGOs list — the Regions column |
| `GET /ngo/me/regions`, `POST /ngo/me/regions`, `DELETE /ngo/me/regions/{regionID}` | Organization Settings' region chips |
| `GET /profile`, `PATCH /profile` (`home_region_id`) | Onboarding step, Edit Profile's home-region card, the profile header — the four `home_region_*` keys are omitted while none is set |

### Backend gaps — what's left after your additions (none block the frontend)

The gaps found while building Phase 2 first were six; **three are resolved** — a home region can be stored
(`home_region_id`, optional and skippable), an admin can read which NGOs cover a region and which regions an NGO
covers (`region_count` too), and a region's parent can no longer be set to one of its own descendants. What remains:

| Gap | Effect today | Suggested change |
|---|---|---|
| `regions.boundary` is `geometry(Polygon, 4326)` and nothing validates it | An open ring, a bow-tie and longitude 200 all save (`201`); a `MultiPolygon` or `Point` is a bare `500` | Validate in the domain (`ST_IsValid`, single Polygon, in range) and return a `400` with a message; consider `MultiPolygon` (real district boundaries are often multi-part). The form validates all of it client-side meanwhile |
| Hierarchy is otherwise unchecked | A district can still be created under a tehsil, or with no parent; a province can be given a parent | Enforce province › district › tehsil on create and update. The form enforces it meanwhile |
| `GET /regions` returns every region's full boundary, unpaginated | Fine for a few dozen regions, heavy for a real import; every picker and tree loads all of it | An `include_boundary=false` option (or a separate light list) |
| No `DELETE /admin/regions/{id}` | A wrongly created region can be renamed but not removed (many tables reference `regions` by foreign key) | A delete that refuses while anything references the region |
| Admin `GET /admin/regions/{id}/ngos` lists direct assignments only | An NGO on a province isn't shown under its districts, though it can act on their incidents | The optional `?include_ancestors=true` (with `via_region_id/name`) discussed when the route was specified, if that view is wanted |

### Testing
- **Unit (Vitest + RTL + MSW), 618 tests in all:** GeoJSON validation (every rejection, `Feature`/`FeatureCollection`
  unwrapping, altitude, and the grid-accelerated self-intersection check against the pairwise one on random rings), tree
  building (orphans, dangling parents, parent cycles), the drill-down browse logic, form rules and the changed-fields-only
  patch, `cn`'s handling of the theme's font-size tokens, `updateProfile`'s three-state `home_region_id`, the home-region
  label built from a path, and every component and container: the Regions page (browse, expand, deep links, filter kept across
  navigation, add, edit, coverage card, phone panes, errors), the NGO detail's regions card, the NGOs table's column,
  Organization Settings' region flows, Edit Profile's home-region flows (set, change, remove, refused, a name save never
  carrying it), the sidebar/layout header line, the onboarding step (choose, any level, skip, refused, failed load), and the
  guard behaviour of the one-shot next stop. One test-only footgun: MSW's `*/regions` glob also matches `/ngo/me/regions`, so a
  handler for the former can silently shadow the latter.
- **E2E (Playwright, real backend, real Postgres reads), 127 tests in the suite:** 20 for Admin Regions — the real hierarchy and
  counts, search/filter/deep links/reload, a boundary downloaded and uploaded back, building a province › district › tehsil
  with each row's parent and PostGIS boundary read back, every boundary the API would accept being refused with nothing
  written, edits touching only their own column, moving a district, the level lock, the nothing-changed guard, a **parent
  loop provoked from a stale page and refused by the real API**, a citizen being turned away, a phone run — and three for the
  coverage card (direct assignments only, statuses, links, follows the selected region, the real `403`/`404`); 6 for
  Organization Settings' regions (drill-down add, search, already covered, the real `409`, remove-with-confirm, a phone run);
  4 for the NGO pages' regions (paths, links back, an organisation covering nothing, the Regions column equal to the detail's
  list, the real `403`/`404`); and 8 for the home region — the name step leading to the region step, choosing a tehsil by
  drilling down (`profiles.home_region_id` read back), Skip saving nothing and never being forced again, a whole province,
  the guards, Edit Profile's set/change/remove, a name save leaving the region alone, and a phone run. Every region and NGO
  is named `E2E …`. **No real region or organisation is touched.**
- **Visual:** screenshots at 1440×900 and 390×844 of every new and changed view (list, tree, detail, both region drawers,
  the picker drilled and searched, the remove dialog, the onboarding step, the Edit Profile card and dialog, the profile
  header, both coverage cards, the NGOs list column); zero horizontal overflow in all of them. They caught the level chips
  wrapping, the NGO table clipping its Reject button, and — indirectly — the global button typography bug (see *Real bugs*).

**Exit criteria:** region selection works everywhere it's needed as a reusable component, backed
by real data (note: real Pakistan boundaries depend on the HDX import script the backend roadmap
flags as not-yet-done — if that hasn't happened yet, regions will still work functionally but with
placeholder/hand-drawn boundaries; not a frontend blocker, just don't be surprised by odd shapes).
**Met.** The picker is a reusable component, backed by real data, and used by Organization Settings, Edit Profile and the
onboarding step; an admin can browse, add and edit regions with their boundaries and see which organisations cover each;
and a citizen can choose, change and remove a home region. The real regions here are tiny placeholder squares, as anticipated.

---

## Phase 3 — Facilities, Flood Intelligence & the Map ✅ Done (Offline Map Packages skipped by decision)

The first big visual phase. Establishes the shared `<MapView>` component every later map-using
screen reuses. **Read §2.1 and §2.3 above before starting this phase** — map library and flood
rendering are both corrected from what the design mockups show.

### Screens

| Screen | Route | Role | Pattern | Status |
|---|---|---|---|---|
| Map | `/app/map` | Citizen | W-Map-Split | ✅ Built — flood zones from real geometry, shelter / infrastructure / essential-location layers, search, place and zone cards, "my location" with the risk check, legend, phone Map ⇄ List. See the *Map* bullet under *Real deviations* |
| Shelter Detail | `/app/map/shelters/:id` | Citizen | W-Detail | ✅ Built — identity, capacity, details, an embedded map with the flood zones around it, distance on request, Navigate Here (pinned on a phone). See the *Shelter Detail* bullet under *Real deviations*. **Navigate Here** links to `/app/navigate?destination_shelter_id=` (Phase 7), still a placeholder |
| Resources hub — Local Resources tab | `/app/resources` (`?tab=local`) | Citizen | W-List | ✅ Built — the tab shell (Local live; Aid, Campaigns, Missing persons are Phase 6 placeholders) and the Local tab: shelters and shops of the home region, chips with counts, nearest first on request, Navigate, and Mark as open / closed. See the *Resources › Local* bullet under *Real deviations* |
| Shelters (+ detail) | `/ngo/shelters`, `/ngo/shelters/:id` | NGO | W-List / W-Detail | ✅ Built — the organisation's shelters with KPI figures, filters, search and a per-row occupancy editor (any staff); Register (a map to place it) and Edit — status and certification only — for `ngo_admin`; a detail page with the map, the flood zones around the shelter, and whether citizens can see it. See the *NGO Shelters* bullet under *Real deviations*. Name, kind, capacity and location can't be changed after registering (the API can't) |
| Hazard Zones & Predictions (+ detail) | `/admin/hazard-zones`, `/admin/hazard-zones/:id` | Admin | W-Map-Split | ✅ Built — the paginated zone table beside a map (`GET /admin/map/flood-overlay` with the `min_confidence` slider), Predictions as a second view, Declare (validated client-side) and Resolve (confirmed), and a page per zone. Reuses `MapCanvas`. See the *Hazard Zones & Predictions* bullet under *Real deviations*. No linked incident reports (no route) |
| Facilities (tabs: Shelters/Infrastructure/Essential Locations) | `/admin/facilities` | Admin | W-List | ✅ Built — three tabs over a region scope (every top-level region, or one chosen in the shared picker): Shelters read-only with the organisation named; Infrastructure with Add and Update status; Essential locations with Add and the report log; search, filters and paging; a per-place map that says whether it is inside an active hazard zone. See the *Facilities* bullet under *Real deviations*. No edit, no delete (the API has none) |
| Offline Map Packages | `/admin/offline-maps` | Admin | W-List | ⏸ Skipped by decision (2026-09-25) — see *Offline Map Packages (skipped)* below |

**The shared map component is `MapCanvas`** (`src/features/map/MapCanvas.tsx`), not a component called `<MapView>`: it takes hazards,
places, the selection, a focus request and an `overlays` slot as props and reports the viewport and clicks by callback, so any
container can drive it. The Map's own container is `src/pages/citizen/MapPage.tsx`; the rest of `src/features/map/` is the
pane (search, chips, list, cards, location note), the control stack and legend, and the model / geo / colour helpers
(`mapModel`, `mapGeo`, `floodColor`); data hooks are in `useMapData.ts`; the API is `src/api/floodIntel.ts` and `facilities.ts`. Also shared now: `LocationPicker`
(a small click-and-drag map for choosing one point, used by the NGO's Register Shelter drawer and Admin Facilities' Add drawers; it shades the platform's regions, opens on them and has a “Jump to an area” menu — see *Location picker*), `tiles.ts` (the one place the tile provider
is named), and — in `src/features/shelters/` — `ShelterLocation` (the shelter page's map, flood zones and "distance from me", used by both the citizen's page and the organisation's). The coordinate rules and location fields a form
that places something on the map needs are shared too: `pointForm` (the rules, the GeoJSON point, the writer), `PointFields` (the section: map slot, "Use my location", latitude and longitude, the region note) and `usePointPicker`
(the settled point, the regions to draw, its region, `coverageAt` for a submit, the browser's position) in `src/features/map/`, used by the NGO's Register Shelter drawer and the admin's two Add drawers. The phase-end pass also changed what several primitives do: `TabBar` moves from the focused tab; `Dialog` and `Drawer` return focus to what opened them (`ReturnFocusRoot` in `src/lib/`); `MapCanvas` selects a marker on Enter/Space, leaves a hidden map alone and re-measures before flying; `regionContains` takes `includeBoundary`; `useAdminOverlay` takes `fresh`; and `usePointPicker` returns `coverageForSave`.

### Backend routes (all ✅ built)

| Route | Doc | Used by |
|---|---|---|
| `GET /map/flood-overlay?bbox=&min_risk=` | `03-flood-intelligence.md` | Citizen Map flood layer — real flooding only (model zones under confidence 0.34 are never returned; `min_risk` can only narrow), gzip |
| `GET /admin/map/flood-overlay?bbox=&min_confidence=` | `03-flood-intelligence.md` | Admin Hazard Zones' map — every zone including low, `min_confidence` is the slider, each entry also carries `source` |
| `POST /hazard-zones/risk-check` | `03-flood-intelligence.md` | Citizen Map "risk near me" |
| `GET /hazard-zones/{id}` | `03-flood-intelligence.md` | Map tooltip, Hazard Zone Detail |
| `GET /flood-predictions?region_id=` | `03-flood-intelligence.md` | Map/region prediction data |
| `GET /admin/hazard-zones?from=&to=&status=&limit=&offset=`, `GET /admin/flood-predictions?from=&to=&limit=&offset=` | `03-flood-intelligence.md` | Admin Hazard Zones & Predictions' tables — **paginated envelopes** `{zones,total,limit,offset}` / `{predictions,total,limit,offset}` (default 20, max 100, newest first), no longer bare arrays; not for drawing a map |
| `POST /admin/hazard-zones`, `PATCH /admin/hazard-zones/{id}/resolve` | `03-flood-intelligence.md` | Admin Hazard Zones (declare/resolve); NGO Dashboard "Declare Hazard Zone" (Phase 8) reuses the same call, `ngo_admin` permitted |
| `GET /infrastructure?region_id=`, `POST /admin/infrastructure`, `PATCH /admin/infrastructure/{id}/status` | `04-facilities.md` | Admin Facilities (Infrastructure tab — all three wired), Map overlay |
| `GET /shelters?region_id=`, `GET /shelters/{id}` | `04-facilities.md` | Citizen Map, Shelter Detail |
| `GET /essential-locations?region_id=`, `POST /admin/essential-locations`, `POST /essential-locations/{id}/status-reports`, `POST /shelters/{id}/status-reports`, `GET /essential-locations/{id}/status-reports` | `04-facilities.md` | Resources›Local (list, report), Admin Facilities (list, add, and the report log — the only reader of `GET …/status-reports`) |
| `GET /regions/{id}/offline-map`, `POST /admin/offline-map-packages` | `04-facilities.md` | Offline Map Packages |
| `GET /ngo/shelters`, `POST /ngo/shelters`, `PATCH /shelters/{id}/occupancy`, `PATCH /shelters/{id}` | `04-facilities.md` | NGO Shelters — all four wired (roles: the list and occupancy are any NGO staff; register and `PATCH /shelters/{id}` are `ngo_admin` only). Behaviour verified against the real server is in the gaps table below |

### Backend gaps found building the Map (none block the frontend)

| Gap | Effect today | Suggested change |
|---|---|---|
| `GET /shelters`, `/infrastructure`, `/essential-locations` need a `region_id` and answer by spatial join | No "nearby", no viewport query, no nationwide list: the map asks once per top-level region and filters in the browser; 2 of 8 infrastructure rows lie outside every region and can never be shown | Accept `bbox` (as the flood overlay does) or `near=lat,lng&radius=`, or treat a missing `region_id` as "all" |
| The flood pipeline never resolves superseded zones (**still true**) | The same boxes are stored up to 31 times (640 citizen-visible zones are 68 distinct boundaries); the ingest floor (tiles under confidence 0.01 aren't stored) and the citizen floor shrank the pile but didn't remove the copies. The client collapses repeats | A run identifier so a new run supersedes the old one (the backend knows it isn't built) |
| ~~`GET /map/flood-overlay` has no size limit~~ **Resolved:** the citizen floor and gzip took the whole country from 6.7 MB to 218 KB (24 KB on the wire); still no hard cap, but nothing needs one now | — | — |
| **`POST /hazard-zones/risk-check` has no citizen floor** (new) | It still counts model zones under 0.34 that the citizen overlay hides: with the viewer inside a 0.094-confidence zone it answers `inside_hazard_zone: true, risk_level: low`, so the map says "You're inside a low-risk hazard zone." over a map with **no zone drawn** and a hazard list reading "No active hazards in this area". About 3,300 such tiles are stored, so many citizens would see it. The frontend can't tell a hidden model zone from a manual one in the response | Apply the same floor in the risk check (manual zones always count), so the message and the map agree |
| `POST /admin/hazard-zones` validates almost nothing about `boundary` | Verified: an **open ring, a bow-tie and longitude 200 are all `201`**, and a `MultiPolygon` or `Point` is a bare `500`. The declare dialog checks all of it first, so the bad zones can't come from this screen — but another client could store a zone that draws nowhere or breaks the map | Validate in the domain (`ST_IsValid`, a single Polygon, in range) and answer `400` with a message |
| No `GET /admin/hazard-zones/{id}`; the by-id route is the public tooltip shape | The zone page can't show which account declared a zone, its region or the `flood_prediction_id` (they are only in the list rows), so a declared zone is "Declared by an admin" with no name | An admin by-id route in the full-aggregate shape |
| No route relates an incident report to a hazard zone | The design's **"linked incident reports"** on the zone page can't be built | A `hazard_zone_id` on incident reports (or a `GET` that lists a zone's reports) when Phase 5's data model settles |
| `GET /admin/hazard-zones` has no `source` filter, and the model stacks copies of every cell | Of ~4,000 zones almost all are near-identical model tiles (about 20 copies each), so a page of the table is mostly the same row; the declared zones an admin cares about are buried by date alone. The map collapses the copies; the table can't | A `source=` filter (and, when runs supersede one another, only the current run's tiles) |
| The admin overlay only holds *active* zones | The Resolved tab can't be drawn from it; the page draws the table page's own zones instead | An optional `status=` on the admin overlay |
| A shelter carries only `managed_by_ngo_id`; no address or phone | The card can't say who runs it or where it is beyond the marker | A public shelter detail with the NGO's name and a contact/address field |
| `GET /shelters/{id}` leaves out `region_id`, though its doc says the shape is the same as the list's | The page doesn't need it; noted because a client that expects the key would be surprised | Return it (it is resolved by the same spatial join) or correct the doc |
| `POST /shelters/{id}/status-reports` is write-only — no route reads a shelter's reports back | A citizen's "it's open / it's closed" report can't be shown to anyone, so the Shelter Detail page has no such button | `GET /shelters/{id}/status-reports`, as essential locations have, and/or fold the latest report into the shelter |
| Essential locations have three kinds only (`atm`, `grocery_store`, `pharmacy`) | The design's **Fuel** and **Water** categories have nothing behind them, so the Local tab doesn't offer them | Add the kinds (and import the data), or drop them from the design |
| `POST /essential-locations/{id}/status-reports` has no limit and no weighting | Any signed-in account can file as many reports as it likes, so one person can flip a place between open and closed at will, and everyone sees the last one. The reporter is stored (attributed in the database) but nothing uses it yet | A per-account, per-place rate limit; weight by the reporter's trust score once `credibility_events` exists |
| `POST /essential-locations/{id}/status-reports` on an unknown place is a `404 "essential location not found"`, though its doc says there is no existence check | Harmless — the screen handles it — but the doc is wrong | Correct the doc |
| `GET /essential-locations?region_id=` is unpaginated and has no search | Fine for eight places; a region with thousands returns them all, and the screen shows 25 at a time in the browser | `limit`/`offset` (and a `type` filter) |
| `POST /hazard-zones/risk-check` with `lat`/`lng` omitted quietly checks `(0, 0)` | The client always sends real numbers and refuses non-finite ones, so it is safe, but another client would get a meaningless "no hazard" | Require both fields (`400` when absent) |
| `PATCH /shelters/{id}` changes only `status` and `certification_status`; anything else in the body (a new name, capacity, location) is ignored with a `200`, and there is no delete | A shelter's name, kind, capacity and location can never be corrected after registration — a typo, or a capacity that changes, is permanent, and a shelter registered by mistake can't be removed. The register drawer says so before saving and the edit drawer shows those fields read-only | Let the managing organisation's admin edit name, capacity and location (a partial patch), and add a delete or deactivate that refuses while other rows refer to the shelter |
| `PATCH /shelters/{id}/occupancy` bounds `capacity_current` to `[0, capacity_total]`, and its doc says the field is required but an **empty body is a `200` that sets it to `0`** (verified) | A shelter can't record being over-full — over-capacity is exactly what a flood shelter reports, and the citizen UI can show it but nothing can produce it — and a client that leaves the field out would silently zero a headcount (this one always sends a number, and refuses anything over the capacity before asking) | Allow more than the total (or an explicit overflow figure), and make the field truly required (`400` when absent) |
| `POST /ngo/shelters` checks none of the point, and `500`s on some shapes | Longitude 200 / latitude 95 and a swapped latitude/longitude are all `201`; a Polygon, a three-number point and a capacity over 2,147,483,647 are bare `500`s (all verified). The register form checks all of it, so this screen can't cause them, but another client could store a shelter nobody can find | Validate in the domain (ranges, a `Point` of two numbers, a 32-bit capacity) and answer `400` with a message |
| A shelter outside every region registers fine but is never returned to citizens (the public reads are per region, as for infrastructure) | An organisation could register a shelter no citizen would ever see (it happened in real use). The register drawer now shades the regions on its map and **refuses** a point outside them; the detail page still says so for one that exists, by a point-in-polygon over `GET /regions` in the browser | Return the resolved region (or a warning) from the register call, and/or accept a bbox or `near` on the public reads |
| **Certification is self-declared.** The managing organisation's own admin can set `certified` through `PATCH /shelters/{id}`, and no route lets anyone review it | The doc says registration is "explicitly not self-certification", but the same admin can certify a moment later; the admin's Facilities tab is oversight only. Citizens see "Certified" as though someone had checked | An admin-only route to certify (and stop the organisation setting `certified` itself), or record who certified and when |
| No organisation-status guard on shelters: a **deactivated** organisation can still register shelters, update occupancy and close them (verified) | Staff of an organisation an admin has switched off keep changing what citizens see. The UI doesn't restrict it either (the Volunteers page pre-empts a `409` for invitations; there is none to pre-empt here) | Decide the policy, then refuse when the organisation isn't `active` |
| `GET /ngo/shelters` is unordered and unpaginated, carries no `region_id` though the doc says it is the public shape, and there is no NGO-side read by id | The screen sorts, searches and pages in the browser; the detail page reads the public `GET /shelters/{id}` plus `GET /ngo/me` to tell whether a shelter is the organisation's | `limit`/`offset` and an order, `region_id` on the row, and a by-id route (or the managing organisation's name on the public shelter) |
| `POST /admin/infrastructure` and `POST /admin/essential-locations` check none of the point, and `500` on some shapes | Longitude 200 / latitude 95, a swapped pair and a point outside every region are all `201`; a Polygon or a three-number point is a bare `500`; duplicate names are allowed (all verified). **A place outside every region is created but no route can list, edit or delete it** (the E2E adds one and shows no region query returns it), so a typo'd coordinate is a phantom, permanently. The Add drawers check every coordinate and **refuse** a point outside every region (the first version only warned) | Validate in the domain (ranges, a `Point` of two numbers) and answer `400`; return the resolved region (or a warning) from the create call |
| No way to edit or delete infrastructure or an essential location — infrastructure has only its status, an essential location nothing | A wrong name, type or position, and a duplicate, are permanent; the Add drawers say so before saving | A partial-patch edit for name and position, and a delete that refuses while other rows refer to the place |
| There is **no admin list**: the only reads are the public per-region ones, whose rows also carry no `region_id` although the docs say they do | "Everywhere" is one request per top-level region, so an admin can't list a place outside every region, count the platform's facilities in one call, page or search on the server, or see which region a row is in without a browser point-in-polygon; an essential location list may be thousands of rows fetched whole | An admin `GET /admin/facilities?kind=&region_id=&q=&limit=&offset=` (regionless places included), and `region_id` on every row |
| **An essential location's status can't be corrected by an admin.** Its only writer is the crowd (`POST …/status-reports`, any signed-in account, no limit); an admin can file a report like anyone (verified) but the next citizen's report replaces it, and the log names no reporter | Nothing in the console can lock a false status, or tell whether a run of flip-flopping reports is one person; the log dialog says who *isn't* shown | An admin override or lock on a place's status, and the reporter's id (or trust score) visible to admins in the log |
| `confidence_score` is the model's **mean flood probability** over the box (`mean_prob`), not a confidence in the prediction (verified against all 197 real cells; `peak_prob` matches none) | The web says "model confidence" (the API's word), which a citizen may read as "this is 87% likely to flood" when it is nearer "about 87% of this area is expected to flood". The colour ramp and the 0.34 / 0.67 risk thresholds are on the right value | Decide the wording (e.g. "modelled flood probability") — the field could keep its name — or expose both `mean_prob` and `peak_prob` |
| The two spatial rules differ at a boundary: a *region* join counts a point on a shared edge as inside **both** regions, while `POST /hazard-zones/risk-check` counts a point exactly on a *zone's* edge as **outside** | Harmless in practice (a coordinate is rarely exactly on an edge) but it is why the browser has two containment modes; a client that assumes one rule for both will disagree with the server | Document it, or use one rule (`ST_Covers`) for both |
| An infrastructure item has no status **history** — only `last_status_update`, and re-setting the same status moves it | After the fact an admin can't tell "confirmed still at risk" from "changed to at risk", who set it, or what it was before | Record each change (who, from, to, when) — the Reporting & Audit phase's job — and return it |

### Offline Map Packages (skipped)

Not built, on purpose, on 2026-09-25. **What the routes are:** `GET /regions/{id}/offline-map` (public; the latest package for a region, `404` when none) and `POST /admin/offline-map-packages`
(`admin`/`super_admin`; body `region_id`, `package_url`, `version`, optional `size_bytes`; always inserts a new row, so a region accumulates a version history of which only the latest is ever returned). The backend
**does not generate or host the bundle** — it stores a pointer to a file made out of band — and no such file exists yet: the five rows in `offline_map_packages` (Test Province ×3, Sukkur, Larkana) point at
`storage.example.com` placeholders. Citizen web never downloads one (offline packs are mobile-only, `WEB_DESIGN_PLAN.md` §6.4). **Why it waits:** there is nothing real to register, the mockup (Batch 5 §5h — build status,
zoom levels, "includes", downloads, stale count, "Rebuild all stale", an auto-rebuild toggle, CDN size) has **no backing routes at all**, and there is **no list route**, so an honest list would be one lookup per region
(a `404` meaning none). **The thin version, when wanted:** a register dialog (region from the shared picker, package URL required and http(s), version required, size a whole number ≥ 0 or blank; the API's `404 "region not
found"` and its `400`s shown as its words), a list of the regions that have a package (per-region lookups over the cached region tree), and a latest-package detail. Nothing else in Phase 3 depends on it.

### Build steps
1. ✅ (built as `MapCanvas`) Base `<MapView>` component: Leaflet `MapContainer`, OSM tile layer, bbox-aware data fetching on
   pan/zoom (matching `GET /map/flood-overlay?bbox=`'s contract), viewport fit/zoom-lock pattern
   borrowed directly from `map-preview/src/App.jsx` (`FitBounds`, `ZoomOutLock`, `LocateOnLoad`,
   `LocateButton` are close to drop-in).
2. ✅ Flood layer per the corrected spec (§2.3) — generic GeoJSON polygon renderer, continuous
   probability color, not the mockup's blob styling.
3. ✅ Shelter/infrastructure/essential-location marker layers, layer-toggle chips.
4. ✅ Shelter Detail, ✅ Resources›Local.
5. Admin: ✅ Hazard Zones & Predictions (reuses `MapCanvas` in split-view); ✅ Facilities (three tabs, the shared
   `LocationPicker`/`PointFields` in its Add drawers); Offline Map Packages skipped for now (see below).
6. ✅ NGO Shelters (registration, occupancy editor, certification patch — the last is the status/certification edit; see the *NGO Shelters* bullet).

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

### Testing done so far (Map)
- **Unit (Vitest + RTL + MSW), 749 tests in the whole suite (+131 for the Map):** the colour ramp and outline/fill rules at their
  boundaries; the geometry helpers (Polygon vs MultiPolygon, rounding the box outwards and clamping it, the view-area limit, distance
  formatting); the place model (labels, tones, capacity tone/over-capacity/zero-total, "Status unknown", de-duplication) and the
  hazard model (order, **collapsing repeated boundaries**, draw order, matching); the three API calls; every pane part and card;
  the location note's every branch; the hooks (regions and the opening bounds, per-layer per-region requests, the risk check's rounding);
  `MapCanvas` on **real Leaflet in jsdom** (markers named by their type and status, selection by key, tooltip only for the selected
  place, the viewer's dot, polygons and their colours, a bad boundary skipped, draw order, the selected zone brought to the front,
  the un-animated opening fit, the control buttons, the legend's X and Escape, zoom); and `MapPage` end to end over MSW with a
  stub canvas (layers requested only when on, never twice, repeated boundaries shown once, a failed overlay / regions /
  facilities with retry, search, selection from the map and the list, "my location" and "Show zone", both phone views).
- **E2E (Playwright, real backend, real Postgres) — `e2e/citizen-map.spec.ts`, 6 tests, run alone, all passing — again after the backend's overlay changes and the reboot.** The world is `E2E …`
  rows seeded into existing tables (a province with two shelters, a hospital, two essential locations — one with a status report from
  an `e2e-` account, one without — and five hazard zones — a forecast one and four identical copies of one hand-declared boundary), placed **south of the flood
  pipeline's grid** so no real zone can overlap it. Covered: the map opening on the citizen's home region and drawing the seeded zones
  and shelters; the four copies showing as one zone in the map and the list, at its worst risk; the overlay asked for by a rounded
  box and shelters per region, **nothing** requested for infrastructure or essentials until their chips are switched on, and Flood off
  removing every zone; a shelter's capacity, its bar (53%; an over-full one flagged and capped at 100), its
  **Navigate Here** and **View Details** links carrying the real id; a forecast zone opened from the polygon itself loading
  `GET /hazard-zones/{id}` with its confidence, model version and validity window, and a hand-declared zone showing no confidence;
  search across the layers that are on (and saying so when the one holding the match is off), and choosing a result; the legend
  opening and closing by its X and Escape in a real browser; and "Go to my location" (browser geolocation granted) sending a real
  `risk-check`, showing "You're inside a high-risk hazard zone", drawing the viewer's dot, **Show zone** opening the zone and a
  shelter card then saying how far away it is. Seeding helpers (`seedShelter`, `seedInfrastructure`, `seedEssentialLocation`,
  `seedHazardZone`) refuse anything not named `E2E …` or not inside an `E2E …` region.
- **Visual:** screenshots at 1440×900 (default, shelter selected, zone selected, legend + every layer, after "my location") and
  390×844 (map, shelter card over the map, List & filters, legend); **zero horizontal overflow** in all of them. They caught the
  legend hidden under the chips on a phone. Not done: the manual comparison against `map-preview`'s rendering of the same data (§2.3's open
  question) — real predictions now exist, so it belongs to phase end.
- **Test data:** the map spec seeds a whole `E2E …` world per run (a province, 2 shelters, 1 infrastructure, 2 essentials, a status
  report, 4 zones and a forecast) and never deletes it, so 25 runs left 25 provinces — which also stretched the map's default view
  (the box around every top-level region) for anyone without a home region. `e2e/cleanup-test-data.sql` (the earlier guarded
  cleanup, extended to shelters, infrastructure, essentials, their status reports, hazard zones and `e2e-` forecasts; it refuses to
  run if a non-test place sits in an `E2E` region) was run dry first, then committed: 95 accounts, 25 regions, 50 shelters, 25
  infrastructure, 50 essential locations, 25 status reports, 98 zones and 25 forecasts removed, every real row untouched
  (`psql -v end=ROLLBACK|COMMIT -f`, inside one transaction).
- **Not run per the cadence:** the full suite (nothing shared changed except `CitizenLayout`'s additive `fullBleed` prop) and the
  list below. (Shelter Detail then lifted `PlaceCard`'s capacity meter and certification badge into `src/features/shelters/` and split
  `LocationStatusNote` out of `LocationNote`; the map spec was re-run and passes.)

### Testing done so far (Shelter Detail)
- **Unit (Vitest + RTL + MSW), 783 tests in the whole suite (+34 for this screen):** `getShelter` (the path, the id encoded so it can't
  change the route, a `404` rejecting with its status); the coordinates formatter; the shared `CapacityMeter` (current over total,
  the percentage, over-capacity held at a full bar, zero capacity not dividing by zero) and `CertificationBadge`; the header (Back,
  the name, type, both badges, Navigate Here's link, a closed shelter), the capacity card (the meter, "Updated 3 minutes ago", the
  closed note only when closed), the details card, the location card (the map slot, coordinates, asking only when the button is
  pressed, the distance replacing the button, disabled while locating, a blocked location explained in terms of the distance) and the
  loading / not-found / error states; `LocationStatusNote`; and the page end to end over MSW with a stub canvas (reads the id in the URL,
  a skeleton first, the map handed the shelter as `[lat, lng]` and selected with the wheel off, the overlay asked for the box in view, a
  failed overlay said under the map without losing the page, `404` and `400` both "not found", another failure with a retry that
  recovers, nothing asked of the visitor until they press, then the distance and a fit to both places, the map's own locate button,
  a blocked location).
- **E2E (Playwright, real backend, real Postgres) — `e2e/citizen-shelter-detail.spec.ts`, 5 tests, run alone, all passing.** The world is
  `E2E …` rows: a province, an open certified shelter (265 / 400) inside a forecast flood zone, and a closed, pending, over-full
  (330 / 300) relief center. Covered: opening from the map card's **View Details** and comparing the page with the **stored row**
  (`readShelter`: name, capacity numbers, the bar's percentage, the coordinates), the Navigate Here link with the real id, Back returning
  to the map; the closed / pending / over-full relief center saying exactly that; the embedded map showing the shelter's marker and the
  real flood zone around it, having asked the real overlay for a box, **and the page scrolling under a mouse wheel instead of zooming the
  map** (checked to fail when the wheel is left on); an unknown id and a malformed one both giving "Shelter not found" from the real `404`
  and `400`, and Back leading to the map; and, with the browser's geolocation granted, **nothing asked until pressed**, then the
  distance matching a haversine computed from the stored coordinates and the visitor's dot drawn.
- **Visual:** 1440×900 (an open shelter in its flood zone, after locating, a closed over-full one, not found) and 390×844 (top of the page,
  bottom, an open shelter with the pinned button); **zero horizontal overflow** in all of them, and the phone's **Navigate Here** sits 16 px
  above the bottom edge. They caught the map opening too tight and the drifting Details card (see *Real bugs*).
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first (this screen's spec adds a province, two shelters, a zone and a
  forecast per run, plus accounts).

### Testing done so far (Resources › Local)
- **Unit (Vitest + RTL + MSW), 830 tests in the whole suite (+47 for this screen):** the pure logic — which category a place belongs to
  (infrastructure to none), matching, the chips' counts, the order (by name ignoring case; nearest first with name as the tie-break;
  the input never reordered), the Navigate links (a shelter by id, others by `lat,lng`) and reading `?tab=` in both spellings; the
  tablist (the roles, one tab in the tab order, click, and the arrow keys wrapping, Home and End); the chips (counts, `aria-pressed`, no
  Fuel or Water), the scope switch; the row for an essential place (unknown with both buttons, open with only "closed", closed with only
  "open", the report reaching the callback with the place, disabled while busy, Navigate and the distance) and for a shelter (occupancy,
  Details and Navigate, **no report button**); the list ("Show more" only when there is more) and its placeholders; `reportEssentialLocationStatus`;
  and the page over MSW — the tab shell and the URL, nothing asked until the profile and regions have answered, only the home region
  requested, shelters and shops together by name, Everywhere and back, no home region and the hint, the kind filter with counts and its empty
  sentences, no regions, 25 at a time, a failed request and failed regions each with a retry that recovers, nearest first (asked only when
  pressed, sorted, every distance shown) and a refused location, and reporting — the request, the thanks, the refetch, the row's new status
  and buttons, either report for an unreported place, a `404` (says it wasn't sent, refreshes), another refusal (buttons stay usable) and
  dismissing the notice.
- **E2E (Playwright, real backend, real Postgres) — `e2e/citizen-resources.spec.ts`, 6 tests, run alone, all passing (twice in a row).**
  The world is `E2E …` rows at a random location per run: a home province with a shelter (265 / 400) and four essential places (open by a
  report, closed by a report, two nobody has reported on), and a second province with one pharmacy. Covered: the tab shell opening on
  Local and the list showing exactly the home region's five places with their real statuses, "Reported … ago", occupancy, and the Details and
  Navigate links (by id, and by the stored coordinates), the browser having asked for **only the home region**; the chips' counts and kind
  filter, and the other tabs' placeholders keeping their place in the URL across a reload; **filing a report and reading it back from the
  database with the reporter's account** (open, then closed, in order), the row updating, surviving a reload, and **a second citizen in
  another session seeing the same status**; a report about a place deleted behind the open page getting the **real 404**, the notice and the
  refreshed list, with nothing written; Everywhere adding the other province's pharmacy and the home region removing it; and, with
  geolocation granted, nothing asked until pressed, then the list in the order of real haversine distances from the stored coordinates.
  New seed helpers read a place and its reports (with who filed them) and remove a place, all guarded to `E2E …` rows.
- **Visual:** 1440×900 (the list, located and reported, Everywhere, a placeholder tab) and 390×844; **zero horizontal overflow**. They caught the
  misaligned columns and the stretched badge (see *Real bugs*).
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first.

### Testing done so far (Admin Hazard Zones & Predictions)
- **Unit (Vitest + RTL + MSW), 905 tests in the whole suite (+75 for this screen):** the model (titles, the date range as RFC 3339 for the start and end of a day and
  left out when it isn't a real date, a reversed range, the map's view as a closed Polygon, table and detail zones as map entries with and without confidence); the pills, date
  filter and confidence slider; the zone list (a link per zone, source, ago, short id, status; Resolve for an active zone only; Show on map for any; the focused one marked)
  and prediction list (level, model, times, a confidence bar, uncertainty only when present); the Resolve dialog (its copy, confirm, cancel, a server error); the declare dialog
  (empty submit names every gap, JSON / MultiPolygon / bow-tie failures, a good polygon drawn and submitted with only a boundary and a level, a Feature unwrapped, the map's
  view, an uploaded file and an oversized one, a server error, empty on every opening); the detail's parts and states; the six admin API calls (filters as query
  parameters, `min_confidence` only above zero, no `source` in the declare body, the resolve `PATCH` with no body); the page over MSW with a stub canvas and an in-memory zone
  store (the first page and the box the map is asked for, paging and page size, the view read from the URL, Resolved drawing the page and not asking the overlay, Predictions,
  dates and a backwards range, the slider reaching the overlay once settled, Show on map, a click on an outline, empty and failed lists, the phone's List / Map, resolving —
  success, cancel, the already-resolved `400`, another failure — and declaring — success with the view reset, the map's view, a refusal, a boundary that fails the checks);
  and the detail page (a model zone, a declared one, `404` and `400`, a retry, and resolving).
- **E2E (Playwright, real backend, real Postgres) — `e2e/admin-hazard-zones.spec.ts`, 8 tests, run alone, all passing (twice in a row on a dirty database).** The world is `E2E …`
  rows at a random spot south of the pipeline's grid: a model zone (87%), a milder model zone inside it (20%, which citizens never see), three declared zones and a resolved one.
  Covered: the table asking the real route for `status=active&limit=100&offset=0`, rows with their source and level, the Resolved tab, and Show on map drawing the zone; the
  **confidence slider sending `min_confidence=0.5` to the real overlay — the 20% zone disappears, declared zones and the 87% zone stay — and back at 0**; resolving asking first
  (cancel changes nothing), then the database saying `resolved` with a `resolved_at`, the row leaving Active, and **the real citizen overlay no longer returning it**;
  a zone resolved behind the open page giving the **real 400**, reported and refreshed; **declaring** — every bad input named and *no POST sent* — then a good one from the map's view,
  read back from the database (`manual_admin`, medium, active, **created by the admin's account**, no confidence, five vertices), at the top of the list, drawn, and present on the
  citizen overlay (which still lacks the 20% zone); Predictions showing the run's own model version at 87% and 20% (and no map), and the date filter (a future start date, a backwards
  range, Clear); a zone's page compared with the stored confidence, model version and id, resolving from it, and an unknown and a malformed id each saying "not found"; and a
  **citizen** being sent to their home and refused `403` by the real API on both the list and declaring. The seed helpers gained resolved zones, a per-run model version (must start
  `e2e-`), and read-backs of a zone and of the zones an account declared.
- **Visual:** 1440×900 (the table and map, the declare dialog with its outline preview, the resolve dialog, Predictions, a zone's page) and 390×844 (the list, the map, a zone's page);
  **zero horizontal overflow** in all of them. They caught the phone filters filling the screen (see *Real bugs*).
- **Shared code touched** (`MapCanvas`, `MapControls`, `MapLegend`, the zone sorting helpers, `parseBoundary`): the citizen-map, Shelter Detail and Admin Regions specs were
  re-run (Regions' one failure — a `.geojson` upload — passed alone straight after, a parallel-load flake).
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first.

### Testing done so far (NGO Shelters)
- **Unit (Vitest + RTL + MSW), 1,041 tests in the whole suite (+136 for this screen):** the model (the filters, search across name, kind, status and certification, sort by name with a
  stable tie-break, counts per filter *within the search*, the KPI totals, the occupancy check at its edges — `0`, exactly the capacity, over it, empty, fractional, negative, `1e3` — and the
  stepper's bounds); the register form's rules (every empty field named, capacity `0`/negative/fractional/over 32 bits with the largest accepted, coordinates off the globe, the "may be the
  wrong way round" hint, the extremes accepted) and the request built in GeoJSON order; the changed-fields-only patch; the point-in-polygon (inside, outside, a hole, a MultiPolygon, an unreadable
  boundary; the most specific region named with its parents; nothing outside every region); the four new API calls (field names, the id encoded into the path, a number always sent); the parts —
  the occupancy bar, the editor (its preview, "nothing to save", the stepper, every refusal, Enter and Escape, the server's error, the saving lock), the KPI cards, toolbar, list states, the table
  (rows, links, actions per role, the editor opening in the right row and passing its events up) and the region note; the register drawer (every gap named, submitted values, the two kinds as
  one radio group, the swapped hint, the map slot, a refusal, the location button and its blocked/locating states, Cancel) and the edit drawer (exactly the two controls, the read-only facts
  and their reason, Save off until something differs); `LocationPicker` on **real Leaflet in jsdom** (no pin until there is a point; a click reports a rounded point; the map is brought to a
  point set from outside but **not** to one just placed — mutation-checked: removing that guard fails it; it opens on a given point); and both pages over MSW with an in-memory
  organisation — the list (order, totals, no region asked, empty for an admin and for a volunteer, a failed load with a retry, filters and search and their counts, the URL read and written,
  an unknown filter ignored), occupancy (save, one editor at a time, cancel and nothing sent, the server's `400` kept in the editor, a `404` closing it with a notice, a volunteer, focus
  returning to the row's button), editing (only what changed, a refusal, a clean drawer for the next shelter) and registering (every gap named, the request in GeoJSON order, a click filling
  both fields and the pin following what is typed, the region note inside / outside / unavailable, a refusal, a clean reopen, from the empty state) — and the detail page (reads by id, Back keeps
  the view, the region note, occupancy, edit, a volunteer, another organisation's shelter, one with no organisation, a failed organisation lookup, `404` and `400`, a retry).
- **E2E (Playwright, real backend, real Postgres) — `e2e/ngo-shelters.spec.ts`, 18 tests when the screen was built (19 after the location-picker follow-up), run alone, all passing (three runs, the last after the layout changes).** The world is `E2E …` rows at a
  random spot per run: two organisations, a province, and eight shelters (seven managed by the first, one by the second) with a forecast flood zone around one. Covered: **the list** showing exactly
  the organisation's shelters by name — never the other organisation's — with the header total, the four figures, each row's status, coordinates and occupancy compared with the stored rows, and **no
  `region_id` in any request**; the pills and search, the view in the URL and surviving a reload; a **citizen** turned away from the page and refused `403` by the real API. **Occupancy:** saved in
  the row and read back from Postgres, the request body `{capacity_current}` and nothing else, the **public route a citizen uses** returning the same number, a reload agreeing, and the keyboard
  back on the row's button; a number over the capacity, a fraction and an empty field refused in the browser with **no request**, the stepper, Cancel changing nothing; a **volunteer** saving
  occupancy and offered no Register or Edit, then refused `403 "insufficient permissions"` by the real API for both; **a stale page** (the capacity shrunk in Postgres behind it) getting the real
  `400`, then the list refetching so the editor says the new capacity before another try; **a shelter deleted behind the page** getting the real `404` and leaving the list. **Editing:** an admin closing
  and certifying — the body carrying only the two changed fields, Postgres and the public route agreeing — then changing one thing and sending one thing; **another organisation's admin** refused `403
  "this shelter is not managed by your ngo"` for both writes with nothing changed. **Registering:** every empty field and every out-of-range value named with **no POST sent**; the map and the
  fields as one value (a click fills them; typing moves the pin; **dragging the pin** with a real mouse edits them) with the region note naming the seeded province and then, for a point in the sea,
  saying it can't be saved; and a real registration read back from Postgres (`managed_by_ngo_id` the caller's organisation though the request never says so, relief center, open, pending, empty, the typed
  coordinates) that the **region query citizens' map uses then returns**; "Use my location" filling the point from the browser's (granted) position only when pressed. **Detail:** opened from the list
  with the stored values, the marker and the real flood zone on the map, the region note, occupancy updated from the card, and Back returning to `?show=open`; editing from the page; another
  organisation's shelter read-only; an unknown and a malformed id both "not found". **Mutation-checked:** removing the refetch after a refused occupancy save fails the stale-page test, and
  making Edit send both fields every time fails the changed-only test. Seed helpers added (a shelter managed by an E2E organisation, making an account the admin of an existing E2E organisation,
  finding a shelter by name, changing a shelter's numbers or deleting it behind an open page), all guarded to `E2E …` rows.
- **Visual:** 1440×900, **1024×768** and 390×844 — the list, its editor open and refusing, a filter, the register drawer (with a pin and region note, with the outside-every-region warning, with its errors),
  the edit drawer, the detail page (editing, another organisation's, a very long name); **zero horizontal overflow** in all 39 captures. They caught the table crushing at 1024, the half-clipped focus ring, the
  editor's buttons on their own line, and the long tooltip (see *Real bugs*).
- **Shared code touched** (the citizen shelter page's map section, `CapacityMeter`, `MapCanvas`, the tooltip rule): the citizen-map (6) and Shelter Detail (5) specs were re-run and pass — the map spec once failed
  on leftover rows (see *Real bugs*) and passed straight after the cleanup.
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first, twice — once mid-way (this screen's runs, its probes and its visual worlds: 85 accounts, 20 NGOs, 15 regions, 80 shelters, 26 zones, 14 forecasts; every guard 0) and once at the end.

### Testing done so far (Admin Facilities)
- **Unit (Vitest + RTL + MSW), 1,154 tests in the whole suite (+113 for this screen and the shared pieces it extracted):** the model (the three tabs and their parsing; per-kind filter specs; both pill groups counted
  within the search and each other; search by name, kind, status wording and — for shelters — the organisation's name; the natural sort; de-duplicating a place returned for two regions; tab-specific type and status values
  so a stale URL reads as "no filter"); the Add form's rules for each kind (every gap named, the types that belong to each kind — no fuel, no water — the swapped-coordinates hint, the request in GeoJSON order with no
  status); the shared point rules, `pointWriter` and the pure `coverageFor`; the four new API calls; every part — pills, region scope, toolbar, list states (including the partial-failure notice), the three tables (rows,
  the organisation as a link, "Status unknown" and "No reports yet" for an unreported place and never "Open", the actions each kind offers and no others), the Add drawer for both kinds (its copy, every gap, the submitted
  values, the outside-every-region warning, the refusal and the saving lock), the status dialog (three options with the current marked, "Confirm status" for the current one and what it does, the refusal), the report
  dialog (newest first, "shown now", empty, loading, failed) and the location dialog (kind and status, region, "not inside any active hazard zone", checking, failed, inside a zone with its basis and a link); and the
  page over MSW with an in-memory platform — which top-level regions are asked and never a district (**mutation-checked**: asking for every region fails three tests), every place shown once, organisation names from
  the NGO list and a notice when they can't load, only the showing tab read and nothing read twice within the freshness window, the tab and view in the URL, arrow keys, choosing a district in the real picker and
  clearing it, an unknown region ignored and never sent, nothing asked until the regions load, filters, no-match, paging that steps back to the last real page, an empty state per tab, a failed read with a retry that
  recovers, one region's failure with the rest still shown, shelters offering no Add or edit, adding (empty, in a region, in none, saved straight after typing, refused, clean reopen, an essential location), the status
  change (success, "confirmed", refusal, `404`, opens on the item's own status each time), the report log, and the location dialog (no overlay until a place is chosen, worst zone first, never "clear" on a failed check).
- **E2E (Playwright, real backend, real Postgres) — `e2e/admin-facilities.spec.ts`, 16 tests, run alone, all passing.** The world is `E2E …` rows at a random spot per run: a province, two organisations with shelters,
  three infrastructure items (one inside a forecast zone, one inside a *low-confidence* zone, one in neither) and three essential locations (one with a log of three reports); lists are read through the province so
  leftovers elsewhere can't change a count. Covered: **Shelters** — read-only, each row compared with its stored row, the organisation named and linked to its page, "No organisation", no Add and only a location action;
  the status pills and a search by organisation name, surviving a reload; the region scope chosen in the real picker (the requests narrow to it and clearing goes back to every top-level region — the seeded province
  among them), and an unknown region never sent. **Infrastructure** — the list from the database, the type and status pills and the search; **updating a status** (the request is `{status}` and nothing else; Postgres and the
  public route a citizen uses agree) and **confirming the same status really moving `last_status_update`** (read from Postgres); an item deleted from under the open page giving the **real `404`**, reported as gone;
  **adding** — every gap and bad coordinate named with **no POST sent**, then a real row (`safe`, the typed point, GeoJSON order) that the public region route returns and the list shows; and **a point in no region refused** —
  the note before saving, the latitude's message on trying, no POST and nothing in Postgres (the first version of this test added the row and proved no region's list has it; the UI no longer allows that). **Essential locations** — the list with "Status unknown" and "No reports yet", the pills; **the report log equal to the
  table's own rows, newest first, no reporter shown**; adding one (no status, no reports, absent `current_status` on the public route). **Location** — a bridge inside a forecast zone says so with 87% and links to
  that zone's page; a hospital inside a **20% zone the public overlay does not return** is told so, with every overlay request going to the admin route; a utility in no zone and a shelter say "not inside any active
  hazard zone". **Who may** — a citizen and an `ngo_admin` are each bounced from the page and refused `403 "insufficient permissions"` by the real API for adding infrastructure, adding an essential location and
  updating a status, with nothing written. **Mutation-checked:** asking the citizen overlay instead of the admin's fails the low-confidence test. Seed helpers added (read an item and find one by name — including one no
  route can list — delete one behind an open page, a report log with known ages, the report statuses of a place), all guarded to `E2E …` rows.
- **Visual:** 1440×900, **1024×768** and 390×844 — each tab, a filtered list and the no-match state, the report log, the status dialog, the location dialog, the Add drawer (with a pin and region note, with the
  outside-every-region warning, with its errors), the region picker and the all-regions view; **zero horizontal overflow** in every capture. The tables start at `xl` (the lesson from the NGO shelters table) with cards
  below, and the pass caught the unsorted-numbers order (see *Real bugs*).
- **Shared code touched** (the tab bar, the point fields and rules, the coverage note, the shelter register drawer): the NGO shelters (18 then; 19 now) and citizen Resources (6) specs were re-run and pass — Resources failed once on
  the visual pass's leftover rows and passed straight after the cleanup (see *Real bugs*).
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first (80 accounts, 13 NGOs, 10 regions, 26 shelters, 30 infrastructure items, 48 essential locations, 35 reports, 11 zones; every guard 0), and again at the end.

### Testing done so far (Location picker follow-up)

**Unit (Vitest, 26 new tests; the whole suite is now 1,180 in 127 files, all passing):** `coverageAreas` (widest level first and stable within a level; boundaries as Leaflet
positions with their box; an undrawable boundary left out; the box around several; the menu's entries in tree order by whole path, skipping an undrawable region but keeping what
is inside it); `LocationPicker` on **real Leaflet in jsdom** (one shape per region; nothing extra with no regions, still loading or failed; an undrawable region left out; a click
on a shape still places the pin; opening on the shaded areas once they arrive and never again; not moving when there is already a pin; a typed point in none of the areas shown
together with them, one inside zoomed to as before; the menu's entries; choosing an area fits to it and choosing the same one again after moving away does too); `CoverageNote`'s
blocking wording and that a place that exists keeps the old one; both drawers' wording; and the two pages — the regions handed to the map, a point outside every region refused
with nothing sent, focus on the latitude, saved once moved inside, refused for an essential location too, **fail-open when regions can't be loaded**, and a save straight after
typing (before the note settles) refused. **Mutation-checked:** removing the guard from both hooks fails exactly the three refusal tests.

**E2E (Playwright, real backend, run alone):** `ngo-shelters` now **19** tests (one added: every region drawn — the count equals `GET /regions` — the legend, the menu listing the
seeded province by name, choosing it and a click in the middle landing inside it with the note naming it, then a point in the sea refused with the latitude focused, no POST and
nothing in Postgres) and `admin-facilities` **16** (its “point in no region” test rewritten from “accepted, never listed” to “refused, nothing created”); both pass. The first
`admin-facilities` run failed on `3 shelters in` because its random province overlapped the `ngo-shelters` rows left by the run just before — the leftover-data lesson again, not
a code fault; after the guarded cleanup it passed.

**Visual:** 1440×900 and 390×844, the NGO's register drawer and the admin's infrastructure drawer — opened, jumped to an area, a click inside an area (the green note beside the
map), and a point in the sea (the map showing the pin and the shaded areas together, the red note under the map, the latitude's message scrolled into view); **zero horizontal
overflow**. It caught the note sitting below the fold (moved under the map), the refusal's message hidden under the fold (scrolled into view), a blank map for a typed point
outside the areas (now framed with them), the pin's head clipped at the top edge (head-room), and a heavy focus ring on the clicked shape (removed). Leftover `E2E` rows from the
passes were cleaned with the guarded script (dry run, then commit; real regions, shelters and infrastructure intact).

### Testing done so far (Phase-end pass)

**What was run (2026-09-25).** Every item on the deferred list that a real browser and the real backend can answer was written as a spec — **81 new E2E tests in seven files** —
and run alone (`citizen-map-deferred` 13, `citizen-shelter-resources-deferred` 17, `admin-hazard-zones-deferred` 9, `ngo-shelters-deferred` 18, `admin-facilities-deferred` 15,
`location-picker-deferred` 5, `tablet-tables-deferred` 4), against the real backend with no stubbed responses (two routes are *delayed* or *failed*, never replaced: the flood
overlay, to see the previous zones stay drawn, and `GET /admin/ngos`, to see the organisation names fall back). Phone runs use real touch (`hasTouch`, `isMobile`, real touch
events for a pin drag). Seed helpers added, all guarded to `E2E …` rows: bulk shelters, essential locations, organisations (each with its own founder — an account can create only
one organisation) and regions; a region with a hole and a round one with 2,001 vertices; a zone with a hole; a super admin; an organisation-less admin.

**Unit tests: 1,202 in 129 files, all passing** (from 1,154 before the phase-end pass and its follow-ups): the marker keys, the hidden-map resize and the fly-to-a-hidden-map
crash on real Leaflet in jsdom with a container whose size the test controls, the tab bar from the focused tab, dialog and drawer focus return (a state-opened dialog, a
conditionally mounted one, an autofocused first field, a drawer, a real `Trigger`, an opener that has gone, a caller that objects), the location check asking afresh,
boundary-inclusive and strict containment (edges, corners, a hole's rim, the neighbouring region), and the fresh-list retry on both pages. **Every fix was mutation-checked** —
the test fails with the fix removed.

**Full E2E suite, run spec by spec:** **all 30 spec files pass — 268 tests, 0 failed, 0 flaky, 0 skipped, about 25 minutes of test time** (the 187 that existed plus the 81
above). Each file was run alone with one worker, with the guarded cleanup (dry run, then commit) before it — the leftover rows of one file can join another's random 0.6° world
and fail a count (it happened three times during this pass), so a single uninterrupted run is not the safest way to run a suite that seeds spatial data. `page.goto` load-stalls
did not return after the 2026-09-24 reboot.

**The `map-preview` comparison (item 8), done at the data level.** The manifest holds ~30 samples per grid cell (19,964 in all); the backend's 3,975 `manifest-2022-epoch7` zones
cover 197 cells. For every one of the 197, the set of stored `confidence_score` values equals the set of that cell's manifest `mean_prob` values ≥ 0.01 (the ingest floor), and
for none does it equal the `peak_prob` values. `map-preview`'s colour stops and interpolation are the app's, stop for stop. What it does not settle is wording: see the
*confidence* row under *Backend gaps*.

**Visual:** 390×844, 768×1024 and 1024×768 for the NGO and Admin lists (users, organisations, regions with a region open, hazard zones, facilities, volunteers with a volunteer,
shelters, organisation settings), the drawers and dialogs on a phone, and the picker over 313 nested regions (nested regions read darker where they overlap, and it stays legible
— no lighter shading or level filter needed at this size). Cleanup after each pass with the guarded script; the real regions, shelters and infrastructure were intact throughout.

**Recorded, not changed — small product questions for you:** (1) Escape closes a half-filled Register or Add drawer and the form is empty next time (outside clicks are already
ignored) — should Escape ask first? (2) The header still offers *Register shelter* to an NGO admin whose account has no organisation; the API refuses it in words. (3) Pagination
reads "1–20 of 4003" with no thousands separator (the facilities list has one). (4) Everything outside the shaded areas is refused by the drawers, so a shelter in Balochistan
needs an administrator to add its region first — as the drawer says.

**Not run, and why:** items 6 (second half) and 13 wait for the backend to apply the citizen floor to `risk-check`; 20 for Phase 6; 27, 35 and 43 for backend changes that do not
exist; the two cases and the MultiPolygon zone that the real database cannot hold are covered by unit tests or are impossible. A real phone (as opposed to Chromium's touch
emulation) and a screen reader were not used — the roles, names, focus order and live regions are asserted, not heard.

### Deferred tests (run before closing the phase)

**Status of every item below — all run in the phase-end pass on 2026-09-25 unless marked.** ✅ run against the real backend (a new spec file, or a unit test where the real database cannot hold the case); ⏸ waiting on the backend or a later phase; ✗ not possible against the real database.

| Items | Spec (all in `e2e/`) | Result |
|---|---|---|
| 1–8 Map | `citizen-map-deferred.spec.ts` (13) | ✅ 1–5, 7; ✅ 6 (the real pipeline: repeated boundaries collapse, the list equals the map, the whole country loads in seconds and under 2 MB) except its risk-check half ⏸; ✅ 8 (`map-preview` compared at the data level — see the Map bullet). ✗ two cases the real database cannot hold, covered by unit tests: "no active hazard anywhere" (the pipeline's zones cover the country) and "no regions at all". Found: markers ignored Enter/Space; the map jumped on Map ⇄ List; a phone crash on choosing a zone from the list |
| 9–13 Shelter Detail | `citizen-shelter-resources-deferred.spec.ts` (7 of its 17) | ✅ 9–12; ⏸ 13 (the citizen floor on `risk-check`) |
| 14–20 Resources | the same spec (10 of its 17) | ✅ 14–19; ⏸ 20 (Phase 6). Found: fast arrow keys on the tab list |
| 21–27 Hazard Zones | `admin-hazard-zones-deferred.spec.ts` (9) | ✅ 21–26 (paging is checked against `SELECT count(*)` on the ~4,000-row real table); ⏸ 27 (backend). Found: the phone crash on Show on map; dialog focus was lost on close |
| 28–35 NGO Shelters | `ngo-shelters-deferred.spec.ts` (18) and `tablet-tables-deferred.spec.ts` (4) | ✅ 28–34; ⏸ 35 (backend). Found: the autofocus gap in the focus fix; nine tables and panes broken at 768–1024 (see *Real bugs*) |
| 36–43 Facilities | `admin-facilities-deferred.spec.ts` (15) | ✅ 36–42 (150 organisations across two pages, 2,000 essential locations); ⏸ 43 (backend); ✗ "a MultiPolygon zone" — `hazard_zones.boundary` is a `Polygon` column. Found: the location check's cache; the zone-edge rule |
| 44 Location picker | `location-picker-deferred.spec.ts` (5) | ✅ a region with a hole, a 2,001-vertex outline, a region added while a drawer is open, the keyboard route, a finger panning over shaded shapes, 313 nested regions (173 KB; every shape drawn, the menu lists them all). Found: the stale region list at save |

Written down for the Map (**run — see the status table above**) — implement and run them all before the phase closes, then run the full suite, fix what
fails, re-run load-stall timeouts alone (after a reboot they should be gone), and clean the `E2E …` test data:

1. **Phone run** of the same spec at 390×844 with touch: Map ⇄ List & filters keeps the map where it was; the chips scroll under the
   controls; a zone chosen in the list returns to the map with the card shown once; the legend's close button is the topmost element and
   can be tapped; the card overlay scrolls when tall.
2. **Location refused / unavailable / unsupported:** the plain-language note, **no** `risk-check` sent; and the two other risk-check
   answers against the real server — outside every zone (*"The nearest active hazard is X km away"*, with **Show zone**) and no active
   hazard anywhere (place the viewer where the whole database has none).
3. **A citizen with no home region** opens on the box around every top-level region; **no regions at all** shows the notice and a
   frame of Pakistan; a **staff account** visiting `/app/map` is turned away by the guard.
4. **Pan and zoom by hand:** a drag or scroll sends a new box, a small drag reuses the cached response (no request), the previous
   zones stay drawn while the next box loads; keyboard: Tab reaches the markers and Enter selects one, Escape closes the legend.
5. **Every status and kind:** infrastructure `safe` / `at_risk` / `damaged`, essential `open` / `closed` / unknown, a relief center's
   icon, a closed shelter — the marker colour, the card badges and the search's "status" matching for each; a place inside a district
   is returned for its province too and must still show **once**.
6. **Against the real pipeline's zones** (which cover the country): the initial view of a home region inside the grid shows a
   sensible number of collapsed zones, the list is scrollable and its count matches, and zooming right out to the whole country loads
   quickly and draws them (checked once by hand: 70 zones, 219 KB, no notice) — no spec yet, since the count depends on the data.
   Also, **once the backend applies the citizen floor to `risk-check`:** a viewer inside a hidden low-confidence model zone hears
   "no hazard" and the map agrees; today they are told they are inside a low-risk zone over an empty map (see *Backend gaps*).
7. **Selection edge cases:** a selected place survives its layer being toggled off only when it belongs to another layer; a selected
   zone survives a search that hides it; two markers on top of each other; a click on a marker inside a zone selects the marker.
8. The **manual comparison with `map-preview`** noted above.

Written down for **Shelter Detail**, not yet run:

9. **Phone run** of the same spec at 390×844 with touch: the Navigate Here button stays pinned above the bottom edge while scrolling and
   never hides the last card (the page keeps its bottom padding); the embedded map can be dragged and its zoom buttons and legend used
   inside the card; the legend's close button is the topmost element (as on the map).
10. **Location refused / unavailable / unsupported:** the plain-language note in terms of the distance, no distance shown, the button left
    to try again, and the map's own locate button doing the same.
11. **Other shelters:** a shelter with **no managing NGO** (the API omits `managed_by_ngo_id`) renders identically; **zero capacity**;
    exactly full (100%, not "over"); a shelter far from the visitor (hundreds of km — the map fits both, the distance reads in km).
12. **Guard and navigation:** a staff account visiting the URL is turned away; **Back to map** from a page reached by a direct link (no
    history) still works; the browser Back button from the page returns to the map.
13. **Once the backend applies the citizen floor to `risk-check`:** add a "flood risk at this shelter" line (the server's answer for its
    coordinates) and test it against a shelter inside a visible zone, inside a hidden low one, and in none.

Written down for **Resources › Local**, not yet run:

14. **Phone run** of the same spec at 390×844 with touch: the tabs scroll sideways rather than wrapping; a row's Navigate and report
    buttons wrap under the name without overflow; a report from a phone lands the same; the chips wrap.
15. **No home region:** a citizen with none lists everywhere and follows "Set your home region" to Edit Profile; and a home region that is a
    **tehsil**, a **district** and a **province** each lists that region's places (the API's spatial join returns a place for every region
    containing it).
16. **More than 25 places:** seed thirty essential locations and check 25 show, "Show more (5 more)" reveals the rest, and changing the kind
    or scope starts again from 25.
17. **Location refused / unavailable** on this tab: the note in terms of the order, the list left by name, the button left to try again.
18. **Reporting edge cases:** pressing quickly on two rows (the second waits for the first); the same person flipping a place open, closed,
    open (each filed, the last one shown); a place in a different region than home (under Everywhere).
19. **Guard and keyboard:** a staff account visiting `/app/resources` is turned away; the tablist by keyboard alone (arrow keys, Home, End,
    Tab into the panel).
20. **At Phase 6:** replace the three placeholder tabs with the real screens and re-run 14 and 19 for them.

Written down for **Admin Hazard Zones & Predictions**, not yet run:

21. **Phone run** of the E2E at 390×844: List ⇄ Map keeps the map where it was; Show on map moves to the Map pane; the pane scrolls as one; the declare and resolve dialogs
    fit; a zone's page has no overflow.
22. **An `ngo_admin`'s side of the role split** (needs a seeded active NGO and its admin): declaring succeeds and files `manual_ngo`, the citizen overlay shows it, and
    **Resolve is refused `403`** — the route is admin-only even for a zone the NGO declared; the page itself is turned away (the Admin route group). Belongs with the NGO dashboard's "Declare Hazard Zone".
23. **Paging and filters against the real table:** page 2 and a page size of 50 (`offset` and `limit` really sent, "21–40 of N"), a date range that matches a known
    zone and one that matches none, the status filter's totals against `SELECT count(*)`, a page past the end (the message), and resolving the only row of the last page (the page steps back).
24. **The map at scale:** the whole country at slider 0 (thousands of stacked copies collapsed to a few hundred outlines) stays responsive; panning sends a new box and the previous zones
    stay until it arrives; the slider at 0.34 matches what citizens see.
25. **Declare edge cases:** an uploaded `.geojson` (a `Feature`, a `FeatureCollection` of one, one with altitude); a polygon with a hole; a zone declared over an existing one (both listed,
    both drawn); the dialog closing on Escape and starting empty again.
26. **Keyboard and screen reader:** the icon buttons' names (title, id, "on the map" / "Resolve"), the pills' `aria-pressed`, the slider's `aria-valuetext`, focus returning to the
    row's button after the resolve dialog closes.
27. **When the backend adds an admin by-id route or a `source` filter:** show who declared a zone and its region on the zone page, and a Declared / Model filter on the table.

Written down for **NGO Shelters**, not yet run:

28. **Phone and tablet runs** of the E2E at 390×844 with touch and at 768 and 1024: rows are cards (actions top right on a tablet, stacked on a phone); the occupancy editor and its buttons fit; the register drawer
    scrolls with the map inside it and a **touch drag of the pin** moves it (the mouse drag is covered); "Use my location" works; the edit drawer and the detail page have no overflow. Also give the earlier NGO and Admin
    tables the same look at 768–1024, since the sidebar leaves them less room than their `md` breakpoint assumes (see *Real bugs*).
29. **Register edge cases against the real API:** a capacity of exactly 2,147,483,647 is a real `201` and 2,147,483,648 is never sent; a very long name; the same name registered twice (the API allows it — both listed); a point on the
    border between two regions; a comma decimal (`24,86`) refused as "has to be a number"; **a point outside every region — now refused by the drawer** (E2E-covered: nothing is sent or stored); to prove the API side once more, POST one
    directly with the organisation's token and confirm it is listed for the organisation but returned by no region query and absent from the citizen map; registering from the empty state.
30. **Roles and organisations:** an organisation with no shelters (the empty state, for an admin and a volunteer, against the real API); a shelter with **no managing organisation** (seed one) opened by an admin — read-only; staff of a
    **deactivated organisation** registering and updating (the API allows it — decide the policy, see *Backend gaps*); an account with no organisation reaching the page (the real `403`).
31. **Concurrency:** two admins editing the same shelter (the last write wins; the "was N" figure is stale until the refetch); occupancy changed in another tab while the editor is open (the refetch on window focus must not
    lose what is typed); an edit refused after the shelter was deleted (the drawer's `404` path, with the real API).
32. **Cross-role, both UIs:** the organisation updates occupancy and closes a shelter, and a citizen's open map card and Shelter Detail then show the new number and status after their next refetch (this spec proves it through the
    public route, not through the citizen's screen).
33. **Keyboard and screen reader:** the icon buttons' names ("View …", "Update occupancy for …", "Edit …"), the occupancy button's `aria-expanded`, the pills' `aria-pressed`, the editor's `aria-describedby` hint and `aria-invalid`,
    tabbing through the register drawer (the map is skipped; the coordinate fields are the way), Escape closing a drawer without losing a half-filled form by accident (outside clicks are already ignored).
34. **Scale:** a hundred shelters (there is no pagination): the list stays responsive, search and the pills are instant, the rows with an editor open don't jump; a thousand is a backend conversation (see *Backend gaps*).
35. **When the backend changes:** the name, capacity and location become editable (extend the edit drawer and drop the "can't be changed" warnings), a delete exists, occupancy may exceed the capacity, the row carries its `region_id`
    (drop the browser's point-in-polygon for listed rows) and certification is reviewed by someone else (say who certified).

Written down for **Admin Facilities**, not yet run:

36. **Phone and tablet runs** of the E2E at 390×844 with touch and at 768 and 1024: rows are cards (actions top right on a tablet, stacked on a phone); the tab bar scrolls sideways; the location dialog's map can be panned and zoomed
    with touch; the Add drawer scrolls with its map and a **touch drag of the pin** moves it; the region picker, status and report dialogs fit; no overflow anywhere.
37. **Add edge cases against the real API:** the same name added twice (both listed, indistinguishable, neither removable); a very long name; a point exactly on the border between two regions; a comma decimal (`24,86`); "Use my location" with
    the browser's position granted (the shelter spec covers it once; this is the admin's own drawer); adding as a `super_admin`; a place added and then found under the region that contains it and under its parent province.
38. **Scale:** "every region" with thousands of essential locations (the whole list is fetched, filtered and paged in the browser — measure the requests, the payload and the time to interact, and 25-row paging with filters); a few
    hundred organisations for the shelters' names (`GET /admin/ngos` pages of 100); a region that is a tehsil, a district and a province each as the scope. One region's request failing can only be forced with a stub — it is
    covered over MSW, not against the real server.
39. **Roles and edges:** a `super_admin` sees the screen; an `ngo_volunteer` is bounced; `PATCH …/status` on an unknown and on a malformed id against the real API (`404` and `400`); a shelter with **no managing organisation** (the API omits
    `managed_by_ngo_id`) and one whose organisation was rejected or deactivated (its name still shows); an organisation list that fails while the shelters load.
40. **Cross-role, both UIs:** the admin sets an item to at risk and a citizen's open map card / marker colour shows it after the next refetch; the admin adds an essential location and the citizen's Local resources lists it; a citizen files a report
    and the admin's open report log shows it after a refetch; the admin's Location dialog against a zone that is then resolved in another tab (the answer follows).
41. **Keyboard and screen reader:** the tablist by arrow keys (unit-tested, not driven in a browser), the pills' `aria-pressed`, the status dialog's radio group and its "(current)" label, focus returning to the row's button after any dialog or
    drawer closes, the icon buttons' names ("Location of …", "Update status of …", "Status reports for …"), the location dialog's trap and its map controls.
42. **Hazard-check accuracy:** a point exactly on a zone's edge; a zone with a hole the point is in; a MultiPolygon zone; several stacked zones of different risk (the worst is named — unit-tested with two, not against the real pipeline's copies).
43. **When the backend changes:** an admin list route (drop the per-root fan-out, list regionless places, page and search on the server), edit and delete for infrastructure and essential locations (add them to the rows and the drawers, drop the
    "can't be changed" warnings), an override or lock on an essential location's status with the reporter visible to admins (add both to the report log), and a status history for infrastructure.
44. **Location picker at scale and on devices:** the platform with hundreds of districts and tehsils — the size of `GET /regions` (every boundary), the time to draw them all on
    the small map, the menu with hundreds of entries, and whether nested regions need lighter shading or a level filter; a region added while a drawer is open (the region list is
    cached for 30 s — the new area appears after a refetch); regions with holes, a MultiPolygon and very complex outlines; a real phone — tap to place, drag the pin, pinch, and
    that the shaded shapes never get in the way of panning; the keyboard route (the menu, then the coordinate fields) and a screen reader hearing the note and the refusal.


**Exit criteria:** the shared map component is real, correct per §2.3, and reused (not
reimplemented) by every screen above.

---

## Phase 4 — Trust ✅ Screens done (Safety Groups incl. live location, Credibility, Alert Preferences, Edit Profile, Activity Timeline) — phase-end pass still to run

### Screens

| Screen | Route | Role | Pattern | Status |
|---|---|---|---|---|
| Safety Groups (+ detail) | `/app/safety-groups`, `/app/safety-groups/:id` | Citizen | W-List / W-Detail | ✅ Built (CRUD) — the circle in four sections shown by name and email, "How people invite you" (your email, your Member ID with Copy), Invite by email or Member ID, Accept / Decline, Cancel request, Remove (confirmed), a detail page per connection, and a sidebar count of requests waiting on you. **No groups or live-location switch** — see *Real deviations* and *Backend gaps found building Safety Groups*. The live-location toggle waits for the WebSocket (step 3 below) |
| Credibility | `/app/profile/credibility` | Citizen | W-Settings | ✅ Built — the score as a ring with the date it last changed, "Not scored yet" for an account never scored, and "How it works"; **no level, statistics, tips or history** (the API has none — see *Backend gaps found building Credibility*). The reusable `<CredibilityBadge>` is deferred until its first consumer (NGO Incidents, Phase 5) |
| Alert Preferences | `/app/profile/alert-preferences` | Citizen | W-Settings | ✅ Built — channels (push, SMS, WhatsApp, voice call), minimum severity, language; auto-saves per change, no Save button (per the design plan). **No quiet hours or saved alert locations** (no API). See *Real deviations* and *Backend gaps found building Alert Preferences, Edit Profile and Activity* |
| Personal profile (remaining fields) | `/app/profile/edit` | Citizen | W-Settings | ✅ Done — there are **no remaining editable fields** (the API's profile is `name` + home region, both already built); added a read-only "Your account" card: email, verified, member since |
| Activity Timeline | `/app/profile/activity` | Citizen | W-Settings | ✅ Built — first-person sentences with status pills, a heading per day, filter pills by kind (`?show=`), Load more by offset, a link only for a shelter's status report. See *Real deviations* and *Testing done so far (Activity Timeline)* |

**Where the code is.** `src/api/trust.ts` (types and the five calls; `SAFETY_CONNECTIONS_QUERY_KEY` is shared by the list, the detail page and the sidebar count, so one cache entry keeps
all three in step); `src/features/safetyGroups/` — `connections.ts` (the pure rules: **standing** = incoming / outgoing / connected / declined worked out from the two account ids and yours,
`otherParty` / `partyLabel` / `personLabel` (name → email → "Member XXXXXXXX"), the four sections, the sidebar count, `removeTargetOf`), `inviteHints.ts` (the email you typed, remembered per account) and
`useSafetyConnections` (the shared query with those emails put back on the requests you sent), the hooks `useConnectionActions` (accept / decline / remove, one at a time, refetch on success *and* failure)
and `useInviteMember` (the dialog, the email-or-id form and the request), and the presentational parts (`SafetyGroupsPanel`, `ConnectionRow`, `MemberIdCard` — "How people invite you", `MemberAvatar` — initials when
there's a name, `SafetyGroupDetail`, `InviteMemberDialog`, `RemoveConnectionDialog`, `ActionBanner`, `SafetyGroupsLoadState`, `SafetyGroupNotFound`); containers `src/pages/citizen/SafetyGroupsPage.tsx` and
`SafetyGroupDetailPage.tsx`. There is no `GET /safety-connections/{id}`, so the detail page finds its connection in the list query; an id that isn't in it is the "not in your list" state. Removing from
the detail page goes back to the list with the confirmation passed as router state (shown once, then cleared from the history entry). `CopyButton` and `useCopyToClipboard` are shared (`src/components/ui`, `src/lib`).
The client no longer checks for duplicate or crossed requests itself — the backend now refuses them (see below), so the dialog shows its message.

### Live location — how it is built, and what it does not do
**Code.** `src/lib/reconnectingSocket.ts` is the generic engine — backoff 1 s × 2ⁿ capped at 30 s with ±20% jitter (reset only once a connection has *held* 5 s), a `getUrl` asked on **every** attempt (a token in a query string goes stale), `onFailure` asked before retrying an attempt that never
opened (a browser reports no reason for a failed handshake), `close()` final and `send()` never queuing. `src/features/liveLocation/` is the feature: `locationChannel.ts` (the `ws(s)` URL from the API base, a token refreshed if it has under a minute left, and `classifyRejection` — the same URL over plain HTTP,
where a `401`, the gate's `403 "… active alert"` or a `400` (the upgrader saying "that wasn't a websocket", i.e. every check before it passed) *can* be read), `liveLocationController.ts` (the state machine — no React, so it is tested with a fake socket, fake geolocation and fake timers),
`liveLocationModel.ts`, `shareStatus.ts`, the `LiveLocationProvider` layout route (**above both `CitizenLayout`s**, so sharing survives moving to the map and ends when the citizen app unmounts), `useLiveLocation` / `useWatchLiveLocation` / `useNow`, and the parts (`ShareLocationCard`, `MemberLiveLocation`, `MemberLocationMap`).

**Rules it follows, most of them the backend's, learned by probing it from real browser pages:**
- **One connection per account, last one wins — and the older one stays open but deaf.** So the socket is held **only by the tab in front** (a hidden tab closes it at once and reopens on return), and only while a screen is watching for members or the person is sharing. A grace period of 3 s before closing an unwanted socket
  keeps it (and the positions already heard) across the hand-over from the list to a member's page — found by the E2E, which counted two connections for one page load (React's dev double-mount and the navigation both did it).
- **Foreground-only.** No background location on the web (`WEB_DESIGN_PLAN` §8): the card says so, sharing **pauses** when the tab is hidden (the switch stays on, the status says "Paused — this tab is in the background"), and **never resumes on its own after a reload** (a location share must be turned on by a person, each time).
- **One switch for everyone connected, not one per member as the design plan drew it.** The relay sends every position to every accepted connection; it cannot aim at one. The card says "There's no setting for just one of them."
- **No snapshot on connect.** A viewer only hears a member's *next* ping, so a sharing tab re-sends its last fix every 15 s (a viewer counts a position as live for three of those, 45 s) — and a fix that arrives inside the 2 s send window is held and the **newest** one goes out when it ends, rather than waiting for the next heartbeat.
  Positions are kept only for the session (no history, no "last seen" after a reload — the durable trail the backend writes is not readable through any route).
- **Bad frames are dropped silently by the server** (a non-JSON frame, out-of-range coordinates) and the connection stays open; frames from the relay end in a newline. A position from an account that isn't a connected member is never shown.
- **The gate.** The backend's "only during an active alert" check is a stub that always allows, so the `403` path is built (`blocked-not-allowed`, with "Try again") and unit-tested but **cannot be exercised for real**; likewise an expired session (`blocked-unauthorized`).

### Backend gaps found building Safety Groups — the first two, and the duplicate rule, were fixed on request (2026-09-25, migration 000015)
1. ~~No names.~~ **Fixed.** All four routes that return a connection (`POST`, `GET`, both `PATCH`es) carry `requester_name`, `requester_email`, `recipient_name`, `recipient_email` — always present, `""` when unset or hidden.
2. ~~No way to find a person.~~ **Fixed.** `POST /safety-connections` takes `recipient_email` as an alternative to `recipient_account_id` (exactly one; trimmed, case-insensitive). Both the id and email forms now require an
   **active citizen** recipient — anything else (unverified, suspended, deactivated, deleted, NGO staff, admin) is the same `404 recipient account not found`. The contract I wrote for it is
   `supporting-material/backend-requests/safety-connections-names-and-email-invite.md`; the backend's own doc (`supporting-material/api/06-trust.md`, now re-copied) is authoritative.
   **One deliberate deviation by the backend:** the requester never sees the recipient's name or email until they accept (even after a decline), not only the reverse of what I asked — see *Real deviations*. It lives in one
   function (`CanSeeContactDetails`), a one-line change if you want it looser; the frontend needs no change either way (it falls back name → email → "Member XXXXXXXX", and the email typed).
3. **No groups, member counts or check-ins.** The mockup's named group, "5 members", Safe / No response / Need help tallies and "Request check-in" have no entity or route behind them. *Still open.*
4. ~~The doc is wrong about duplicates, and the backend lets two through.~~ **Fixed.** A pending or accepted connection between two accounts, in either direction, is now `409` ("you are already connected to this person" /
   "this person has already sent you a request" / "a pending connection request already exists between these two accounts"), enforced by a unique index on the unordered pair; asking again after a decline still works.
   Confirmed against the running server. The client-side duplicate check I had written was removed.
5. ~~Any account can be invited.~~ **Fixed** with #2.
6. **Timestamps are in the server's zone** — `POST`/`PATCH` answer in `Z`, `GET` in `+05:00`. Both parse the same; noted only because they look different in a raw response.
7. **Account enumeration is not mitigated (backend's note).** Any signed-in citizen can probe whether an email is a registered active citizen (`404` vs `201`), and there's no rate limit on the route. The recipient's *name*
   isn't revealed by the probe. A per-caller limiter on the email form is the suggested next step; the frontend assumes the `404` behaviour.
8. Already documented: the WebSocket's "active alert" gate is a stub that always allows, so the 403 path can't be exercised yet.

### Backend gaps found building Live location (none block the frontend)
1. **One connection per account, last wins** (`registry.go`): a second tab or device silently makes the first deaf while it stays open. The web works around it by letting only the foreground tab hold the socket, but a person with two visible windows, or the mobile app open too, will lose one of them without any signal.
2. **No snapshot / "last known position" on connect** and no route for the durable trail (`location_trail`, written throttled — a row per ~30 s or 50 m). A viewer who opens the page hears nothing until the member's next ping; the web compensates with a 15 s heartbeat from the sharer.
3. **No "stopped sharing" message.** Silence is the only signal, so a viewer infers it after 45 s. A tiny `{type: "stopped"}` frame on unshare, or on disconnect, would make it instant and precise.
4. **No per-member targeting** — the design's per-member switch can't be built (see above); a `to`/`account_ids` field on the ping would allow it.
5. **A failed handshake carries no reason in a browser**, so the client has to re-ask over plain HTTP to tell "session gone" from "gate closed" from "network down" (it works: `401` JSON, `403` JSON with the gate's message, `400` from the upgrader). Fine as is; worth knowing that `403` is also what a disallowed **origin** returns, in plain text — the app's origin must be in `CORS_ALLOWED_ORIGIN` (it is, for `http://localhost:5173`).
6. **The gate is a stub** (already documented): live location works at any time today.
7. **Redis stream / trail rows for deleted accounts:** a test account that shared leaves `location_trail` rows (the guarded cleanup now removes them); anything the relay still had buffered in Redis for an account deleted meanwhile can only fail its flush — not checked.

### Backend gaps found building Alert Preferences, Edit Profile and Activity
1. ~~`GET /profile/activity-timeline` doesn't exist.~~ **Fixed 2026-09-25**, to the contract I proposed (`limit`/`offset`, `type` filter with the exact `400` message, newest first with ties by id, `[]` for no activity, only the caller's own events, structured `detail`, seven
   types). Differences and findings: a **`place_type`** (`shelter` / `essential_location`) was added to a `status_report`'s `detail`, because its `subject_id` could be either and the id alone can't say which screen to open; **`limit=1000` is reset to 25, not clamped to 100**
   (the doc is explicit); the backend's tests caught a 500 on six of the seven `type=` filters before it shipped; and my claim that every source had an index on its account column was wrong (only 2 of 7) — migration 000016 adds the other five.
2. **No phone number anywhere.** `accounts` and `profiles` have none, so the SMS, WhatsApp and voice-call preferences are switches with nowhere to send to. Adding one (`PATCH /profile`, and shown on Edit Profile) is what "Personal profile (remaining fields)" would really need.
3. **No quiet hours or saved alert locations** in `alert_preferences` — the mockup's two other sections have no fields or routes.
4. **Preferences affect nothing yet.** Alerting (backend Phase 10) isn't built, so nothing reads these settings. They are stored for real; whether delivery honours them can't be tested until it exists.
5. **`language` is free text** (only "not blank" is checked) with no list of supported languages; the frontend offers `en` / `ur` / `sd`, which are the values in the database.
6. **Severity names differ from the mockup** (`general_advisory` / `watch` / `warning` / `critical_emergency` vs Safe / Caution / High / Critical). The backend's are used.

### Backend gaps found building Credibility (none block the frontend)
1. **Nothing writes scores yet**, so every account except the seeded ones is "Not scored yet" (already documented: `credibility_events` is backend Phase 8). The screen is complete for what exists but will look empty until then.
2. **No levels or tiers.** The mockup's "Level 4 · Trusted reporter", next-level progress, and the profile header's level chip need a definition of the levels (names, thresholds) — they aren't in any response.
3. **No breakdown or history.** No reports-submitted / verified / rejected / upvotes counts, no "what changed your score" list, and no points per action — the mockup's statistics, tips and "Recent changes" have no route.
4. **No stated scale.** The response is a bare integer; the column is `INTEGER` with no range check (probed: `-5` and `250` are stored and returned as they are). The ten seeded scores run 10–100 and the mockup is a percentage, so the ring assumes 0–100 (clamped, and "of 100" is only shown for a score inside it) — the same assumption the admin card has always made. Worth stating in the API doc.

Trust score/credibility also appears **embedded** (read-only) inside NGO Incidents and Admin
Account Detail — build those embeds here too, even though the parent screens ship in later phases,
since the embed is a small reusable `<CredibilityBadge>`/`<TrustScorePanel>` component.

### Backend routes (all ✅ built — `GET /profile/activity-timeline` was wrongly listed here as built before it existed; it was added on request on 2026-09-25)

| Route | Doc | Used by |
|---|---|---|
| `POST /safety-connections`, `GET /safety-connections`, `PATCH .../accept`, `PATCH .../decline`, `DELETE /safety-connections/{id}` | `06-trust.md` | Safety Groups |
| `WS /ws/safety-connections/location` | `06-trust.md` | Live location — the share switch (Safety Groups list and a member's page) and the member's live map — first real-time feature, ✅ built (see *Live location* below) |
| `GET /trust-score` | `06-trust.md` | Credibility |
| `GET /accounts/{id}/trust-score` | `06-trust.md` | NGO/Admin embedded credibility badge — Admin Account Detail's credibility card is **built (Phase 1)**; the reusable `<CredibilityBadge>` for NGO Incidents is still to do |
| `POST /admin/accounts/{id}/moderation-actions`, `GET /admin/accounts/{id}/moderation-actions` | `06-trust.md` | Admin Account Detail — **built in Phase 1** with Users & Accounts (history list, Log dialog, and the reason saved by Suspend/Reactivate) |
| `GET /profile`, `PATCH /profile` | `05-profiling.md` | Edit Profile — **the service-layer functions (`getProfile`/`updateProfile`) and the `name` field already exist**, pulled forward into Phase 1 for the onboarding gate; this phase is just the standalone Edit Profile screen reusing them, no new backend work |
| `GET /profile/alert-preferences`, `PATCH /profile/alert-preferences` | `05-profiling.md` | Alert Preferences (auto-saves on change, no Save button, per spec) |
| `GET /profile/activity-timeline` | `05-profiling.md` (*FE-4*) — added 2026-09-25 to the contract in `supporting-material/backend-requests/activity-timeline.md`, plus `place_type` on status reports | Activity Timeline |

### Build steps
1. Profile/Alert Preferences/Activity Timeline first — straightforward CRUD, no real-time. *(Order changed by decision: Safety Groups was started first, 2026-09-25. Done since: Alert Preferences and Edit Profile's account card; Activity Timeline waits on its backend route.)*
2. Safety Groups CRUD (connections, accept/decline). **✅ Done.**
3. **✅ Done.** The WebSocket hook: `?token=<access_token>` query-param auth (browser WS can't set custom
   headers), reconnect-with-backoff, gated behind an active safety connection + active emergency
   per the backend's own gating rules — **note explicitly in the UI** that web location-sharing
   only works while the tab is open/foregrounded (no background-task equivalent to mobile's
   `expo-task-manager`, per `WEB_DESIGN_PLAN.md` §8) — this is a real capability gap to surface
   honestly, not paper over.
4. Credibility screen ✅ + the embeddable badge component (deferred until NGO Incidents needs it; the score helpers and `ScoreMeter` it will use are already shared in `src/features/trust/`).

### Testing
- Component: WS hook's reconnect logic (mock WebSocket, simulate drop/reconnect), alert-preference
  auto-save debounce.
- E2E: two-browser-context test (Playwright) — one account shares live location, the other's
  Safety Group Detail map updates in near-real-time; declining a connection request never receives
  location updates (matches the backend's explicit `pending`/`declined` exclusion).
- Manual: verify the WS auth gate really does reject when there's no active emergency, per the
  backend's documented pre-upgrade checks.

### Testing done so far (Safety Groups)
- **Unit (Vitest + RTL + MSW), 1,337 tests in the whole suite (+94 for the first build, +26 for names and email invites, +15 for the phone nav):** the rules (`standingOf` in both directions and from the other side; `otherParty` /
  `partyLabel` / `personLabel` — name, email, the "Member …" fallback, a whitespace-only name; the four sections in server order; the sidebar count; `removeTargetOf` including `null` for a request waiting on you; the Member ID
  pattern); **fixtures that follow the server's visibility rule exactly** (a request you sent has `""` for the recipient until accepted); the hint store (remembered per account, put back only on an empty, unaccepted request you
  sent, never over what the server sent, capped at a hundred, garbage or blocked storage read as none); every part (the row's names, email line, initials and fallbacks, actions per standing; the panel's sections, counts, empty
  state and routing of each action; the detail page's title, email, facts and actions; the invite dialog's two modes — email default, "Use a Member ID instead" and back, each field's own rules, switching clearing what was typed
  and the error; the confirm dialog's three wordings; the banner, skeleton and failure card; `CopyButton` copying / refusing / no clipboard at all); the sidebar badge and `ProfileLayout` feeding it; and both pages over MSW with an
  **in-memory server that enforces the backend's real rules** (unknown email → 404, own email → 400, the three 409s, hidden recipient details): accept, decline, a 409 shown and refetched, cancel behind a confirm, a 403 kept in
  the dialog, invite by email (as typed → sent as typed, dialog closed, the new row shown under the typed email, remembered across a remount), by Member ID (lower-cased, "Member …"), the shape check with no request, the
  plainer "not found" for an email and for an id, the server's own words for every refusal, asking again after a decline, a clean reopen, the message handed over from the detail page; and on the detail page: found by id, the
  remembered email as the title, unknown id, failure with a retry, accept / decline in place, remove → list with a message, and "the other person removed it first".
- **E2E (Playwright, real backend, real Postgres) — `e2e/safety-groups.spec.ts`, 12 tests, run alone, all passing.** Two people are two real browser contexts, each with a real profile name. Covered: a new account's empty circle and
  "How people invite you" (its **own email and its real Member ID**), inside the profile sub-nav; **Copy** putting the real id on the clipboard; **A invites B by email typed in the wrong case with padding** → the row under the email
  typed, the stored row `pending` / `family` / requester A / recipient B, **still shown after a reload**; then **B's sidebar badge reads 1**, B sees **A's name and email**, accepts, Postgres says `accepted`, and A, after a reload,
  sees **B's real name and email** in place of the typed one; **inviting by Member ID** from the link under the field (a `safety_group`); **the visibility rule against the real API** — for a pending request A's `GET` has the
  recipient's name/email `""` while B's shows both people, and **after B declines** A's row is still only "Member …", the page shows nothing of B, and A's `GET` still has them `""`; then A removing the declined request (after
  the confirm) leaves nothing in Postgres or in B's list; **cancel** (asks first, "Keep request" changes nothing, then gone for B too); the **detail page** by name (heading, email, full id, relationship, requested by, accepted on)
  and **Remove member** (the dialog names the person and says it ends for both) → back on the list with the message, Postgres empty, the other side's deep link "not in your list"; **someone else's connection id** → "not in
  your list", untouched; **the invite's refusals** (not an email; your own email in capitals → the server's message; an email that's nobody's → the plainer message with the dialog still open; and by Member ID: not a UUID, your
  own, nobody's) with nothing created; **only an active citizen can be invited** — an unverified account and a real NGO admin both get the *same* "couldn't find an active member" as no account at all; **the backend's duplicate
  rules** — already connected / already invited / has invited you each refused with the server's own message, exactly one row per pair left in Postgres; and a **phone (390×844)** with all four sections: none missing, the first
  request on the first screen, no horizontal scroll, the detail page the same. API-side checks use the `request` fixture, never a page's (logging in through `page.request` put another account's cookie in the page's context and
  turned the signed-in person into someone else — found when a first draft of the visibility test did it). New helpers: `signInCitizen(..., name)`, `seedSafetyConnection`, `readSafetyConnectionsBetween` (guarded to `e2e-`
  accounts); the cleanup script now removes `safety_connections` of test accounts and refuses to run if one of them is connected to a real account.
- **Visual:** 1440×900, 1024×768, 768×1024 and 390×844 — the list with all four sections, the detail page, the invite dialog with an error, and the remove dialog; **zero horizontal overflow** in all twelve captures (the dialogs at 1440 and 390 included).
  It caught the rows and Member ID card squeezed at 768 (see *Real bugs*) and the header button wrapping under the text at 1440. **Re-shot after the names change** (1440, 768, 390 lists — names, emails, initials, an email-only person, the typed email, a fallback row — the not-found error in the email dialog, the Member ID mode, and the detail page at 1440 and 390): no overflow; long addresses wrap.
- **Profile sub-nav on a phone (added 2026-09-25) — unit (1,311 tests in the whole suite after it, +15):** `currentProfileNavItem` (every route, a connection page under Safety Groups, Overview only at its exact path, nothing for a foreign path); the sidebar's
  menu (names the current section with `aria-expanded` / `aria-controls`, the links stay in the page and hang off `hidden md:flex`, a click reports the opposite state, Escape closes and refocuses the button, Escape while closed
  is ignored, the current section's own count vs the "waiting in other sections" pill, Overview as the fallback) and `ProfileLayout` (starts closed, opens and closes, closes when a link is followed and names the page it
  landed on, isn't still "open" when you come back to the first page). **E2E — `e2e/profile-phone-nav.spec.ts`, 6 tests, all passing:** at 390 one button, every link hidden, the Edit Profile heading on the first
  screen, no sideways scroll; open → every link visible → Escape closes with focus on the button → following a link closes it and renames the button; a seeded pending request showing as "1 waiting in other sections"
  on Edit Profile and, in Safety Groups, as its own count with the first request in the viewport; and the edge — **767px collapsed, 768px and 1440px the plain sidebar with all nine links and no button**. Re-ran
  `safety-groups`, `profile-invitations`, `profile-edit`, `my-ngo`, `account-settings` and `profile-home-region` after the change: all pass.
- **Probed against the real API** (throwaway `e2e-` accounts) before building, and again after the backend change: every status code and message in the new doc, the visibility table row by row, both ways to name a recipient, and each 409.
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first (probes, then the spec's runs; every guard 0). Six connections between real accounts are in the database and were left alone.

### Testing done so far (Credibility)
- **Unit (Vitest + RTL + MSW), 1,356 tests in the whole suite (+19 for this screen):** the score helpers (`isScored` — true only with an `updated_at`, so a stored zero is a score and the implicit zero is not; `scorePercent` clamped at the
  ends; `isOnScale`); `ScoreRing` (the reading as its name, the fill, an empty ring and a dash for no score, a score of 250 or -5 shown as the number with the ring stopped at the ends and no "of 100", the scale ends 0 and 100) and
  `ScoreMeter`; the panel (a stored score with its date, "Not scored yet" for the implicit zero and not "score 0", a stored zero, the "how it works" copy with **no** level / statistics, the skeleton, and a failure with a retry that
  never reads as "not scored"); and the page over MSW (a stored score and its date, the never-scored answer, 250, and a failure that recovers on retry). The admin `CredibilityCard`, which now uses the shared helpers and meter, still passes its own tests.
- **E2E (Playwright, real backend, real Postgres) — `e2e/profile-credibility.spec.ts`, 6 tests, run alone, all passing.** A new account sees "Not scored yet" and an empty ring, inside the sub-nav with Credibility active, while the real
  API says `{score: 0}` with no `updated_at`; a seeded 88 shows as 88 "of 100" with **the date the API gives**, and none of the level / statistics text; **two accounts each see only their own** (73 vs "Not scored yet"); a score changed
  in Postgres shows on the next visit (40 → 61), **250 is shown as 250 with no "of 100"**, and a stored **0 is a score, not "not scored"**; the sub-nav link reaches it; and on a **phone (390×844)** the collapsed menu reaches it, the ring and
  the date are on the first screen, and nothing scrolls sideways. New helper: `setTrustScore` (guarded to `e2e-` accounts; can change an existing score and set one outside 0–100). Re-ran `admin-users.spec.ts` (14) after the admin card
  started sharing the meter: all pass.
- **Probed against the real API:** the fresh-account, stored, negative and 250 answers, the 401 without a token, and the table's constraints (none on the range); the ten seeded real scores run 10–100.
- **Visual:** 1440×900, 1024×768, 768×1024 and 390×844 for "Not scored yet", the scored state at 1440 / 768 / 390, and an out-of-range score at 390; **zero horizontal overflow** in all of them. The ring's empty track was too faint against white and was darkened.

### Testing done so far (Alert Preferences, Edit Profile, Activity)
- **Unit (Vitest + RTL + MSW), 1,393 tests in the whole suite (+37 for these three):** `Switch` (labelled, click and Space, disabled); the option lists (four channels, three needing a phone, four severities in order, `languageOptions` adding an unfamiliar
  value); the panel (each switch in its stored state, described by its line; a toggle, a severity and a language each reported as **a patch of only that field**; the phone note once; the four severities as one radio group with the current
  one chosen and "critical emergencies always reach you"; an unfamiliar language as an extra option; the live "Saving… / All changes saved"; a refused change as a dismissible alert; **no Save button**); the skeleton and failure card; and the
  page over MSW with an in-memory preferences server (the stored state shown; a failed load recovering on retry; only the changed field ever sent; the new value on screen **before** the server answers, with "Saving…"; a severity and a language
  as their own patches; **two quick taps kept in order with no flicker** — a MutationObserver on the second switch records that it changed once and stayed changed; a switch tapped twice ends as the last tap left it; a refused change putting the
  old value back with the server's message; the message clearing on the next success or on Dismiss). **Mutation-checked:** always overwriting the cache with the server's copy (dropping the "another save is queued" guard) fails the no-flicker test.
  Edit Profile's `AccountDetailsCard` (email, Verified, date, an unverified email, a placeholder until loaded, nothing to edit) and the page (the card beside the two editable things; one textbox on the whole page; not drawn when nobody is signed in).
- **E2E (Playwright, real backend, real Postgres) — `e2e/profile-alert-preferences.spec.ts`, 7 tests, and `e2e/profile-edit-account.spec.ts`, 3 tests, each run alone, all passing.** Alert Preferences: a new account shows the defaults every account starts with (push, SMS, voice
  on; WhatsApp off; English; general advisory) inside the sub-nav with no Save button, matching the row in Postgres; toggling WhatsApp **sends exactly `{whatsapp_enabled: true}`**, shows "All changes saved", and Postgres has that change and **nothing else moved** (the
  whole row compared), surviving a reload; a severity (including the highest) and a language each saved on their own and read back from Postgres; **four quick changes** (push off, SMS off, WhatsApp on, push back on) all landing in order, in the database and after a reload;
  what's really stored shown — including a language (`fr`) the screen has no name for — and **two accounts each seeing only their own**; the phone-number note; and a **phone (390×844)** reaching it through the collapsed menu, toggling, choosing a severity, no sideways scroll.
  Edit Profile: the account's real email, Verified, and the creation date **matching `GET /profile`'s `created_at`**; the page having exactly one textbox and no phone / photo / date-of-birth text; and a phone with a very long email wrapping without overflow. New seed helpers
  (`readAlertPreferences`, `setAlertPreferences`, guarded to `e2e-` accounts). Re-ran `profile-edit`, `profile-home-region`, `profile-phone-nav` and `account-my-account` (which share the Edit Profile page or the sub-nav): all pass. The severity cards are clicked by their label,
  as a person would — the radio itself is visually hidden and can't be force-clicked.
- **Probed against the real API:** `GET /profile`, `GET /profile/alert-preferences` and `GET /auth/me` shapes and defaults; and the missing activity route (`404` on five guessed paths, authenticated and not).
- **Visual:** Alert Preferences at 1440, 1024, 768 and 390 (with a non-default severity, language and channel), the saved state, Edit Profile's new card at 1440 and 390, and the Activity placeholder; **zero horizontal overflow** in all of them. It caught the empty "saving" status wrapping onto its own row and leaving a gap under the intro (moved onto the title row).

### Testing done so far (Activity Timeline)
- **Unit (Vitest + RTL + MSW), 1,438 tests in the whole suite (+45 for this screen):** the model (the sentence for each of the seven kinds and each category / vote / status, the pills and their tones, a donation with and without an amount, a shelter vs another place, an unfamiliar status shown as words, a missing `detail`, an unknown
  `type` returning nothing; links — a shelter's status report only; `mergePages` keeping each id once; the day headings for today / yesterday / a date and grouping in the viewer's zone in order; skipping unknown kinds without an empty day; the time; the filter list and reading `?show=`); the panel (headings per day, sentences with
  pills and times, the one link, eight pills with the current one pressed, the skeleton, a failure with a retry that never reads as "no activity", the empty state and the named-filter empty state, Load more and its spinner, and a later-page failure keeping the list with the button turned into a retry); and the page over MSW with an in-memory
  route that applies `type` **before** paging: the first page, an empty account, an unknown kind skipped, a filter asked of the server and kept in the URL, starting from `?show=`, an unknown `?show=` becoming All, a filter with nothing in it, **paging 60 events by offset (25 → 50 → 60, stopping at the short page)**, a full last page finding
  nothing more, a repeated event shown once, a failed later page keeping the list and recovering on retry, and a first-page failure recovering. **Mutation-checked:** removing the dedupe fails both the model and the page test; making the "last page" rule "an empty page" fails the paging test.
- **E2E (Playwright, real backend, real Postgres) — `e2e/profile-activity.spec.ts`, 8 tests, run alone, all passing.** One row of **every kind is seeded straight into the seven tables at exact times** (two today, two yesterday, four ten days ago), beside a second account's own rows in the same tables. Covered: an account with none sees
  the empty state and the API says `[]`; **every kind as its sentence and pills under the right day headings**, and the rows' `datetime`s and order **identical to what the API returns** (the ids `type:row-id` for each seeded row) — while **the other account's rows never appear** (and are seen by that account: blocked road, food, donation 111, a place closed);
  a shelter's status report **links to the real shelter page** and it is the only link; **each filter** showing exactly its kind's count (1, 1, 1, 1, **2** place updates, 1, 1), asked of the server, in the URL and surviving a reload; an empty kind and an unknown `?show=`; **a 68-event timeline paged 25 → 50 → 68** with no repeat or gap and every `datetime` equal to the API
  walked by `offset` the same way; a **phone (390×844)** with the filters wrapping, Load more reachable and no sideways scroll; and the API's own rules the screen leans on — `type` filtering *before* paging, `Donation` a `400`, `limit=1000` reset to 25, a bad `limit`/`offset` reset not refused, an `offset` past the end `[]`. New seed helpers
  (`seedActivityEvents`, `seedIncidentReports`, guarded to `e2e-` accounts) and the **cleanup now removes what a test account reported, voted on, requested, donated and sighted** (votes, media and sightings before the rows they hang from; donations before campaigns and aid requests) — its dry run left exactly the real rows (28 reports, 12 aid requests, 8 missing
  persons, 11 campaigns, 14 donations).
- **Probed against the real API:** the empty account, the `401`, the `400` for a bad `type`, then every rule above.
- **Visual:** 1440, 768 and 390 populated (days, pills, the shelter link), the filtered state and an empty filter at 1440; **zero horizontal overflow**.

### Testing done so far (Live location)
- **Unit (Vitest + RTL + MSW), 1,578 tests in the whole suite (+140 for this):** the **reconnecting-socket engine** with a fake WebSocket and fake timers (connect, open, messages; `send` only while open and never queued; the pauses 1, 2, 4, 8, 16, 30, 30 s and the jitter bounds; **a connection that dropped before it had held keeps growing the pause, one that held starts over** — found by
  the first run of these tests; a fresh URL each attempt; an async `getUrl` and one that throws; `onFailure` deciding retry or stop, a throwing probe treated as retry, not consulted for a connection that had opened; `close()` final, cancelling a retry and a URL still being fetched, ignoring late events, re-openable); the **channel** (the `ws(s)` URL from an absolute or relative API base, token expiry read from the JWT, a token
  reused while it has over a minute and not before, `classifyRejection` — 401, the gate's 403 vs a plain-text origin 403, 400, a dead network, a 500); the **model** (relay frames parsed incl. the trailing newline and every malformed shape, out-of-range and text coordinates; the bare `{lat,lng}` ping; three heartbeats of "live" to the millisecond; the age wording); the **controller** with a fake socket, fake geolocation and fake timers (no socket until something wants
  one; watchers counted; **a hand-over between screens keeping the socket and the positions**; the 3 s grace before closing and **no grace for a hidden tab**; positions kept per member with the browser's own receipt time; junk frames ignored; connecting / live / reconnecting through a drop; sharing asking for the position, sending once open, **never queuing a stale fix**, **one send per 2 s window with the newest going out at its end**, a heartbeat re-send,
  nothing sent before a fix or after off, denied switching sharing off, unavailable carrying on and recovering, no geolocation, a hidden tab pausing everything and **not replaying a fix from before the pause**, a held-back send dropped on hide, a gate/session refusal stopping retries and `retry()` reopening); `shareStatus` in every combination (never "sharing" unless the socket is live **and** there is a fix); the cards
  (the switch, who it goes to, the foreground-only note said once, disabled with nobody connected but still able to turn a share off, every status in words in a live region, Try again only when it helps) and the member's page card with **real Leaflet in jsdom** (not sharing, live with age and coordinates, "Not live — last seen" one second past 45 s, a marker kept for where they last were, connecting / reconnecting, the two
  refusals) and the small map (one marker, teal vs grey, following a move, **not following once the viewer has touched the map**); the provider (visibility changes reach the controller; starts hidden if the page did; removes its listener); and both Safety Groups pages against a fake controller (no card and no socket with nobody connected; the switch starting the watch and sending `{lat,lng}`; turning off; a refusal switching it off with the reason; a Live badge for
  the sharing member only and never for a stranger's frame; a member's page going from "isn't sharing" to the map and coordinates and following them; the same switch, one controller; no card or socket for someone not yet connected; the socket closing after removal; opening a member from the list **keeping the positions and the socket**). **Mutation-checked:** closing at once instead of after the grace period fails the controller's hand-over tests and the page test that opens a member from the list; dropping the send-throttle reset after a pause fails the resume test. (Removing the explicit cancel of the pending close changes nothing observable — the timer re-checks that nothing wants the socket before closing — so it is not claimed.)
- **E2E (Playwright, real backend, real WebSocket) — `e2e/safety-groups-live-location.spec.ts`, 9 tests, run alone, all passing.** Two to four real browser contexts, each its own person; the sharer's position is Playwright's emulated geolocation, so it can be moved. Covered: **A shares, B (on A's page) sees "Live", the map marker and `24.8600, 67.0500`; A moves and B follows; B's list marks A Live**; **a declined and a pending connection never receive a
  position while the accepted one does** — proved with raw WebSockets in the receivers' pages, the app not involved (the plan's own test); **foreground-only**: a hidden tab shows "Paused", keeps the switch on, and what it moves to while hidden **never reaches B**, then coming back shares from where A is *now*; **turning it off stops the position going out, and a reload never resumes it**; **sharing survives opening the map** (a
  different layout); **a browser refusing the position** switches it off with the reason; **a socket only when there is someone to hear or share with** (none for an account with no connections, **exactly one** for one with — which is how the hand-over/double-mount reconnect was found); **the viewer's socket being hung up from the server's side reconnects by itself and hears A again** (Playwright's WebSocket routing closes it; everything else real);
  and **a member who stops sending goes from Live to Not live after 45 s of silence** (B's own clock moved on with `page.clock`), the map keeping where they last were. Re-ran `safety-groups` (12) after the panel changed, `citizen-map` (6, the layout tree changed) and `profile-phone-nav` (6): all pass. The plan's "manual: verify the gate rejects with no active emergency" **cannot be done** — the gate is a stub that always allows.
- **Found by testing, fixed:** the backoff not growing for a connection that dropped right after opening; a fix dropped by the send throttle waiting up to a heartbeat (now a trailing send); the socket closing and reopening — and losing the positions heard — on the hop from the list to a member's page (a 3 s grace); the share card pushing "Requests for you" off the first phone screen (moved between the requests and the connected list);
  and the cleanup script failing on `location_trail` rows the relay writes for a sharing account (now removed, guarded).
- **Visual:** the sharer's card off and on at 1440 and 390, a viewer's list with the Live badge, a member's page with the live map at 1440 and 390 (real OpenStreetMap tiles); **zero horizontal overflow**. (One screenshot showed the switch grey while sharing — a capture taken mid-transition in a background browser context; the DOM (`aria-checked`) and the settled shot are correct.)

### Deferred tests (run before closing the phase)

Written down, not run yet. Run them all before the phase closes, then the full suite, then the guarded cleanup.

**Live location**
- **A real phone:** iOS Safari and Android Chrome — the permission prompt, the position watch while the screen is on, what happens when the screen locks or the browser goes to the background (the code pauses on `visibilitychange`; confirm that is what the platform actually fires), and battery use of a `watchPosition` left running.
- **Two visible windows of the same account** (or the web and the mobile app): the older connection goes deaf while staying open — the documented backend behaviour; check the UI's "Live" doesn't mislead in the deaf window.
- **Token expiry mid-session:** leave a sharing tab open past 15 minutes and drop the connection — the reconnect must fetch a new token from the refresh cookie (unit-tested; try it for real with a short-lived token).
- **The `403` gate and an origin the backend disallows** — untestable until Alerting (Phase 10) replaces the stub, and until an origin is misconfigured on purpose.
- **A long-running session:** hours of sharing — no memory growth in the positions map (it holds one entry per member), the heartbeat interval and watch cleaned up on logout and account switch (unmounting the provider).
- **Geolocation accuracy and jitter:** a real fix that jumps around — whether the 2 s window and 4-place coordinates look right on a moving map; whether a low-accuracy fix should be shown differently.
- **Many connected members:** twenty accepted connections, several sharing at once — the list's Live badges and the detail page each pick their own member's frames.
- **Screen reader:** the share status region, the map's name and the "Updated …" line being read once, not repeatedly each 5 s tick.
- **When the backend adds a "stopped" frame or a snapshot:** replace the 45 s inference and the wait for the next ping.

**Alert Preferences / Edit Profile / Activity**
- **A refused change in a real browser:** no way to make the real backend refuse (the controls can't produce a blank language or a bad severity) — the "old value back + message" path is unit-tested only; try it by hand with the network blocked or the backend stopped mid-save.
- **A slow or flaky network:** rapid changes while offline / throttled — the queue should keep order, "Saving…" should hold, and reconnecting should land them all.
- **Preferences across devices:** change on one tab, look on another (30 s cache) — confirm nothing misleading and that the next change doesn't send stale values (it sends only its own field, so it can't).
- **Screen reader and keyboard:** the switches (Space), the severity radios (arrow keys inside the group), the language select, and "Saving… / All changes saved" being announced politely without repeating.
- **When alerting ships (backend Phase 10):** check that a delivery honours the channel switches, the minimum severity and the language — none of this is testable end to end until then.
- **When a phone number exists:** add the field to Edit Profile, and make the phone note conditional on it.
- **Activity Timeline — a long ties block:** 26+ events sharing one timestamp (the backend tested it; the screen has not) — paging through must not repeat or skip; and events created by the app itself (not seeded) appearing after a report / vote / request is made on the real screens once Phases 5–6 exist.
- **Activity Timeline — links as screens arrive:** incident report, aid request, campaign and missing-person pages (Phases 5–6) — add each to `describeActivity` and its test; today they are plain text.
- **Activity Timeline — a subject that has gone:** a shelter that was later closed to the public or deleted — the link then leads to Shelter Detail's not-found state; check that reads sensibly from here.
- **Activity Timeline — time zones and midnight:** a viewer in another zone, and an event a few seconds either side of local midnight, get the heading a person there would expect.
- **Activity Timeline — currency:** once the donation flow (Phase 6) defines one, add it to "You donated …".
- **Activity Timeline — messages:** the roadmap's "interactions" appear when Communication ships (the screen already skips unknown kinds; add the sentence and a filter pill).

**Credibility**
- **A real seeded account:** sign in as one of the dev seed accounts that has a score (10–100 exist) and check the number, the date and the ring against `GET /trust-score` — none of the E2E accounts is a real seed account.
- **The score changing under an open page:** the query is cached 30 s, so a score updated elsewhere shows on the next visit or focus — confirm nothing misleading is shown in between.
- **Dark mode and RTL:** the ring's teal, the track and the number on the raised surface (Phase 9's matrix); mirrored layout for Urdu.
- **Screen reader:** the ring's name ("Credibility score 88 out of 100") is read once, not again through the decorative digits; the loading state's status.
- **When `credibility_events` ships:** this whole screen gets its real content (levels, statistics, tips, history) — re-open the mockup then; the "How it works" copy must be re-checked against what actually moves the score.

**Safety Groups**
- **Live location** (needs the WebSocket, step 3): the two-browser test the plan calls for — one account shares, the other's map updates; a **declined** connection and a **pending** one never receive a ping; the
  gate rejecting a socket with no active emergency (blocked until the backend's gate is real).
- **Switching accounts in one tab:** sign out of A, sign in as B without a reload — B sees B's circle and B's badge, never A's (the connections list is a new query key, so the account-switch cache clear should cover
  it; prove it).
- **Staleness across tabs:** accept in one tab; the other tab's list and badge only refresh on focus / after 30 s. Confirm nothing misleading is shown in between and that a stale Accept gets the real `409` and refreshes.
- **A long circle:** the backend returns every connection with no paging — seed 60–100 across all four sections and check scrolling, the section counts and the page's speed on a phone.
- **The typed-email memory on a real device:** invite, close the tab, come back next day (still shown); clear site data (falls back to "Member …" without errors); a private window; two accounts in one browser (each sees only its own); the
  same email invited, cancelled and invited again (the newer connection id gets the hint, the old one is inert).
- **An account that changes its email or name after connecting** — the list should show the new one on the next fetch (the server sends it live); check nothing caches the old.
- **The same person in two sections** — a declined request from them plus a fresh pending one from you is now *possible* again (the backend allows a new request after a decline): both rows, both actions, the right one
  acted on. Seed straight into Postgres.
- **A connection to an account that has since been suspended or deleted:** what the row and the detail page show (the API says nothing about the other party's state).
- **Tablet widths (768 / 1024):** add the list and the detail page to `tablet-tables-deferred.spec.ts`'s clip check.
- **Keyboard only and a screen reader:** Invite → Tab through the dialog → Send; Escape returns focus to Invite member; Copy's "Copied" / "Couldn't copy" is announced (a manual pass — the clipboard *failure* is only unit-tested).
- **Double-click Accept:** the second click must not send a second request (disabled while pending — unit-tested, not driven in a browser).

**Exit criteria:** the WS pattern is proven here before Phase 7 needs the same pattern for chat/nav.

---

## Phase 5 — Community Intelligence 🚧 in progress (Community Feed built, 2026-09-26)

### Screens

| Screen | Route | Role | Pattern | Status |
|---|---|---|---|---|
| Community Feed | `/app/community` | Citizen | W-List | ✅ Built (2026-09-26) — Latest / Verified / Nearby / Q&A tabs, search and category chips, report cards with photo, status and Upvote / Downvote (the viewer's own vote pressed — wired the same day once `GET /incident-reports/my-votes` existed), official update cards, rejected reports hidden and counted. No Report Incident button and no card links yet (their screens come next). See *Real deviations (Community Feed)* |
| Incident Detail | `/app/community/:incidentId` | Citizen | W-Detail | ✅ Built (2026-09-26) — the report found in the feed's own list (no by-id route), its category and status, who and when, the whole description, every photo and video, the large vote pair, a location card (small map, coordinates, distance on request) and a Progress timeline that only ticks what the API records; "not found" and "rejected" states; Back to the feed view it came from. No Message or View on Map (nothing behind them yet). See *Incident Detail (as built)* |
| Report Incident (drawer) | overlay | Citizen | W-Drawer-Form | ⬜ |
| Incidents (+ detail) | `/ngo/incidents`, `/ngo/incidents/:id` | NGO | W-List / W-Detail | ⬜ |
| Incident Reports | `/admin/incident-reports`, `/admin/incident-reports/:id` | Admin | W-List / W-Detail | ⬜ |

### Backend routes (all ✅ built — `api/07-community-intelligence.md`)

| Route | Used by | Status |
|---|---|---|
| `POST /incident-reports` | Report Incident | ⬜ |
| `POST /incident-reports/{id}/media`, `GET /incident-reports/{id}/media` | Report Incident media, Incident Detail | `GET` ✅ Wired (feed thumbnails, one request per card shown) |
| `POST /incident-reports/{id}/votes`, `DELETE /incident-reports/{id}/votes` | Community Feed / Incident Detail vote controls | ✅ Wired (feed, 2026-09-26) — waited a few hours for a way to read the caller's vote |
| `GET /incident-reports/my-votes?ids=` **(added on request, 2026-09-26 — `backend-requests/incident-report-my-votes.md`; on the backend's `feature-report-my-votes` branch)** | Community Feed / Incident Detail — which way the viewer voted | ✅ Wired (feed; one unfiltered call per account) |
| `PATCH /incident-reports/{id}/status` | Admin/NGO status lifecycle | ⬜ |
| `GET /incident-reports?region_id=|bbox=` | Community Feed, Citizen Map incident markers (retrofit into Phase 3's map) | ✅ Wired (feed, `bbox=-180,-90,180,90`) |
| `POST /community-updates`, `GET /community-updates?region_id=` | NGO/Admin "official update" posts — screen itself (Alerts & Community Updates) ships Phase 7/8, but the write call is available now | `GET` ✅ Wired (feed's official updates) |
| `GET /admin/incident-reports?status=&sort=`, `PATCH /admin/incident-reports/{id}/verify`, `PATCH /admin/incident-reports/{id}/reject` | Admin Incident Reports | ⬜ (`reject` used by the feed's E2E) |
| `GET /ngo/incident-reports?region_id=`, `PATCH /ngo/incident-reports/{id}/verify`, `PATCH /ngo/incident-reports/{id}/status` | NGO Incidents | ⬜ |

### What probing found before building (moved here from `CLAUDE.md` Appendix B; re-verified 2026-09-26 on a second machine)

*Docs resynced 2026-09-26:* `supporting-material/api/*.md` and `IMPLEMENTATION_ROADMAP.md` were re-copied from the backend before starting (identity, geo, flood-intelligence and relief-operations had moved on — relief's NGO lists and feedback are Phase 6's business; `07-community-intelligence.md` differed only in a link anchor).

- **Report shape:** `id, reporter_account_id, category (flooding|blocked_road|other_hazard), description?, location{Point}, region_id?, status (reported|verified|in_progress|resolved|rejected), ai_classified_category?, ai_confidence?, auto_verified, upvote_count, downvote_count, verified_at?, resolved_at?, created_at, updated_at, priority_score?` — optional keys **omitted**. **No title, severity, comment count or reporter name.**
- **No `GET /incident-reports/{id}`** — a detail page must find its report in a list query.
- **`region_id` is never written** (the repository resolves regions live by `ST_Intersects`), so `GET /incident-reports?region_id=` works for a report inside a region but a report outside every region is reachable only by `bbox`. The public list is **unpaginated, newest first, and includes every status — `rejected` too** (read from `ListForBBox`, confirmed live).
- **Votes** (probed with a throwaway account): upvote → `1/0`, the same again → still `1/0` (a new vote id each time), downvote → `0/1`, `DELETE` → `0/0`, a second `DELETE` → `204`; **`DELETE` on an unknown report is `204`, not `404`**; voting on a **rejected** report is allowed; `vote_type` missing is the bind-failure `400`, a wrong value `400 "vote_type must be one of: upvote, downvote"`; unknown report on `POST` is `404`; no token `401`. **No route reads the caller's own vote.**
- **Official updates:** `GET /community-updates?region_id=` returns that **exact** region's posts plus platform-wide ones — a citizen whose home is Sukkur City (tehsil) does **not** see a post aimed at Sukkur (district); `region_id` is required (`400 "region_id is required"`); posts carry only `author_account_id` (no name, no NGO).
- **Media:** absolute, browser-loadable URLs (`http://localhost:8080/uploads/incident-reports/<id>/<uuid>`, or `placehold.co` in seed data); `GET …/media` for an unknown report is `[]`. **Seed data has reports with no media at all** (the API can't create one, the seed can), so a card handles zero media. Uploads land on local disk (`./uploads`) or S3/MinIO — **no cleanup removes them**, which matters for the Report Incident drawer's E2E.
- **Validation the server doesn't do:** lat/lng ranges (lat 95 / lng 200 → `201`). Backend media rules: ≥1 file, ≤25 MB each, jpeg/png/webp/heic/mp4/quicktime/webm; the design's "5 files, 10 MB" and "20-character minimum" are design-only.
- NGO/admin can read a reporter's credibility via `GET /accounts/{id}/trust-score`; an admin can read the reporter's email via `GET /admin/accounts/{id}`; an NGO cannot resolve reporter names.
- Design features with **no backend** (not to be invented): internal notes, "Assign task", bulk actions, severity, titles, comment counts, the Q&A tab ("Coming soon").

### Real deviations (Community Feed, 2026-09-26)

- **Scope is the whole country, by `bbox`.** One `GET /incident-reports?bbox=-180,-90,180,90` (reports carry no region, and many real ones lie outside every region), then everything else in the browser. Fine for hundreds of reports; a backend conversation past that (no paging).
- **Tabs:** *Latest* — every shown report plus official updates, newest first; *Verified* — `verified`, `in_progress` and `resolved` (all confirmed at some point), no updates; *Nearby* — asks for the position only when **Use my location** is pressed, then nearest first with "N km away" on each card (no radius cut-off); *Q&A* — the design's "Coming soon". The tab, the category and the search live in the URL (`?tab=&category=&q=`), mirrored from state; unknown values fall back to Latest / All. On Nearby the search and chips wait for a position (before one, "All 0" would mislead).
- **The design's filter popover (category / distance / date / verification) became chips and tabs:** three category chips with counts (the three real categories — the design's eight tiles have no backend), distance is Nearby, verification is Verified, and there is **no date filter**.
- **Rejected reports are never shown** (decided with you, 2026-09-26) — only a line: "N reports were rejected by moderators and aren't shown."
- **Cards carry only what the API has:** no title (the description is the body, clamped to three lines; "No description given." when there is none), no severity, no comment count, no reporter name ("You" for the viewer's own, "A community member" for anyone else — the API gives only an account id), no credibility chip. The category chip uses the design system's category colours; the status pill says *Not verified yet / Verified / Verified automatically* (when `auto_verified` and still `verified`) */ Being handled / Resolved*. The photo is the report's newest photo (a video is a plain tile — nothing is downloaded or played in a list), with "+N" for more; a skeleton while loading; nothing for a report with no media or whose media list fails; a plain tile if the image won't load.
- **Voting — first read-only, then wired once the backend could say which way the viewer voted.** At first no route told a citizen their own vote, so a button could neither show a pressed state nor take a vote back; **decided with you (2026-09-26): wait for the backend** rather than remember votes in browser storage, and the feed shipped with plain totals. You added `GET /incident-reports/my-votes` the same day (contract: `supporting-material/backend-requests/incident-report-my-votes.md`, ✅ built). **As wired:** one **unfiltered** `my-votes` request per account (a citizen's own votes are few, and one cache entry then serves the feed and, later, Incident Detail — the per-page `ids` form was not needed); each card has **Upvote / Downvote** toggle buttons (`aria-pressed`, a filled arrow and a border when pressed, the totals as the group's name, "4 upvotes, 1 downvote"); pressing the chosen side takes the vote back (`DELETE`), the other side switches it, either with no vote casts it (`POST`, an upsert). A press shows **at once** — the pressed state and the totals in every cached list — and presses are **sent one at a time in the order made** (one queue for all votes: TanStack's `scope` is fixed per mutation, so not per report), measured each from the one before (two quick taps on Upvote = cast, then take back). When the last queued press lands, the list and the votes are read again, so what stays is the server's truth. A refused press shows the server's words and reads the truth back; a `404` (the report has gone) says the vote wasn't counted and refreshes the feed. **Until the votes have loaded — or if they can't be — the cards show plain totals and nothing can be pressed** (with "Couldn't load your votes, so voting is off for now: <server's words>" and Try again). Voting on your own report is allowed (the API allows it; the design says nothing).
- **Official updates** (the design's teal-edged "Official Update" card, no votes): with a home region, that region's posts and the platform-wide ones ("For Sukkur City" / "For Everyone"); **without a home region, only the platform-wide posts** — the route needs a region, so the first top-level region is asked and region-specific posts are dropped — with a "Set your home region" link. The author is not shown (the API gives only an account id). A failed update request (or region list) shows its own notice; the reports stay.
- **Media are fetched one request per card shown** (the list carries none), twelve cards at a time with "Show more" — the next cards' media are asked only when they appear.
- **Not built yet, on purpose:** the **Report Incident** button (its drawer is a later screen of this phase), the **card links** to Incident Detail (the next screen; "links only where the target exists").

### Backend gaps found building the Community Feed

| Gap | Effect today | Suggested change |
|---|---|---|
| ~~**No route reads the caller's own vote**~~ **Fixed 2026-09-26** (`GET /incident-reports/my-votes`, on the backend's `feature-report-my-votes` branch — **not yet committed there**; a server without it makes the feed say voting is off, nothing breaks) | — | — |
| `GET /incident-reports` is unpaginated, has no unscoped mode and returns `rejected` reports on a public route | The feed asks the whole world by `bbox` and filters rejected ones in the browser; one response per load, whatever the count | `limit`/`offset`, an optional `status` filter (or exclude `rejected` from the public route), and a nationwide mode |
| `GET /community-updates?region_id=` matches the exact region only | A citizen in a tehsil misses the posts aimed at its district and province; the feed can't fix it without a request per ancestor | Include ancestors' posts (the region's path), or accept several `region_id`s |
| `GET /community-updates` needs a `region_id` even for the platform-wide posts | Without a home region the feed asks an arbitrary region and throws its posts away | Allow no `region_id` (= platform-wide only) |
| Updates carry only `author_account_id` | The card can't say which NGO (or that it was an administrator) posted it | Return the NGO's name, or "platform" for an admin post |
| Reports have no title and no reporter display name | The design's bold title line and "Hina Khan" can't be drawn | Optional `title` on create; a public display name if the product wants reporters named |
| `DELETE /incident-reports/{id}/votes` on an unknown report is `204`; voting on a `rejected` report is allowed | Harmless for the feed (it sends no votes) | Decide whether a rejected report can still be voted on |

### Real bugs found and fixed (Community Feed)

- **Every citizen page overflowed by 5px at 320px (found by the visual check; not this screen's code).** The top bar's gaps (16px between the logo and the right-hand group, 8px between the four round buttons) left the account menu button 5px past the edge on every `/app/*` page. Below `sm` the gaps are now 8px and 4px (`CitizenLayout`); measured 0 on Resources, Edit Profile and the feed at 320. Shared layout, so the full unit suite and `profile-phone-nav` (6 E2E) were re-run: pass.
- **A category chip's accessible name was "Flooding3" (found by a unit test).** The label and the count were adjacent spans with no space. The feed's chips now read "Flooding 3". **The Resources tab's `CategoryChips` has the same fault** ("Pharmacies3") — noted, not changed here.
- **On a phone, a card's "· 30 minutes ago" left a stray dot at a line's end or start (found by the 320px screenshot).** The name, the dot and the time were separate flex items; they are now one run of text that wraps like a sentence, beside the icon.
- **Nearby showed "All 0 · Flooding 0…" before the viewer was located (found by the screenshot).** The counts depend on a position; the search and chips now wait for one.

### Testing done so far (Community Feed)

- **Unit (Vitest + RTL + MSW), 1,640 tests in 169 files in the whole suite (+59 for this screen), all passing** — the four Leaflet files (46 tests) time out in their start-up hook when the whole suite runs on this 8 GB Windows machine and pass when run on their own (`--no-file-parallelism`, 46/46); the owner's machine ran the suite in one go. **The model** (24): the URL readers, "You" vs "A community member", every status pill incl. "Verified automatically" only while still verified, vote wording with singulars, who an update is for, `[lng,lat]`→`[lat,lng]` and refusing off-globe points, search over description / category / status and over an update's title and content, each tab's rule (Latest with updates, a category dropping updates, Verified = verified/in progress/resolved, Nearby empty until located then nearest first with newest first among equals and unreadable points left out, Q&A empty), input never reordered, chip counts within the tab and search, the rejected count, platform-wide filtering, the media preview. **The parts** (19): the card (who, when with `datetime`, category, status, description, the read-only totals, **no button and no link**, "You", no description, distance only when located, a 600-character unbroken description kept inside); the thumbnail (skeleton, nothing for none or a failed list, the photo with "+N", a video as a tile with nothing downloaded, a broken image as a tile); the update card; the toolbar (search, clear, chips pressed, **only the three real categories**); the list, "Show more", the empty state with and without "Clear", the error in the server's words with a retry, Nearby asking nothing until pressed and explaining a block, Q&A. **The page over MSW** (16) with a stand-in for the three read routes: the world `bbox`, the home region's updates mixed in newest first, the rejected report hidden and counted, "You" on the viewer's report; media asked only for the cards shown and **twelve at a time, the next cards' media only once shown**; no home region → only platform-wide posts and the link; no regions → no update request; the empty feed; a failed list with the server's words recovering on retry; a failed update request leaving the reports; Verified in the URL; the view read from the URL and unknown values defaulting; a category hiding updates, counts within the search, the filtered empty state and Clear; **two changes in one tick both kept**; Q&A; Nearby asking nothing until pressed, nearest first with distances, the chips hidden before a position, a blocked location. **Mutation-checked:** showing rejected reports fails 6 tests; fetching media for every card instead of the page fails the paging test; updating the view from a stale closure fails the same-tick test.
- **E2E (Playwright, real backend, real Postgres) — `e2e/citizen-community.spec.ts`, 6 tests, run alone, all passing (twice).** Each run seeds its own `E2E Feed …` region, four reports tagged with the run's id (a flood with a photo, a verified blocked road, an in-progress hazard with a photo and a video, and a rejected one) by an `e2e-` citizen, and an official update posted to the region by an `e2e-` platform admin through the **real `POST /community-updates`**; the page's own search narrows the nationwide feed to the run's rows, so real reports never change a count. Covered: the list asked with `bbox=-180,-90,180,90`; the update and the three shown reports newest first, the rejected one absent and **the hidden count equal to the API's nationwide count of rejected reports**; "For <region>"; the stored totals, status pills, "3x minutes ago"; **the photo's URL as stored and the image actually loaded**; "+1"; no buttons in the list; the viewer's own report as "You" and the same report as "A community member" in **a second citizen's browser**; Verified, a category and the search in the URL surviving a reload, the filtered empty state and Clear; **a report rejected through the real `PATCH /admin/incident-reports/{id}/reject` leaving the feed on the next load with the hidden count one higher**; a citizen with no home region seeing no region-only post, the link, and each platform-wide post the API returns (found by its title) marked "For Everyone"; **Nearby with the browser's position granted asking nothing until pressed, then nearest first with "10 m away" and "1x km away"**. The file runs its tests one at a time (`mode: 'default'`) because two of them compare with the API's nationwide rejected count. New seed helpers `seedFeedReport` and `seedReportMedia` (guarded to `e2e-` reporters; media rows store a URL the dev server already serves, so **no upload is left on disk**); the cleanup script now also removes `community_updates` posted by test accounts and refuses to run if a real account posted to an `E2E` region.
- **Visual:** 1440, 1024, 768, 390 and 320 for Latest (everything, and one run's rows), Verified, Nearby before and after locating, Q&A, the filtered empty state and the error state, plus the update card at 1440 / 390 / 320 — **zero horizontal overflow in all 43 captures** after the fixes above. They caught the layout's 320px overflow, the stray dot, the misleading "All 0" and a video tile taking a full photo's height on a phone (now 80px). The long capture run crashed Chromium twice under memory pressure (1 GB free of 7.7 GB) and was re-run in smaller pieces; twelve repeated visits confirmed it wasn't the page.
- **Probed** before building (a throwaway `e2e-probe` account): every list error, the four vote transitions and their errors, media for a known and an unknown report, updates for a tehsil and without `region_id`.
- **Test data** cleaned with `e2e/cleanup-test-data.sql`, dry run first (every guard 0): 114 accounts, 34 regions, 134 reports, 28 updates removed; 8 real reports, 5 real updates and 6 media rows left, and the two seed reports the probe voted on back at their original totals (0/0 and 0/2). **Cleanup caveat for later:** it deletes a test account's votes on *real* reports without adjusting those reports' counters — harmless today (no test votes on real reports survive), but a voting E2E must vote only on its own reports.

### Testing done so far (Community Feed — voting, added 2026-09-26 once `my-votes` existed)

- **Probed** `GET /incident-reports/my-votes` on the running server (:8080) with a throwaway account voting only on two reports it filed itself: see the *As built* note in `backend-requests/incident-report-my-votes.md` (every case in the contract holds; a trailing comma is a `400`, spaces after commas are fine, an empty `ids=` is `[]`).
- **Unit (Vitest + RTL + MSW) — 1,653 tests in 169 files, all passing in one run** with `--maxWorkers=2` (+13 for voting: 4 model — what a press means in each state, how the totals move including never below zero, indexing the votes; 1 card — Upvote / Downvote with the viewer's vote pressed and each press reported; 8 page, over a stand-in that applies the backend's real vote rules — upsert, switch, take back, counters, `204` delete). The page tests: the pressed state from `my-votes` (one request); plain totals and nothing pressable until the votes load; an upvote pressed and counted **before the server answers**, then the list read again once it lands and still agreeing; take back → `DELETE`, switch → `POST`; **two quick taps sent in order**, ending where the second left it; a refusal putting the truth back with the server's words; a `404` saying the vote wasn't counted and refreshing the feed; `my-votes` failing → voting off with the server's words and a retry that brings the buttons back. **Mutation-checked:** dropping the immediate count update fails the "before the server answers" test; making every press cast (never take back) fails 3 tests; **removing the one-at-a-time queue at first failed nothing** — the stand-in held every vote request equally — so it was changed to hold only the *first* request, after which removing the queue fails the two-taps test (the second tap overtakes the first and the server ends on the wrong vote).
- **E2E — `e2e/citizen-community.spec.ts` now 9 tests, run alone, all passing** (the 6 earlier ones plus 3): **cast → the `POST` body `{vote_type: "upvote"}`, the row in Postgres under the voter's email and the counters 5/1 → a reload still shows it pressed** (the reason the route exists) and `my-votes?ids=` agrees → **switch** (the row now `downvote`, 4/2) → **take back** (a `DELETE`, no row, 4/1); **two citizens in two browsers** on one report — each sees only their own vote pressed, both see the other's in the totals, both rows stored; **a vote on a report deleted behind the open page gets the real `404 "incident report not found"`**, the page says so, and the card leaves on the refresh. Votes are cast only on the run's own reports. New seed helpers `readReportVotes`, `readReportCounts`, `deleteFeedReport` (guarded to reports filed by `e2e-` accounts).
- **Visual:** 1440, 390 and 320 with a pressed upvote, a pressed downvote, unpressed buttons on the viewer's own report, a four-digit total, and keyboard focus on a vote button at 320 — **zero horizontal overflow**; the pressed state is a filled arrow plus a border, not colour alone, and the focus ring draws in full.
- **Test data** cleaned (dry run first, every guard 0): 61 accounts, 77 reports, 18 updates removed; 8 real reports, 5 real updates and the 15 seed votes left, the counters back to the seed values.

### Incident Detail (as built, 2026-09-26)

- **Finding the report.** There is **no `GET /incident-reports/{id}`**, so the page reads the same nationwide list as the feed (one cache entry: opened from the feed it makes **no new request**; a direct link makes one list request) and finds the id in it. An id that isn't there — including a malformed one — is **"Report not found"**; a **rejected** report shows "This report was rejected" and none of its content (consistent with the feed hiding them); a failed list shows the server's words and a retry. The media list is one `GET …/media` for this report, failing inside its own card.
- **What's on the page** (the mobile spec's Pattern C and the NGO detail mockup, Batch 4 §4b, as far as the API goes): a **Back to community** link that returns to the feed view the report was opened from (tab, category, search — passed as router state; anything that isn't a feed address is ignored, so a crafted link can't send Back elsewhere; a direct link goes to the plain feed); the category and status pills; the **category as the page heading** (a report has no title); "Reported by a community member / you, 14 minutes ago (26 September 2026, 17:59)"; the **whole description** (line breaks kept); the **large Upvote / Downvote pair** under "Is this report accurate? Your vote helps responders judge it." — the feed's own `useVotes`, so a vote here is pressed on the card when going Back; **Photos and videos** — every file, a photo opening full size in a new tab, a video playing in place (`preload="metadata"`), and any file that won't load becoming a tile with "Open it directly" (the seed data's video URL is on `storage.example.com` and never loads — that tile is what a citizen sees); **Location** — a small one-marker map (below), the coordinates (there is no address), and **Show distance from me**, asked only when pressed; **Progress** — Reported → Verified → Being handled → Resolved (below).
- **The small map is not `MapCanvas`.** `MapCanvas` draws only shelters, infrastructure and essential locations, and incident markers on the shared map are this phase's last step; so, as live location's member map did, `IncidentLocationMap` is a plain Leaflet map with one pin and **no bounds of its own** (the API accepts a report anywhere; the shared map stops at 15–42°N). The mouse wheel doesn't zoom it.
- **Progress only ticks what the API records.** `verified_at` and `resolved_at` are set the first time and never cleared; nothing records "being handled". A step the report went past **without a record is shown as "no record"** (a dashed ring, "No record kept" or a note), never ticked — see the bug below. A report an administrator resolved and then reopened keeps its `resolved_at`, and the page says "Marked resolved on 26 September 2026, then reopened." `auto_verified` adds "Verified automatically by an AI check, not by a person."
- **The feed's cards now open their report**: a "View details" link on each card stretched over the whole card (the vote buttons sit above it and stay their own), carrying the feed's view for Back.
- **Not built, because nothing backs them:** the design's **Message** button (no messaging backend — Phase 7), **View on Map** (`/app/map?hazard={id}` — the map has no incident markers until this phase's last step, and `?hazard=` names a hazard zone), the title, severity, comment count, the reporter's name and credibility (citizens can't read them), and the NGO mockup's verification checklist and notes (NGO screen, and no data).
- **Real bugs found and fixed (Incident Detail):** **the Progress timeline ticked "Verified" for a report that was never verified (found by the 1440 screenshot).** The first rule marked every step before the current status as done; but the admin status route accepts any value, and a report taken from *reported* straight to *resolved* has no `verified_at` — the page claimed a verification that never happened (and a "being handled" nobody recorded). Steps now count as done only on evidence (a timestamp, or being the current status); the real-backend E2E resolves a report through the real route and checks Verified says "no record"; a unit test fails if the rule goes back to ticking by position (mutation-checked: 3 tests).
- **Unit (Vitest + RTL + MSW) — +28 for this screen, all passing** (5 timeline rules incl. the evidence rule and the reopened note; 14 parts — links and the Back guard, the card as a stretched link with its vote buttons still separate, the summary card, the gallery with a broken photo and a broken video each turning into a tile while the rest stay, the location card, the timeline with its "no record" step, the four states; 9 page tests over the shared stand-in server — now `src/features/community/communityTestKit.ts`, used by both pages — found by id with one list request and its media, not found, rejected with no media request, a failed list recovering, a failed media list contained to its card, **from a filtered feed and Back to it with no second list request**, Back ignoring a non-feed address, voting with the large pair, distance only when asked). Expected times are built with the same formatter (the machine is on +05:00). **Mutation-checked:** dropping the rejected check fails the rejected test; letting Back follow any address fails 2 tests; ticking by position fails 3. **Whole suite: 1,681 tests in 171 files, all passing in one run** (`--maxWorkers=2`).
- **E2E — `e2e/citizen-incident-detail.spec.ts`, 5 tests, run alone, all passing (twice).** Opened from **a filtered feed** (Verified + search): the URL, the heading, the stored description and status, Progress with *Being handled* current, **the stored photo actually loaded** and the stored video URL (which nothing serves) as a tile with its direct link, the stored coordinates and one pin on a real map, and **Back to `?tab=verified&q=…`**; a **direct link making exactly one list request** (`bbox=-180,-90,180,90`), an unknown and a malformed id both "not found", a rejected report showing none of its content; **the real `PATCH /incident-reports/{id}/status`** taking a report straight to *resolved* (its date shown, **Verified not ticked**) and then back to *in progress* ("Marked resolved on …, then reopened."); **a vote from the page stored in Postgres (row and counters), pressed on the feed's card after Back**, and `my-votes` agreeing; **distance only when pressed**, equal to the haversine of the stored point. The feed's world helper moved to `e2e/helpers/community.ts` (shared by both specs); the feed spec was re-run after that and its cards' new links: **9/9**.
- **Visual:** 1440, 1024, 768, 390 and 320 for a full report (a long unbroken description, two photos, a broken video, resolved-then-reopened progress), a report with no description or media, not found; 1440, 390, 320 for rejected and for the feed's cards with their link — **zero horizontal overflow** everywhere. They caught the Verified bug above. A first capture showed the map grey (tiles still loading at 0.8 s); re-captured at 2.5 s, the tiles are there.
- **Test data** cleaned (dry run first, every guard 0): 80 accounts, 102 reports, 24 updates removed; 8 real reports and 5 real updates left. **17 vote rows** remain, not 15: two are yours from 12:51 today (`user1` upvote and `user2` downvote on the "Farmland…" report, cast by hand with the seed accounts) and were left alone; the report's 1/1 matches them.

Note: `POST /internal/incident-reports/{id}/ai-classification` is service-to-service (ML→backend),
not a frontend concern — shows up in incident data as already-classified, nothing to build against
it directly beyond rendering whatever classification/credibility fields the response carries.

### Build steps
1. Report Incident drawer (category grid, char-counter textarea with the documented 20-char
   minimum, media uploader max 5/10MB).
2. ~~Community Feed~~ (✅ 2026-09-26, voting included once `my-votes` existed) + ~~Incident Detail~~ (✅ 2026-09-26), including the "Official Update" card variant (4px trust-teal
   left border, no vote row) for NGO/admin-authored posts. *(Order changed by the research: Feed → Detail → Report Incident drawer → NGO → Admin → map markers.)*
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

### Deferred tests (run before closing the phase)

Before this phase closes: implement and run them all, run the full suite, fix what fails, re-run load-stall timeouts alone, then clean
the `E2E …` test data.

Written down for the **Community Feed**, not yet run:

1. **Phone run** of the spec at 390×844 with touch: the tabs scroll sideways at 320; the chips wrap; a card's photo sits under its text; "Show more" reachable; Nearby's permission prompt on a real phone.
2. **Scale:** a few hundred reports nationwide — the single list request's size and time, the first twelve cards' media requests (twelve in parallel), "Show more" through a long list, and search staying instant; how many requests a slow network makes before the first card shows.
3. **Staleness:** a report verified, resolved or rejected in another tab while the feed is open — shown after the 30 s cache or a refocus; a report the viewer files elsewhere appearing on the next load.
4. **Media edge cases against the real server:** a report whose only media is a video; a real upload (`/uploads/…` served by the Go API) rather than a seeded URL; an image that 404s (the plain tile); HEIC, which most desktop browsers can't draw (a broken-image tile — decide whether to say "Photo in a format this browser can't show").
5. **Updates:** a home region that is a tehsil whose district has posts (not shown — the backend gap); a platform-wide post and a region post with the same timestamp; an update with no title; a very long title and content.
6. **Nearby:** location denied, unavailable, unsupported (the note, nothing listed, the button again); "Update my location" moving the order; a report at exactly the viewer's point; a report with an off-globe point (left out of Nearby, still in Latest).
7. **Guard:** a staff account visiting `/app/community` is turned away; signed out → login and back.
8. **Keyboard and screen reader:** the tablist by arrows, the chips' `aria-pressed` and names ("Flooding 3"), each card's heading ("Flooding reported by a community member"), the vote totals read as "4 upvotes, 1 downvote", the relative time with its full date in `title`.
9. **Voting, beyond what the spec covers** (the spec already covers cast / reload / switch / take back, two accounts, and the real `404`): many quick presses across several reports (one queue — check it never stalls, and the totals settle to the server's); a press while offline or with the API stopped mid-queue (the refusal message, then the truth); the same account voting in two tabs (the other tab shows the old pressed state until its 30 s cache or refocus — decide whether that matters); a server **without** `my-votes` (the backend branch not merged — "voting is off for now" with the 404's words, nothing pressable); a keyboard-only vote (Tab to a button, Space/Enter, `aria-pressed` announced); votes on a report rejected after the feed loaded (the API allows it; the card disappears on the next refresh). Keep test votes on **test** reports — the cleanup deletes a test account's votes without adjusting a real report's counters.
10. **When the Report Incident drawer exists:** a report filed from the drawer appearing at the top of Latest, and opening on its page. (The card links and Back to the same filtered view are done — covered by the Incident Detail spec.)

Written down for **Incident Detail**, not yet run:

11. **Phone and tablet run** with touch at 390 and 768: the small map can be panned and its zoom buttons tapped without the page scrolling away; the gallery's photos open full size; a video plays inline on iOS Safari (`playsinline` is not set — check whether it goes full-screen).
12. **Real uploads:** a report filed through the real `POST /incident-reports` (once the drawer exists) with a JPEG, a PNG, an MP4 and a HEIC — each shown or, for HEIC in a browser that can't draw it, the "can't be shown here" tile with its direct link.
13. **Progress against every real transition:** verified by an NGO (`PATCH /ngo/incident-reports/{id}/verify`), auto-verified by the AI route (a service key — seed instead), in progress by an NGO, resolved, and reopened more than once; confirm the dates shown are the API's and nothing is ticked without one.
14. **Staleness:** a report rejected, resolved or deleted while its page is open — shown after the 30 s cache or a refocus (rejected → the "rejected" state; deleted → "not found").
15. **A report far away:** a point outside Pakistan (the API accepts any) — the small map has no bounds, so it shows; the distance in hundreds of km.
16. **Keyboard and screen reader:** Back, the large vote pair, the gallery links, the map's zoom buttons, "Show distance from me"; the Progress list read with each step's state ("Verified — no record"); the `aria-current` step announced.
17. **Guard:** a staff account opening `/app/community/:id` is turned away.

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

### Deferred tests (run before closing the phase)

_Nothing yet._ As each screen is built, list here the E2E scenarios that were written down but not run — the edge-case
matrix, phone runs, cross-role flows — per the testing cadence under *Cross-cutting testing strategy*. Before this
phase closes: implement and run them all, run the full suite, fix what fails, re-run load-stall timeouts alone, then clean
the `E2E …` test data.

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
5. **Retrofit into Phase 1's Volunteers screen** once Tasks and Field Observations exist: the row's
   "View Activity" (a volunteer's task/observation history panel), and the read-only,
   own-task-history view `WEB_DESIGN_PLAN.md` §6.3 promises an `ngo_volunteer` — dropped for now
   because `GET /ngo/volunteers` is admin-only and there is no history to show (see the Progress
   log's Volunteers entry).

### Testing
- Component/E2E tests run against MSW in this phase (that's the point of MSW — deterministic tests
  without a real backend). Write them now; they keep working unchanged after the real-backend swap
  since MSW and Playwright-against-real-backend exercise the same service-layer interface.
- Track "mocked vs. real" per domain explicitly in test file names or tags, so it's obvious at a
  glance which suites need re-verification after a swap.

### Deferred tests (run before closing the phase)

_Nothing yet._ As each screen is built, list here the E2E scenarios that were written down but not run — the edge-case
matrix, phone runs, cross-role flows (here against MSW rather than the real backend) — per the testing cadence under *Cross-cutting testing strategy*. Before this
phase closes: implement and run them all, run the full suite, fix what fails, re-run load-stall timeouts alone, then clean
the `E2E …` test data.

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

### Testing cadence — light per screen, heavy per phase (agreed 2026-09-24, from Phase 3 on)

Phases 1 and 2 ran the full E2E suite as each screen landed; the full suite is ~20 minutes (plus re-runs for the
`page.goto` load-stall flake — whose cause turned out to be this machine's TCP stack, not memory pressure; see *Real bugs*) while a
single spec run alone is 1–2 minutes. So from Phase 3 the work is split:

| When | What | Notes |
|---|---|---|
| **Every screen** | Unit tests (Vitest + RTL + MSW) | Fast; the whole unit suite runs in a couple of minutes |
| | A probe of any new backend route (`curl`/a throwaway script with a throwaway `e2e-` admin) | Confirms the real shapes and error texts *before* building, as in Phase 2 |
| | **One focused E2E spec, run alone** | The happy path plus the main real-backend edge (the refusal or race that only the real server shows). Same style as before: real backend + Postgres reads, fresh login per test |
| | The visual check | Screenshots at 1440×900 and 390×844, zero horizontal overflow |
| | Update this plan | As-built record: deviations, bugs, and the screen's **deferred tests** |
| **Written down, not run** | The rest of the E2E scenarios — the edge-case matrix, phone runs, cross-role flows | Listed under the phase's *Deferred tests*, in enough detail to implement later without re-deriving them |
| **Phase end** | Implement and run the deferred list; run the **full** E2E suite — **spec by spec**, each file alone with the guarded cleanup before it (`e2e/cleanup-test-data.sql`, dry run first), because leftover spatial rows from one file can fail another's counts | Fix what fails; re-run load-stall timeouts (`page.goto: net::ERR_ABORTED`) alone before suspecting code; then the guarded, dry-run-first cleanup of `e2e-…` accounts and `E2E …` rows |

**Why not all E2E at the end:** real-backend E2E found things unit tests structurally cannot — Phase 2's onboarding step
landed on the wrong page because a route guard's redirect beat the page's own `navigate()` (only visible with the real
guard and store), and the real API's behaviour differed from its docs more than once (which `409` text, which
uniqueness rules). Found on the day, each cost minutes; found after several more screens were built on the same
assumption, each would cost far more to trace. So each screen still gets its one focused real-backend spec.

**One judgment call to keep in view:** a change to *shared* code — route guards, the auth store, a UI primitive, global
styles (Phase 2's `cn` fix was one) — can break screens built long ago, so that is the one case where the full suite is
worth running early. Say so when doing it.

## How to keep this document current

When a backend domain in §1's table flips from ❌ to ✅: update that row, move its screens'
"backing domain" note in Phase 7 to reflect the swap, swap the one service-layer file from MSW to
Axios, re-run that domain's E2E suite against the real backend, and check the box. Nothing else in
this document should need to change — if it does, that's a sign the service-layer boundary leaked
somewhere and is worth fixing.

When a screen is actually built: flip its row in that phase's Screens table from ⬜ to ✅, update
the Backend routes table's Status column, cross out completed Build steps, and update the
Progress log at the top — that section is the fast-scan summary, it should never fall out of
sync with what the phase sections themselves say. Add new "Real deviations"/"Real bugs
found"/"New architecture" entries there as they happen, in the same style as Phase 1's — the
value of this document is as an honest record of what actually happened, not a restatement of
the original plan.

When a screen is built under the testing cadence: put the E2E scenarios you *didn't* run into that phase's *Deferred
tests* list (specific enough to implement later), and keep the phase's *Testing* section to what was actually run. When
the phase closes, move the deferred items into *Testing* as done — or record honestly which were dropped and why.
