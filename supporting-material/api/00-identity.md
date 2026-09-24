# Phase 0 — Identity (`internal/identity`)

Read [README.md](README.md) first — base URL, auth header, the `X-Client` header, error shape, and
`PATCH` semantics are defined there once and apply to every route below without being repeated.

Identity owns account creation/login/session lifecycle, NGO self-registration and admin
approval/rejection, NGO organization-profile management, NGO volunteer invitations, and
platform-wide admin account management. Every route in this document lives under one of these
Gin route groups, each with its own middleware chain (verified directly against
`internal/identity/module.go`):

| Group | Base path | Middleware applied to the whole group |
|---|---|---|
| `auth` (public) | `/auth` | none |
| `auth` (protected) | `/auth` | `RequireAuth` |
| `ngo` | `/ngo` | `RequireAuth` (some routes additionally require `RequireRole("ngo_admin")`, noted per-route) |
| `ngos` | `/ngos` | `RequireAuth`, `RequireVerified` |
| `admin` | `/admin` | `RequireAuth`, `RequireRole("admin", "super_admin")` |
| `volunteer-invitations` | `/volunteer-invitations` | `RequireAuth` |

---

## FE-1 — Account creation + email OTP verification

**What it covers:** a citizen signs up with email + password, receives a 6-digit numeric code to
prove ownership of the email, and can request a fresh code if the first expires or is lost.

**Routes:** `POST /auth/register`, `POST /auth/verify-email`, `POST /auth/resend-verification`.

### `POST /auth/register`

**Auth required:** No.

**Request**

Headers: `Content-Type: application/json`.

Body:
```json
{
  "email": "citizen@example.com",
  "password": "at-least-8-characters"
}
```
- `email` — required, must be a syntactically valid email address (checked both by the request
  binder and, redundantly, by the domain layer).
- `password` — required, minimum 8 characters. There is no additional complexity rule (no
  required uppercase/digit/symbol) today.

**Behavior**

