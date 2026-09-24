# LittleLife Web — Frontend Implementation Plan

**Status:** living document. Update the status column in each phase's route table as the Go
backend ships more of `IMPLEMENTATION_ROADMAP.md`; nothing else about a phase should need to
change when that happens — that's the entire point of the service-layer split in Phase 0.

## Progress so far

**Phase 0 — Foundation & Architecture: ✅ Done.**

**Phase 1 — Identity & Account Shell: 🚧 In progress.** Built, tested (unit + E2E against the
real local backend), and visually verified: Login, Register, Logout, Verify Email (OTP), the
onboarding profile-completion step, Forgot/Reset Password, Edit Profile (name portion), Account
Settings (deactivate/delete), My NGO (register + live status), Invitations, and — the first NGO
screen — Organization Settings, My Account for both NGO staff and platform admins, Volunteers
(the roster, invite, and remove), and — the first Admin screens — Users & Accounts with its account
detail. That closes out the full auth-screen set plus every citizen `/app/profile/*` screen this
phase owns (steps 1–3 of Phase 1's build order), all of the NGO half of step 6, and half of step 7.
Not yet built: NGOs (list, detail, approve/reject — the last Phase 1 screen).

**Phases 2–10:** not started. Full detail on what's done and how lives in each phase's own
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
- **No region-picker onboarding step exists.** There is no backend field anywhere to persist a
  citizen's home region (Profile only has `name`). Confirmed with you: onboarding is name-only;
  `/app/onboarding/region` (Phase 2 below) stays a placeholder, unrelated to the mandatory chain.
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
  checkmark, and a credibility "Level 4" badge next to the name. None of that data exists yet —
  home region is Geo (Phase 2, not built — see the region-picker bullet above), verified/level
  are Trust (Phase 4, not built). `ProfileSidebar` renders only the real field (`name`), same
  principle as every other deviation here: build what's real, don't fabricate the rest. Same
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
  **Operational regions are deferred, not dropped:** `GET/POST/DELETE /ngo/me/regions` exist, but
  adding one needs the region picker that Phase 2 builds (the plan already schedules the chips as a
  Phase 2 retrofit), and a remove-only chip list would be a half-feature. Two placement choices:
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

### Component library actually built so far (`src/components/ui/`)

`Button` (variants: primary, secondary, ghost, dangerOutline, criticalSolid, safeSolid — the
latter two reserved for real emergency actions, never generic destructive ones, per the design
system's own rule), `Input` (leading icon + trailing slot; the `<input>` itself owns the full
visible box rather than a wrapper div — see the Safari fix below), `PasswordInput` (show/hide
toggle, optional leading lock icon), `OtpInput` (6 boxes, auto-advance/backspace/paste,
fully responsive down to 320px), `Checkbox` (real native input, `group-has-checked:` for visual
styling), `Dialog` (wraps `@radix-ui/react-dialog` — overlay, centered content, title/description,
close button), `Badge`, `Label`. **Not built via shadcn's CLI** — every component is hand-built
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

## Phase 1 — Identity & Account Shell 🚧 In progress

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
| Organization Settings (profile + deactivate; region chips wait for Phase 2's picker) | `/ngo/settings/organization` | NGO (`ngo_admin` only) | W-Settings | ✅ Built |
| My Account (profile name, password, deactivate/delete — one page for all four staff roles) | `/ngo/settings/account`, `/admin/settings/account` | NGO, Admin | W-Settings | ✅ Built |
| Volunteers (roster, invite, remove — `ngo_admin` only) | `/ngo/volunteers` | NGO | W-List | ✅ Built |
| Users & Accounts (+ detail) | `/admin/users`, `/admin/users/:id` | Admin | W-List / W-Detail | ✅ Built |
| NGOs (+ detail) | `/admin/ngos`, `/admin/ngos/:id` | Admin | W-List / W-Detail | ⬜ Not built |

### Backend routes (all ✅ built — `api/00-identity.md`)

| Route | Used by | Status |
|---|---|---|
| `POST /auth/register` | Register | ✅ Wired |
| `POST /auth/verify-email`, `POST /auth/resend-verification` | Verify Email | ✅ Wired |
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Login, auth store bootstrap, global logout | ✅ Wired |
| `GET /profile`, `PATCH /profile` | Onboarding profile step; Edit Profile (name field only, full profile screen still Phase 4) | ✅ Wired |
| `PATCH /auth/password` | My Account → Password (forced sign-out on success). The citizen Account Settings screen has no password row in its spec, so citizens still change theirs via Forgot Password | ✅ Wired |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | Forgot/Reset Password | ✅ Wired |
| `POST /auth/me/deactivate`, `POST /auth/me/delete` | Account Settings | ✅ Wired |
| `POST /ngos/register` | My NGO → Register form | ✅ Wired |
| `GET /ngos/mine` **(added to the backend after My NGO's first build — see Progress log)** | My NGO → status card (pending / rejected / active), survives a reload | ✅ Wired |
| `POST /admin/ngos/{ngoID}/approve`, `POST /admin/ngos/{ngoID}/reject` | Admin NGOs list | ⬜ Not wired |
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
6. ✅ Organization Settings (profile edit + deactivate; the region chips are a Phase 2 retrofit),
   plus the `ngo_admin`-only nested route guard and the responsive NGO/Admin shell it needed — see
   Progress log. ✅ My Account (both roles' routes; see Progress log). ✅ Volunteers (NGO) — the roster,
   invite and remove, `ngo_admin` only; see Progress log for the three backend gaps it surfaced.
7. ✅ Users & Accounts (list + detail, with the moderation history and credibility card it embeds — see Progress log). ⬜ NGOs (Admin).

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
  untouched).
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
  admin's.
  - ⬜ Still not possible: a full "register → really verify via the real OTP → land in the app" E2E
    path and "request reset → really reset → log in with the new password" — both need a real
    OTP/reset token, only server-logged (Redis holds a hash). The DB-seeding helper is the
    substitute for the verified-session half; it doesn't exercise the OTP screens themselves.
    Follow-ups now unblocked: replace My NGO's stubbed pending/rejected/active states with real
    ones the same way, and the *user's own* real verified account (with a real pending NGO) is a
    manual check — reopen `/app/profile/ngo` and it should show the pending card, not the form.
  - ⬜ NGO registration → admin approval → promoted account login — the approval half is blocked on
    the Admin NGOs screen not being built yet. Volunteer invitation → accept → promoted is now
    covered for both halves now: the admin sends it from the Volunteers screen, the citizen accepts
    it from Invitations, and the roster shows the result (`ngo-volunteers.spec.ts`).
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
  regression; re-run those tests before suspecting the code.

**Exit criteria:** every role can register/login/manage their own account for real; NGO
approval and volunteer promotion flows work end-to-end against the real backend. **Partially
met** — the full auth-screen set (register/login/logout/verify/onboard/forgot/reset) plus Edit
Profile, Account Settings, My NGO, and Invitations are real and tested — every citizen
`/app/profile/*` screen this phase owns — plus Organization Settings and My Account for the NGO
and admin consoles, Volunteers (so the NGO side of volunteer invitations is real too), and Users &
Accounts (the first Admin screens, with moderation); the one remaining account-lifecycle screen is
NGOs — including the admin-approval half of NGO registration.

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
| `GET /accounts/{id}/trust-score` | `06-trust.md` | NGO/Admin embedded credibility badge — Admin Account Detail's credibility card is **built (Phase 1)**; the reusable `<CredibilityBadge>` for NGO Incidents is still to do |
| `POST /admin/accounts/{id}/moderation-actions`, `GET /admin/accounts/{id}/moderation-actions` | `06-trust.md` | Admin Account Detail — **built in Phase 1** with Users & Accounts (history list, Log dialog, and the reason saved by Suspend/Reactivate) |
| `GET /profile`, `PATCH /profile` | `05-profiling.md` | Edit Profile — **the service-layer functions (`getProfile`/`updateProfile`) and the `name` field already exist**, pulled forward into Phase 1 for the onboarding gate; this phase is just the standalone Edit Profile screen reusing them, no new backend work |
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

When a screen is actually built: flip its row in that phase's Screens table from ⬜ to ✅, update
the Backend routes table's Status column, cross out completed Build steps, and update the
Progress log at the top — that section is the fast-scan summary, it should never fall out of
sync with what the phase sections themselves say. Add new "Real deviations"/"Real bugs
found"/"New architecture" entries there as they happen, in the same style as Phase 1's — the
value of this document is as an honest record of what actually happened, not a restatement of
the original plan.