Creates a brand-new account with `role: "user"` and `status: "pending_verification"` — self-signup
can never produce any other role. The account row and its Profiling-module profile/alert-preference
rows are created atomically in one database transaction (if the profile initialization fails, the
whole registration fails — you will never see an account exist with no profile). A 6-digit OTP is
generated, stored server-side (Redis, 10-minute TTL), and "sent" to the email (in local/dev
deployments with no Mailtrap key configured, this is only logged server-side, not actually
emailed — check with whoever runs the backend which environment you're pointed at). **Registration
immediately logs the account in** — the response carries a working access + refresh token pair, so
there is no separate login call needed right after signup.

**Frontend handling — one real inconsistency to know about:** unlike `POST /auth/login` and
`POST /auth/refresh`, this route does **not** apply the web/mobile cookie split described in the
conventions doc. `POST /auth/register` always returns the refresh token as a plain string in the
JSON body (`refresh_token`), for both web and mobile clients, regardless of the `X-Client` header,
and never sets a cookie. If your web frontend relies on the refresh-token cookie for session
persistence, you must still read `refresh_token` from this specific response and either store it
yourself for this initial session, or immediately call `POST /auth/login` afterward to obtain a
cookie-backed session the normal way. This is a genuine asymmetry in the current backend, not a
documentation error — verified directly against `internal/identity/http/register.go`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | `{"id","email","status":"pending_verification","access_token","refresh_token"}` |
| Missing/malformed `email` or `password` (fails binder) | `400` | `{"error":"invalid request","detail":"..."}` |
| `email` fails domain-level shape check | `400` | `{"error":"invalid email"}` |
| `password` shorter than 8 chars (domain-level, redundant with binder) | `400` | `{"error":"password does not meet complexity requirements"}` |
| Email already registered (case-insensitive) by a **non-deleted** account | `409 Conflict` | `{"error":"email already registered"}` |

**Response body on success**
```json
{
  "id": "48434d1b-b4af-49cc-abbc-c559b8e30b4c",
  "email": "citizen@example.com",
  "status": "pending_verification",
  "access_token": "eyJhbGciOi...",
  "refresh_token": "7b8ac2f119..."
}
```
Note: this response does **not** include `role` (register.go's DTO omits it — it's always `"user"`
for a self-signup, so the frontend can assume that without the server repeating it). Decode the
access token's `role` claim if you need it programmatically, or call `GET /auth/me` right after.

**One non-obvious behavior worth knowing:** an account that was previously deleted via
`POST /auth/me/delete` frees its email for reuse — the uniqueness check only applies to
non-deleted accounts. Registering again with a previously-deleted email succeeds and creates a
brand-new account with a new ID; it is not a "restore."

---

### `POST /auth/verify-email`

**Auth required:** No (the OTP itself is the proof of identity here).

**Request**

Body:
```json
{ "email": "citizen@example.com", "code": "123456" }
```
- `email` — required, valid email shape.
- `code` — required, **exactly 6 characters** (the binder rejects a shorter/longer string before
  the service is ever called — a code that's the wrong length never reaches the "invalid or
  expired code" branch, it's a plain `400` bind failure instead).

**Behavior**

Looks the account up by email, checks the submitted code against the one stored for the
`email_verify` purpose. On a correct, unexpired code: the account transitions to
`email_verified: true` **and** `status: "active"` **in the same step** — these two attributes
always change together, there is no intermediate "verified but still pending" state. The code is
consumed (deleted) on successful verification, so it cannot be reused. A **fresh access token** is
issued and returned, reflecting `email_verified: true` — this is the token your frontend should
now use, discarding the one issued at registration (that one still claims `email_verified: false`
until it naturally expires or is refreshed).

**Frontend handling:** after a successful call, immediately replace your stored access token with
the one in this response. Any route gated by `RequireVerified` (currently only
`POST /ngos/register`) will reject the old, pre-verification token even though it hasn't expired
yet.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"status":"active","access_token"}` |
| `email`/`code` missing, or `code` not exactly 6 chars | `400` | bind-failure shape |
| No account with that email | `404` | `{"error":"account not found"}` |
| Code wrong, expired (>10 min old), or already consumed | `400` | `{"error":"invalid or expired code"}` |
| Account already had `email_verified: true` | `409 Conflict` | `{"error":"account already verified"}` |

**Response body on success**
```json
{ "status": "active", "access_token": "eyJhbGciOi..." }
```
Note: this response does **not** include a new refresh token — your existing refresh token (from
registration) is still valid and unaffected.

---

### `POST /auth/resend-verification`

**Auth required:** No.

**Request**
```json
{ "email": "citizen@example.com" }
```

**Behavior**

Issues a brand-new OTP for the `email_verify` purpose, overwriting whatever code was previously
stored — the old code stops working the instant this succeeds, even if it hadn't expired yet.
"Sending" is best-effort: if the underlying mail send fails, this route still returns success (the
failure is only logged server-side) — do not build frontend logic that assumes a `200` here
guarantees an email actually arrived.

**Important — unlike `POST /auth/password/forgot`, this route is NOT enumeration-safe.** It
returns a different status/body for an unknown email (`404`) than a known one (`200`), and a
different one again for an already-verified account (`409`). If you're building a "resend code"
button on a public-facing screen, be aware a scripted attacker could use this route to check
whether an email is registered. This is the current, real backend behavior — not a documentation
error — verified against `internal/identity/app/resend_verification.go`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"verification code sent"}` |
| No account with that email | `404` | `{"error":"account not found"}` |
| Account already verified | `409 Conflict` | `{"error":"account already verified"}` |

---

## FE-2 — Login/logout, session management, password rules

**What it covers:** logging in (any role — there is no separate admin/NGO login flow, `POST
/auth/login` works for every account type), refreshing an expired access token without
re-entering credentials, logging out, checking who's currently logged in, and the full
change/forgot/reset password lifecycle.

**Routes:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`,
`PATCH /auth/password`, `POST /auth/password/forgot`, `POST /auth/password/reset`.

### `POST /auth/login`

**Auth required:** No.

**Request**
```json
{ "email": "citizen@example.com", "password": "..." }
```
`password` has no `min=8` binder rule here (unlike register/change/reset) — this route only ever
compares against whatever hash is already stored, so there's nothing to validate about a
login-time password's shape.

**Behavior**

This is the one login endpoint for **every** role (`user`, `ngo_admin`, `ngo_volunteer`, `admin`,
`super_admin`) — the platform has no separate admin login route or subdomain; role-based access is
enforced downstream by each protected route's own `RequireRole`, not by which login endpoint was
called.

Credential checking is **timing-safe against email enumeration**: if the email doesn't exist at
all, the backend still runs a dummy password-hash comparison before responding, so a
nonexistent-email attempt takes roughly the same time as a wrong-password attempt on a real
account. Both cases return the identical `401 {"error":"invalid email or password"}` — you cannot
distinguish "no such account" from "wrong password" from the response.

**A successful login against a `deactivated` account silently reactivates it.** This is not an
error case — if the credentials are correct, the account transitions back to `status: "active"` as
a side effect of this call, and you get a normal `200` login response. There is no separate
confirmation step ("are you sure you want to reactivate?") — if your product wants one, it has to
be a frontend-side interstitial *before* calling this route (which would require first knowing the
account is deactivated, which today the frontend cannot know before attempting login — the only
signal is the login response itself).

A `suspended` account, by contrast, is a hard failure: correct credentials still return
`403 {"error":"account is not active"}`. There is no self-service path back from suspension — only
an admin calling `PATCH /admin/accounts/{id}/status` can undo it.

**Refresh token delivery** follows the [`X-Client` convention](README.md#the-x-client-header--web-vs-mobile):
web clients get it as an httpOnly cookie (never in the body); mobile clients get it in the response
body's `refresh_token` field (and no cookie is set).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"id","email","role","status","access_token"}` (+ `refresh_token` for mobile only) |
| Missing/malformed body | `400` | bind-failure shape |
| Unknown email, or wrong password | `401` | `{"error":"invalid email or password"}` |
| Account `status: "suspended"` | `403` | `{"error":"account is not active"}` |
| Account `status: "deactivated"` but wrong password | `401` | `{"error":"invalid email or password"}` (reactivation only happens on a **correct** password) |

**Response body on success (web client)**
```json
{
  "id": "48434d1b-...",
  "email": "citizen@example.com",
  "role": "user",
  "status": "active",
  "access_token": "eyJhbGciOi..."
}
```
The `refresh_token` cookie is set via a `Set-Cookie` header (not visible in the JSON body) — your
HTTP client library handles this automatically as long as you send the request with credentials
included.

**Response body on success (mobile client, `X-Client: mobile`)** — identical, plus:
```json
{ "...": "...", "refresh_token": "33324e4d16..." }
```

---

### `POST /auth/refresh`

**Auth required:** No `Authorization` header — the refresh token itself (cookie or body) is the
credential.

**Request**

- **Web client:** no body required at all — the browser sends the `refresh_token` cookie
  automatically if you included credentials on the request. An empty `{}` body or no body is fine.
- **Mobile client (`X-Client: mobile`):** body required:
  ```json
  { "refresh_token": "33324e4d16..." }
  ```

**Behavior**

Implements **rotation-on-use**: the refresh token you present is immediately invalidated, and a
brand-new one is issued and returned in its place — the old token cannot be reused a second time
(replay protection). The new access token reflects the account's **current** role/verified/active
state read fresh from the database, not whatever was true when the old access token was originally
issued — so this is also the mechanism by which a role change (e.g. NGO approval, volunteer
acceptance) eventually reaches a client that keeps calling refresh, even without a fresh login.

If the account backing the token is now suspended or deactivated, the refresh itself fails (same
`checkAccountActive` rule login uses) — refreshing does **not** silently reactivate a deactivated
account the way login does; only a real login re-entry does that.

**Frontend handling:** if a web request comes back with no cookie present at all (first-time
visitor, or the cookie expired/was cleared), do not call this route — you'll get a `401` for a
different reason than an actually-invalid token, and should route the user to login instead. If
this call ever fails with `401 {"error":"refresh token invalid or expired"}`, treat it as "fully
logged out" — clear any locally cached access token and redirect to login; do not retry the same
refresh token.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"access_token"}` (+ `refresh_token` for mobile only) |
| No token presented at all (no cookie for web, empty/missing field for mobile) | `401` | `{"error":"missing refresh token"}` |
| Token doesn't exist, already used/rotated, or expired | `401` | `{"error":"refresh token invalid or expired"}` |
| Account is now suspended | `403` | `{"error":"account is not active"}` |
| Account is now deactivated | `403` | `{"error":"account is deactivated — log in again to reactivate"}` |

Note the two distinct `401` messages above are **not interchangeable for UX purposes**: "missing
refresh token" means the client sent nothing (a client-side bug or a genuinely logged-out
visitor — don't alarm the user, just show a login screen silently); "refresh token invalid or
expired" means a real session ended (worth a "your session expired, please log in again" message).

---

### `POST /auth/logout`

**Auth required:** Yes (`RequireAuth`).

**Request:** same shape as refresh — no body for web (cookie), `{"refresh_token": "..."}` in body
for mobile. The `refresh_token` field is **not required** even for mobile — see behavior below.

**Behavior**

If a refresh token was actually presented (cookie or body), only *that* session is revoked. If
none was presented at all (e.g. a mobile client that lost its stored token, or a malformed
request), the backend falls back to revoking **every** refresh token belonging to the
authenticated account — because the caller's intent ("log me out") has to be honored even without
a specific token to point at. This route is **idempotent**: calling it again with an
already-revoked or nonexistent token still returns `200`, never an error.

**Frontend handling:** always call this before clearing local auth state, even if you're not sure
the access token is still valid — as long as it's not expired, `RequireAuth` will accept it and the
logout will succeed regardless of the refresh token's state.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (authenticated) | `200 OK` | `{"message":"logged out"}` |
| No/invalid access token | `401` | (from `RequireAuth` middleware, not this handler) |

For a web client, this also clears the `refresh_token` cookie via `Set-Cookie` with an immediate
expiry.

---

### `GET /auth/me`

**Auth required:** Yes (`RequireAuth`).

**Behavior**

Returns the caller's own identity, read fresh from the database (not decoded from the token's
claims) — so this always reflects the account's **current** role/status/verified state, even if
the access token itself is stale on those fields. Use this as your "who am I / is my session still
valid" check on app load, rather than trusting a locally-decoded JWT payload.

This is deliberately thin — no profile data (name, alert preferences, etc.) is included; that
lives in a different module's `GET /profile` (not part of Identity, see a later phase's
documentation).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"id","email","role","status","email_verified"}` |
| No/invalid access token | `401` | (from `RequireAuth`) |

```json
{
  "id": "48434d1b-...",
  "email": "citizen@example.com",
  "role": "user",
  "status": "active",
  "email_verified": true
}
```

---

### `PATCH /auth/password`

**Auth required:** Yes (`RequireAuth`).

**Request**
```json
{ "current_password": "...", "new_password": "at-least-8-characters" }
```
Both fields required; `new_password` minimum 8 characters.

**Behavior**

Requires re-proving the **current** password even though the caller already has a valid access
token — a stolen-but-still-valid token alone is not enough to change the password. On success,
**every** refresh token for the account is revoked — including the one belonging to the very
request that just changed the password. For a web client, the `refresh_token` cookie is also
explicitly cleared in this same response.

**Frontend handling — this is the single most important behavior to get right on this route:**
after a `200` here, the current session is **dead** for refresh purposes, even though the access
token you're holding hasn't technically expired yet (it can still be used for up to its remaining
TTL, typically under 15 minutes). The correct UX is to treat a successful password change as an
**immediate forced logout**: clear all local auth state and route the user to the login screen,
rather than letting them keep using the app until the access token happens to expire and the next
silent refresh fails unexpectedly.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"password changed"}` |
| Missing fields / `new_password` under 8 chars (binder) | `400` | bind-failure shape |
| `current_password` doesn't match | `401` | `{"error":"invalid email or password"}` |
| `new_password` under 8 chars (domain-level, redundant) | `400` | `{"error":"password does not meet complexity requirements"}` |

---

### `POST /auth/password/forgot`

**Auth required:** No.

**Request**
```json
{ "email": "citizen@example.com" }
```

**Behavior**

**Always returns `200` with the same message, whether or not the email is registered.** This is
deliberate and the opposite of `resend-verification`'s behavior: an unknown email must look
identical to a known one from the outside, or this endpoint becomes a way to check which emails
are registered. If the account exists, a reset token is generated (15-minute expiry) and "sent"
(same best-effort mailer behavior as OTPs — check your deployment's mail configuration).

**Frontend handling:** never branch UI on this response — there is only one outcome to show the
user ("if that email is registered, a reset link has been sent"), regardless of what actually
happened server-side. Do not build a "that email isn't registered, try again" error state for this
route; the backend will never tell you that.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always | `200 OK` | `{"message":"if that email is registered, a reset link has been sent"}` |
| Missing/malformed `email` | `400` | bind-failure shape |

---

### `POST /auth/password/reset`

**Auth required:** No (the token from the forgot-password email is the credential).

**Request**
```json
{ "email": "citizen@example.com", "token": "...", "new_password": "at-least-8-characters" }
```
`email` is required alongside `token` because the reset-token store is keyed by account ID, which
this route resolves from the email first — so, unlike `forgot-password`, **this route is not
enumeration-safe**: an unknown email returns a distinct `404`.

**Behavior**

Verifies the token against the one issued for this account by `forgot-password` (single-use — it
is consumed on success), replaces the password, and — same as `PATCH /auth/password` — revokes
every existing session for the account.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"password reset"}` |
| Missing/malformed fields, or `new_password` under 8 chars | `400` | bind-failure shape |
| No account with that email | `404` | `{"error":"account not found"}` |
| Token wrong, expired (>15 min), or already used | `400` | `{"error":"invalid or expired code"}` |

**Frontend handling:** after success, route straight to the login screen — there is no session to
carry forward (unlike register/verify-email, this route returns no tokens at all).

---

## FE-3 (partial) — Deactivate / delete own account

**What it covers:** the account-lifecycle half of "manage my account" — self-service, reversible
deactivation, and password-confirmed, irreversible deletion. (The other half of FE-3 — editing
personal details and alert preferences — lives in the Profiling module, documented separately.)

**Routes:** `POST /auth/me/deactivate`, `POST /auth/me/delete`.

### `POST /auth/me/deactivate`

**Auth required:** Yes (`RequireAuth`). No request body.

**Behavior**

Self-service and **reversible** — a subsequent successful `POST /auth/login` with the correct
password automatically reactivates the account (see the Login route's own notes above). Revokes
every current session and, for a web client, clears the `refresh_token` cookie.

A **suspended** account cannot deactivate itself out of that state — this route exists for a user
choosing to step away, not as a way around an admin-imposed restriction.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"account deactivated"}` |
| Account is currently suspended | `403` | `{"error":"account is not active"}` |

---

### `POST /auth/me/delete`

**Auth required:** Yes (`RequireAuth`).

**Request**
```json
{ "current_password": "..." }
```

**Behavior**

A **soft delete** (the row is kept, `deleted_at` is set) — but from every other route's
perspective the account is gone: it will never again be returned by any lookup (login, admin
account list/get, NGO membership checks, etc.), and — importantly — **its email becomes available
for a brand-new registration**, which will be a completely separate account with a new ID, sharing
no history with the deleted one. This is **irreversible** through any route in this API; there is
no "undelete."

Requires re-entering the current password, same reasoning as `PATCH /auth/password` — an
authenticated-but-stolen access token alone shouldn't be able to permanently delete the account.
Revokes every session and clears the web cookie.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"account deleted"}` |
| Missing `current_password` | `400` | bind-failure shape |
| Wrong password | `401` | `{"error":"invalid email or password"}` |

---

## FE-11 — Admin login

No new route. Admins and super-admins authenticate through the exact same
[`POST /auth/login`](#post-authlogin) every other role uses — there is no separate admin login
endpoint, and none is planned. The frontend distinguishes an admin session purely by the `role`
field in the login response / `GET /auth/me` (`"admin"` or `"super_admin"`), and by which
`/admin/*` routes subsequently succeed.

---

## FE-7 — NGO self-registration + admin approval/rejection

**What it covers:** a verified citizen submits an NGO registration for admin review; an admin
approves or rejects it. There is **no route for an admin to directly create an NGO** — every NGO
in this system starts as a citizen's own submission.

**Routes:** `POST /ngos/register`, `POST /admin/ngos/{ngoID}/approve`,
`POST /admin/ngos/{ngoID}/reject`.

### `POST /ngos/register`

**Auth required:** Yes, **and** email must be verified (`RequireAuth` + `RequireVerified`). An
unverified caller gets `403 {"error":"email verification required"}` before the handler even
runs — see the [`RequireVerified` caveat](README.md#authentication) about stale tokens if you're
testing this right after a verify-email call.

**Request**
```json
{ "name": "Flood Relief Karachi", "contact_email": "contact@org.example", "contact_phone": "+92..." }
```
- `name` — required, non-blank after trimming whitespace.
- `contact_email` — optional. If provided (non-empty after trimming), must be a valid email shape.
- `contact_phone` — optional, free text, no format validation.

**Behavior**

Always creates a `status: "pending_approval"` NGO with `created_by` set to the calling account —
this is the account that will be promoted to `ngo_admin` *if and only if* an admin later approves
it. A citizen can have **at most one** pending-or-active NGO registration credited to them at a
time, enforced at the database level (a partial unique index) — attempting a second submission
while one is still pending, or after one was already approved, fails with a `409`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | `{"id","name","status":"pending_approval"}` |
| `name` blank/whitespace-only, or malformed body | `400` | `{"error":"ngo name is required"}` or bind-failure shape |
| `contact_email` present but not a valid shape | `400` | `{"error":"invalid email"}` |
| Caller already has a pending or active NGO | `409 Conflict` | `{"error":"you already have a pending or active ngo registration"}` |

---

### `POST /admin/ngos/{ngoID}/approve`

**Auth required:** Yes, role `admin` or `super_admin` (`RequireRole`). No request body.

**Path parameter:** `ngoID` — the NGO's UUID.

**Behavior**

Two things happen **atomically** (one database transaction — both succeed or neither does): the
NGO's status flips to `active`, and the account that originally submitted it (`created_by`) is
promoted to `role: "ngo_admin"` with `ngo_id` set. After the transaction commits, every refresh
token belonging to that newly-promoted account is revoked (best-effort, outside the transaction) —
**their existing access token still carries the OLD role claim until it expires or they log in
again.** If you're building an admin-approval flow and immediately testing as that NGO's founder,
you must log in again (or refresh, which re-reads the role live) to see `ngo_admin`-gated routes
start working.

Only a `pending_approval` NGO can be approved — approving twice, or approving an already-rejected
NGO, fails.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"ngo approved"}` |
| `ngoID` not a valid UUID | `400` | `{"error":"invalid ngo id"}` |
| No NGO with that ID | `404` | `{"error":"ngo not found"}` |
| NGO isn't currently `pending_approval` (already approved/rejected) | `409 Conflict` | `{"error":"ngo is not pending approval"}` |
| Creator already has a *different* active NGO membership (defense-in-depth; should not occur in normal operation) | `409 Conflict` | `{"error":"this account is already affiliated with an ngo"}` |

---

### `POST /admin/ngos/{ngoID}/reject`

**Auth required:** Yes, role `admin` or `super_admin`. No request body.

**Behavior**

Flips the NGO's status to `rejected`. **Unlike approve, this does not touch the creator's account
at all** — no role change, no session revocation. Same pending-only guard as approve.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"ngo rejected"}` |
| `ngoID` not a valid UUID | `400` | `{"error":"invalid ngo id"}` |
| No NGO with that ID | `404` | `{"error":"ngo not found"}` |
| NGO isn't currently `pending_approval` | `409 Conflict` | `{"error":"ngo is not pending approval"}` |

---

## FE-8 (partial) — NGO organization profile

**What it covers:** viewing and editing the calling account's own NGO's profile (name/contact
info), and deactivating the organization. (The operational-*regions* half of FE-8 lives in the Geo
module, documented separately.)

**Routes:** `GET /ngo/me`, `PATCH /ngo/me`, `POST /ngo/me/deactivate`.

All three resolve "which NGO" **from the caller's own account** (`accounts.ngo_id`) — there is no
path parameter, and no way to view or edit an NGO you don't belong to through these routes.

### `GET /ngo/me`

**Auth required:** Yes. Open to **any** NGO staff — both `ngo_admin` and `ngo_volunteer` (no
`RequireRole` on this specific route, unlike the two below).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | see shape below |
| Caller has no NGO affiliation (plain citizen, or admin/super_admin) | `403` | `{"error":"account is not affiliated with an ngo"}` |

```json
{
  "id": "397674ec-...",
  "name": "Flood Relief Karachi",
  "status": "active",
  "contact_email": "contact@org.example",
  "contact_phone": "+92...",
  "created_at": "2026-09-20T06:44:36Z",
  "updated_at": "2026-09-20T06:44:36Z"
}
```
`contact_email`/`contact_phone` are omitted from the JSON entirely (not sent as `""`) when unset —
check for the key's presence, not just its value, if that distinction matters to you.

---

### `PATCH /ngo/me`

**Auth required:** Yes, role `ngo_admin` only — `ngo_volunteer` gets `403 {"error":"insufficient permissions"}`.

**Request** — true [partial patch](README.md#patch-semantics--real-partial-patch-not-full-replace):
```json
{ "name": "New Name", "contact_email": "", "contact_phone": null }
```
All three fields optional/nilable. Omit a field to leave it unchanged. `name`, if present, cannot
be blank (see below). `contact_email`/`contact_phone`, if present, **can** be set to `""` to clear
them.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | same shape as `GET /ngo/me`, with updated values |
| Every field omitted (nothing to update) | `400` | `{"error":"at least one field must be provided to update"}` |
| `name` present but blank/whitespace-only | `400` | `{"error":"ngo name is required"}` |
| `contact_email` present, non-empty, and not a valid shape | `400` | `{"error":"invalid email"}` |

**Frontend handling:** do not pre-fill and re-submit every field on every save (the naive "full
form PATCH" pattern) unless that's genuinely your intent — if a field legitimately shouldn't
change, omit it from the request body rather than re-sending its current value; sending `name`
back unchanged is harmless, but sending `contact_email: ""` when the user didn't touch that field
will actively clear it.

---

### `POST /ngo/me/deactivate`

**Auth required:** Yes, role `ngo_admin` only. No request body.

**Behavior**

Flips the NGO's status to `deactivated`. **No cascading effect on staff accounts** — every
`ngo_admin`/`ngo_volunteer` under this NGO keeps their role and `ngo_id` exactly as-is; they are
not logged out, suspended, or otherwise touched. There is currently **no reactivation route** for
an NGO — this is a one-way transition through this API today.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"ngo deactivated"}` |
| NGO isn't currently `active` (e.g. already deactivated) | `409 Conflict` | `{"error":"ngo is not active"}` |

---

## FE-9 (partial) — Volunteer invitations (invite/accept/decline, list, remove)

**What it covers:** an `ngo_admin` invites an existing citizen (by email) to join their NGO as a
volunteer; the invited citizen accepts or declines; either side can list what's relevant to them;
an admin can remove a volunteer from the roster. (The "assign tasks to volunteers" verb is a
different module, documented separately, not built yet as of this phase.)

**Routes:** `POST /ngo/volunteers/invitations`, `GET /volunteer-invitations`,
`PATCH /volunteer-invitations/{id}/accept`, `PATCH /volunteer-invitations/{id}/decline`,
`GET /ngo/volunteers`, `PATCH /ngo/volunteers/{id}/deactivate`.

### `POST /ngo/volunteers/invitations`

**Auth required:** Yes, role `ngo_admin` only.

**Request**
```json
{ "email": "citizen@example.com" }
```

**Behavior**

Resolves the caller's own NGO (must be `active` — inviting on behalf of a deactivated/pending NGO
fails) and looks up the target by email. The target **must currently be a plain citizen**
(`role: "user"`) — you cannot invite someone who's already staff anywhere (their own NGO's staff,
another NGO's staff, or an admin). Creates a `pending` invitation. **No account is created or
modified by this call** — the invited citizen's account is untouched until they explicitly accept.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| Missing/malformed `email` | `400` | bind-failure shape |
| Caller's NGO isn't `active` | `409 Conflict` | `{"error":"ngo is not active"}` |
| No account with that email | `404` | `{"error":"account not found"}` |
| Target account is not role `user` (already staff somewhere) | `409 Conflict` | `{"error":"invited account must be a citizen (role=user) to be invited as a volunteer"}` |
| Admin invites their own email | `400` | `{"error":"cannot invite yourself"}` |

```json
{
  "id": "09ea5100-...",
  "ngo_id": "5b8b853c-...",
  "invited_account_id": "61ff2540-...",
  "status": "pending",
  "created_at": "2026-09-20T06:58:26Z"
}
```

---

### `GET /volunteer-invitations`

**Auth required:** Yes — **any** authenticated account (not NGO-restricted). This is the invited
**citizen's own view** of pending invitations addressed to them, not an NGO's outbound list (that
would need a different route, not built).

**Behavior**

Returns every **pending** invitation for the caller, newest first, each enriched with the inviting
NGO's name (a separate lookup per invitation, since the citizen deciding whether to accept needs
to know who invited them without an extra round trip). Never errors on an empty result — returns
`[]`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (authenticated) | `200 OK` | array, possibly empty |

```json
[
  {
    "id": "09ea5100-...",
    "ngo_id": "5b8b853c-...",
    "ngo_name": "D5 Test NGO",
    "status": "pending",
    "created_at": "2026-09-20T06:58:26Z"
  }
]
```

---

### `PATCH /volunteer-invitations/{id}/accept`

**Auth required:** Yes — any authenticated account.

**Behavior**

Only the account the invitation was actually addressed to can accept it — an invitation that
exists but belongs to someone else is **indistinguishable from a nonexistent one** in the response
(both `404`), so you cannot probe for other accounts' invitation IDs. Re-checks the NGO is still
`active` at accept time (it may have been deactivated between the invite and this call). On
success: the invitation is marked `accepted`, and the accepting account is promoted to
`role: "ngo_volunteer"` with `ngo_id` set — atomically, same transaction pattern as NGO approval.
Every one of the accepting account's own sessions is then revoked (best-effort) — **they must log
in again (or refresh) to get a token carrying the new role**, exactly like NGO approval's caveat
above.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"invitation accepted"}` |
| `id` not a valid UUID | `400` | `{"error":"invalid invitation id"}` |
| Invitation doesn't exist, or belongs to a different account | `404` | `{"error":"invitation not found"}` |
| Invitation already accepted/declined | `409 Conflict` | `{"error":"invitation is not pending"}` |
| The NGO was deactivated since the invite was sent | `409 Conflict` | `{"error":"ngo is not active"}` |

---

### `PATCH /volunteer-invitations/{id}/decline`

**Auth required:** Yes — any authenticated account. Same ownership check as accept (404 for
someone else's invitation).

**Behavior**

Marks the invitation `declined`. **Does not touch the account at all** — no role change, no
session revocation, since nothing about the citizen's account changes by declining.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"invitation declined"}` |
| `id` not a valid UUID | `400` | `{"error":"invalid invitation id"}` |
| Invitation doesn't exist, or belongs to a different account | `404` | `{"error":"invitation not found"}` |
| Invitation already accepted/declined | `409 Conflict` | `{"error":"invitation is not pending"}` |

---

### `GET /ngo/volunteers`

**Auth required:** Yes, role `ngo_admin` only.

**Behavior**

Lists every account with `role: "ngo_volunteer"` currently affiliated with the caller's own
NGO — never another NGO's roster. Returns `[]` if there are none.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | array, possibly empty |
| Caller has no NGO affiliation (shouldn't normally occur for a genuine `ngo_admin`) | `403` | `{"error":"account is not affiliated with an ngo"}` |

```json
[
  { "id": "dbd23ef5-...", "email": "volunteer@example.com", "status": "active", "created_at": "2026-09-20T06:44:36Z" }
]
```
Note: `status` here is the **account's** status (`active`/`suspended`/`deactivated`), not
anything volunteer-specific — there is no separate "volunteer status" concept.

---

### `PATCH /ngo/volunteers/{id}/deactivate`

**Auth required:** Yes, role `ngo_admin` only.

**Path parameter:** `id` — the **target account's** UUID (not an invitation ID).

**Behavior**

**Despite the route name, this does not touch `accounts.status`.** It removes the target from the
caller's NGO roster entirely: `ngo_id` cleared, `role` reset to plain `"user"`. The account itself
remains fully active and usable — it simply stops being NGO staff. This is a deliberate scope
limit: an `ngo_admin` has authority over their own roster membership, not over the target's entire
platform account (they cannot suspend/ban the account this way — only a platform admin can, via
`PATCH /admin/accounts/{id}/status`). The target's sessions **are** revoked, so their next request
with an old access token still claiming `ngo_volunteer` will eventually need a fresh token
reflecting the reset role.

The target must actually be a volunteer **of the caller's own NGO** — attempting this on an
account that isn't a volunteer at all, or is a volunteer of a *different* NGO, fails with the same
error either way (anti-enumeration, same principle as invitation ownership).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | `{"message":"volunteer removed from ngo"}` |
| `id` not a valid UUID | `400` | `{"error":"invalid account id"}` |
| Target isn't a volunteer of the caller's own NGO | `403` | `{"error":"this account is not a volunteer under your ngo"}` |

---

## FE-12 (partial) — Platform-wide admin account management

**What it covers:** an admin browsing/searching all accounts, viewing one in detail, and
blocking/suspending or unblocking/reactivating any account platform-wide. (The
fraud/moderation-history half of FE-12 is a different module — `moderation_actions` — documented
separately; this route only flips the one `accounts.status` switch.)

**Routes:** `GET /admin/accounts`, `GET /admin/accounts/{id}`,
`PATCH /admin/accounts/{id}/status`.

### `GET /admin/accounts?limit=&offset=`

**Auth required:** Yes, role `admin` or `super_admin`.

**Query parameters:** both optional.
- `limit` — default `20`, max `100`. **A value outside `1..100` (including `0`, negative, or
  non-numeric) is silently replaced with the default `20`, not rejected.**
- `offset` — default `0`. **A negative or non-numeric value is silently reset to `0`.**

**Behavior**

Plain offset pagination, newest accounts first, over every non-deleted account regardless of role.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (correctly authorized) | `200 OK` | see shape below |

```json
{
  "accounts": [
    {
      "id": "4ac58f97-...",
      "email": "admin@example.com",
      "role": "super_admin",
      "status": "active",
      "email_verified": true,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 137,
  "limit": 20,
  "offset": 0
}
```
`total` is the count of **all** matching accounts, not just this page — use it to compute total
pages (`Math.ceil(total / limit)`) or to know whether "load more" should still be shown.

---

### `GET /admin/accounts/{id}`

**Auth required:** Yes, role `admin` or `super_admin`.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | one `accountSummaryResponse` object (same shape as one entry in the list above) |
| `id` not a valid UUID | `400` | `{"error":"invalid account id"}` |
| No account with that ID (or it's soft-deleted) | `404` | `{"error":"account not found"}` |

---

### `PATCH /admin/accounts/{id}/status`

**Auth required:** Yes, role `admin` or `super_admin`.

**Request**
```json
{ "action": "suspend" }
```
`action` must be exactly one of `"block"`, `"unblock"`, `"suspend"`, `"reactivate"` — enforced by
the request binder itself (`oneof=...`), so any other value never reaches the service layer; it's
a plain `400` bind failure, not the domain's own `ErrInvalidStatusAction`.

**Behavior**

`"block"` and `"suspend"` are **synonyms** — both call the exact same underlying transition
(`Account.Suspend()`), and produce identical results; the API accepts either spelling purely for
frontend wording flexibility (e.g. a "Block user" button vs. a "Suspend account" admin panel
control can both send whichever word matches their own copy). Likewise `"unblock"` and
`"reactivate"` are synonyms for the reverse transition. There is no functional difference between
picking one spelling over the other — pick whichever reads better in your UI copy.

Suspending immediately revokes **every** refresh token for the account (security-relevant — a
suspension should take effect right away, not wait for tokens to expire). Reactivating revokes
nothing (a suspended/deactivated account had no live sessions to begin with, since login/refresh
both already reject them).

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | updated `accountSummaryResponse` |
| `id` not a valid UUID | `400` | `{"error":"invalid account id"}` |
| `action` missing or not one of the four values | `400` | bind-failure shape |
| No account with that ID | `404` | `{"error":"account not found"}` |
| `block`/`suspend` an already-suspended account | `409 Conflict` | `{"error":"account already suspended"}` |
| `unblock`/`reactivate` an already-active account | `409 Conflict` | `{"error":"account already active"}` |

**Frontend handling:** since `block`/`suspend` and `unblock`/`reactivate` are true synonyms, don't
build separate error-handling logic per spelling — a `409` from either pairing means the same
thing ("already in that state"), and your UI should simply refresh its view of the account's
current status rather than treating it as a failed action.

---

## Cross-context note

`internal/identity` exports exactly one function for other bounded contexts to call directly
(`Module.NGOIDForAccount`) — this has no HTTP route of its own and is not callable from a
frontend. It's mentioned here only so a `403`/`404` you see from a *different* module's
NGO-scoped route (e.g. Geo's `GET /ngo/me/regions`, Community's `GET /ngo/incident-reports`) isn't
mistaken for an Identity bug — those routes resolve "which NGO does the caller belong to" through
this same underlying account data, just from their own module.
