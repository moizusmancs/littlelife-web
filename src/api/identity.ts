import { isAxiosError } from 'axios'
import { apiClient } from '@/api/client'
import type { Role } from '@/store/auth'

/**
 * Identity — auth, NGO lifecycle, admin account management.
 * Backend doc: supporting-material/api/00-identity.md (built).
 * Built incrementally, screen by screen, per FRONTEND_IMPLEMENTATION_PLAN.md Phase 1 —
 * only `login` exists so far; more are added as each screen is built.
 */

export interface LoginResponse {
  id: string
  email: string
  role: Role
  status: string
  access_token: string
}

export interface MeResponse {
  id: string
  email: string
  role: Role
  status: string
  email_verified: boolean
}

/**
 * POST /auth/login — the one login endpoint for every role (api/00-identity.md). Errors are
 * left to the caller: 401 "invalid email or password" (also covers "no such account", by
 * design — timing-safe against email enumeration) and 403 "account is not active" (suspended,
 * no self-service recovery) are the two documented failure shapes worth handling distinctly.
 *
 * Deliberately does NOT return `email_verified` — that field isn't in this response at all
 * (api/00-identity.md's documented shape is `{id,email,role,status,access_token}` only). Call
 * `getMe` right after a successful login if the caller needs that flag, don't assume a value.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return res.data
}

/** GET /auth/me — always read fresh from the database, never trust a decoded JWT for this. */
export async function getMe(accessToken: string): Promise<MeResponse> {
  const res = await apiClient.get<MeResponse>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return res.data
}

/**
 * POST /auth/logout — idempotent, always 200 while the access token is still valid (even if
 * the refresh token/cookie is already gone). Always call this before clearing local auth
 * state, per the doc's own guidance, rather than only clearing client-side on a hunch the
 * token might be stale.
 */
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export interface RegisterResponse {
  id: string
  email: string
  status: string
  access_token: string
  refresh_token: string
}

/**
 * POST /auth/register — the request body is deliberately exactly `{email, password}`. The
 * backend has no field for name, phone, or a language preference at all; those are captured
 * later, post-verification, via profile PATCH routes during the mandatory onboarding flow —
 * see RegisterPage's own comment for why this screen doesn't collect them.
 *
 * `password` needs 8+ characters, no other complexity rule. Always creates `role: "user"`
 * (self-signup can never produce any other role) and `status: "pending_verification"`.
 *
 * Real asymmetry to know about: unlike login/refresh, this route does NOT apply the web/mobile
 * cookie split — it always returns `refresh_token` as a plain body field and never sets a
 * cookie, even for a web client. RegisterPage does not rely on this response's tokens for the
 * ongoing session; it immediately calls `login` with the same credentials afterward to
 * establish a real cookie-backed session the normal way (the doc's own recommended fix for
 * this asymmetry).
 */
export async function register(email: string, password: string): Promise<RegisterResponse> {
  const res = await apiClient.post<RegisterResponse>('/auth/register', { email, password })
  return res.data
}

export interface VerifyEmailResponse {
  status: string
  access_token: string
}

/**
 * POST /auth/verify-email — `code` must be exactly 6 characters or the request never reaches
 * the "invalid or expired" branch at all, it's a plain 400 bind failure instead (the caller
 * should never be able to submit a wrong-length code through the UI in the first place, since
 * the OTP input itself only accepts 6 digits).
 *
 * The response's `access_token` is a FRESH token reflecting `email_verified: true` — the doc's
 * explicit instruction is to immediately replace the stored token with this one, discarding
 * the one issued at registration/login (which still claims unverified until it naturally
 * expires or is refreshed). The caller is responsible for that swap; this function just
 * returns what the backend sent.
 */
export async function verifyEmail(email: string, code: string): Promise<VerifyEmailResponse> {
  const res = await apiClient.post<VerifyEmailResponse>('/auth/verify-email', { email, code })
  return res.data
}

/**
 * POST /auth/resend-verification — best-effort; a 200 here does not guarantee an email
 * actually arrived (send failures are only logged server-side). NOT enumeration-safe (404 for
 * an unknown email, 409 if already verified) — a real concern for an anonymous "resend" button,
 * but not in this app's actual usage: verify-email is only ever reachable already
 * authenticated as the exact account being verified (RequireUnverifiedSession), so the email
 * is never actually unknown to the caller.
 */
export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/resend-verification', { email })
  return res.data
}

/**
 * POST /auth/password/forgot — **always returns 200 with the same message, whether or not the
 * email is registered** (deliberately enumeration-safe, unlike resend-verification). The caller
 * must never branch UI on this response or build an "email not found" error state — there is
 * exactly one outcome to show, regardless of what happened server-side.
 */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/password/forgot', { email })
  return res.data
}

/**
 * POST /auth/password/reset — needs `email` alongside the `token` because the reset-token store
 * is keyed by account ID, resolved from the email first. Unlike `forgotPassword`, this route is
 * NOT enumeration-safe (a real 404 for an unknown email) — the backend's own deliberate choice,
 * not something to paper over here. Returns no tokens on success; there is no session to carry
 * forward, the caller should route to `/login` afterward.
 */
export async function resetPassword(email: string, token: string, newPassword: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/password/reset', {
    email,
    token,
    new_password: newPassword,
  })
  return res.data
}

/**
 * POST /auth/me/deactivate — no body. Reversible: a subsequent successful login with the
 * correct password automatically reactivates the account (the backend's own note, not
 * something this frontend has to implement). Revokes every session and clears the web cookie,
 * same as logout — the caller should clear local auth state and route to `/login` afterward,
 * not call `logout()` too (there is no session left for that call to act on).
 */
export async function deactivateAccount(): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/me/deactivate')
  return res.data
}

/**
 * POST /auth/me/delete — a soft delete, irreversible through any route in this API (the email
 * becomes available for a brand-new, unrelated registration; there is no "undelete"). Requires
 * re-entering the current password, same reasoning as `PATCH /auth/password` — a stolen access
 * token alone shouldn't be able to permanently delete the account. Revokes every session and
 * clears the web cookie; the caller should clear local auth state and route to `/login`
 * afterward, same as `deactivateAccount`.
 */
export async function deleteAccount(currentPassword: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/me/delete', {
    current_password: currentPassword,
  })
  return res.data
}

export interface RegisterNgoResponse {
  id: string
  name: string
  status: string
}

/** Matches the backend's `ngo_status` enum (api/00-identity.md). Only the first three are
 *  reachable while the submitter is still a citizen; `suspended`/`deactivated` exist for an
 *  already-approved org and are typed here so an unexpected value never crashes the UI. */
export type NgoStatus = 'pending_approval' | 'active' | 'rejected' | 'suspended' | 'deactivated'

/** Same shape as `GET /ngo/me`. `contact_*` are omitted entirely (not `""`) when unset. */
export interface NgoRegistration {
  id: string
  name: string
  status: NgoStatus
  contact_email?: string
  contact_phone?: string
  created_at: string
  updated_at: string
}

/** Shared TanStack Query key for `GET /ngos/mine`. */
export const MY_NGO_QUERY_KEY = ['ngos', 'mine'] as const

/**
 * GET /ngos/mine — the caller's own most recent NGO submission at ANY status, looked up by
 * `created_by` (not `accounts.ngo_id`, which `GET /ngo/me` uses and which stays empty until an
 * admin approves). This is what lets a citizen see a still-pending or rejected registration
 * after the `201` from `registerNgo` is long gone.
 *
 * A `404` means "never submitted one" — an empty state, not a failure — so it resolves to
 * `null` here rather than throwing; every caller would otherwise have to re-derive that. Any
 * other failure (401/403/network) still throws. The route is `RequireVerified`, so an unverified
 * token gets a real `403 "email verification required"`.
 *
 * Worth knowing: a `rejected` submission doesn't block a new one, so the newest row wins; there
 * is no rejection reason anywhere in the schema, so the UI can say "rejected" but not why. On
 * `active`, the caller's stored access token still carries the OLD role until they log in again
 * (approval also revokes their refresh tokens) — see MyNgoPage.
 */
export async function getMyNgoRegistration(): Promise<NgoRegistration | null> {
  try {
    const res = await apiClient.get<NgoRegistration>('/ngos/mine')
    return res.data
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

/**
 * POST /ngos/register — any verified citizen may call this (already guaranteed by the time a
 * `/app/*` route is reachable at all — see route guards). Always creates a `pending_approval`
 * NGO; the calling account is only promoted to `ngo_admin` if an admin later approves it
 * (`POST /admin/ngos/{ngoID}/approve`, Phase 1's Admin NGOs screen, not yet built).
 *
 * The `201` body is a thin `{id, name, status}` — to show the submission afterward (and on any
 * later visit) read it back with `getMyNgoRegistration` (`GET /ngos/mine`), which resolves by
 * `created_by`; `GET /ngo/me` can't, since it needs `accounts.ngo_id`, only set on approval.
 */
export async function registerNgo(
  name: string,
  contactEmail?: string,
  contactPhone?: string,
): Promise<RegisterNgoResponse> {
  const res = await apiClient.post<RegisterNgoResponse>('/ngos/register', {
    name,
    contact_email: contactEmail || undefined,
    contact_phone: contactPhone || undefined,
  })
  return res.data
}

/** One pending invitation addressed to the caller. `GET /volunteer-invitations` returns
 *  pending ones only and just the inviting NGO's name — no inviter, role, or region details. */
export interface VolunteerInvitation {
  id: string
  ngo_id: string
  ngo_name: string
  status: 'pending'
  created_at: string
}

/** Shared TanStack Query key for `GET /volunteer-invitations` — the Invitations screen and the
 *  Profile sidebar's pending-count badge read the same cache entry. */
export const INVITATIONS_QUERY_KEY = ['volunteer-invitations'] as const

/**
 * GET /volunteer-invitations — the caller's own **pending** invitations, newest first, each with
 * the inviting NGO's name (api/00-identity.md). Any authenticated account may call it
 * (`RequireAuth` only, not `RequireVerified`). Always `[]` when there are none, never an error or
 * `null`. Accepted/declined invitations are never returned, so there is no "past" history to show.
 */
export async function getVolunteerInvitations(): Promise<VolunteerInvitation[]> {
  const res = await apiClient.get<VolunteerInvitation[]>('/volunteer-invitations')
  return res.data
}

/**
 * PATCH /volunteer-invitations/{id}/accept — promotes the caller to `ngo_volunteer` with the NGO's
 * `ngo_id` set, atomically, then revokes every one of their sessions. **The access token in hand
 * still carries the old `user` role**, so the caller must log in again (InvitationsPage signs out
 * right after a successful accept). `404` for a missing *or someone else's* invitation
 * (deliberately indistinguishable), `409 "invitation is not pending"`, or
 * `409 "ngo is not active"` if the NGO was deactivated after the invite went out.
 */
export async function acceptVolunteerInvitation(id: string): Promise<{ message: string }> {
  const res = await apiClient.patch<{ message: string }>(`/volunteer-invitations/${id}/accept`)
  return res.data
}

/**
 * PATCH /volunteer-invitations/{id}/decline — marks it `declined` and touches nothing else on the
 * account (no role change, no session revocation). Same `404`/`409 "invitation is not pending"`
 * shapes as accept.
 */
export async function declineVolunteerInvitation(id: string): Promise<{ message: string }> {
  const res = await apiClient.patch<{ message: string }>(`/volunteer-invitations/${id}/decline`)
  return res.data
}

/** Shared TanStack Query key for `GET /ngo/me` — the calling NGO staff member's own organisation. */
export const NGO_ME_QUERY_KEY = ['ngo', 'me'] as const

/**
 * GET /ngo/me — the caller's own organisation, resolved from `accounts.ngo_id` (no path param).
 * Open to any NGO staff (`ngo_admin` and `ngo_volunteer`); a plain citizen or platform admin gets
 * `403 "account is not affiliated with an ngo"`. Same body shape as `GET /ngos/mine`, and
 * `contact_*` are omitted entirely when unset.
 */
export async function getMyNgo(): Promise<NgoRegistration> {
  const res = await apiClient.get<NgoRegistration>('/ngo/me')
  return res.data
}

/** Fields `PATCH /ngo/me` accepts. A real partial patch: a key that is left out is left
 *  untouched server-side, while `contactEmail`/`contactPhone` set to `""` *clear* the value. */
export interface UpdateMyNgoInput {
  name?: string
  contactEmail?: string
  contactPhone?: string
}

/**
 * PATCH /ngo/me — `ngo_admin` only (`403 "insufficient permissions"` for a volunteer). Only the
 * keys actually present in `patch` are sent: the doc is explicit that re-sending an untouched
 * `contact_email: ""` would actively clear it, so callers pass just what changed. Every field
 * omitted → `400 "at least one field must be provided to update"`; blank `name` → `400 "ngo name
 * is required"`; a non-empty malformed `contact_email` → `400 "invalid email"`. The backend has no
 * status guard on this route today, so a deactivated organisation can still be edited. The
 * response is the updated organisation (email is normalised server-side, e.g. lower-cased).
 */
export async function updateMyNgo(patch: UpdateMyNgoInput): Promise<NgoRegistration> {
  const body: Record<string, string> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.contactEmail !== undefined) body.contact_email = patch.contactEmail
  if (patch.contactPhone !== undefined) body.contact_phone = patch.contactPhone
  const res = await apiClient.patch<NgoRegistration>('/ngo/me', body)
  return res.data
}

/**
 * POST /ngo/me/deactivate — `ngo_admin` only, no body. Flips the organisation to `deactivated`
 * with **no effect on any staff account** (everyone keeps their role and stays signed in), and
 * there is **no reactivation route** — a one-way transition through this API today.
 * `409 "ngo is not active"` if it already isn't.
 */
export async function deactivateMyNgo(): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/ngo/me/deactivate')
  return res.data
}

/**
 * PATCH /auth/password — needs the *current* password even though the caller holds a valid access
 * token (a stolen token alone can't change it). `new_password` must be 8+ characters. **On success
 * every refresh token for the account is revoked — including the caller's own — and the web cookie
 * is cleared**, so the session is dead even though the access token in hand hasn't expired yet.
 * The doc is explicit that the correct UX is an immediate forced logout (clear local auth, go to
 * `/login`), not to let the user carry on until the next silent refresh fails; the caller does
 * exactly that and does NOT also call `logout()` (there's no session left for it to act on). A
 * wrong current password is `401 "invalid email or password"`.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  const res = await apiClient.patch<{ message: string }>('/auth/password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return res.data
}

/** An account's lifecycle status. The doc lists only the first three, but real accounts also sit in
 *  `pending_verification` (registered, email not yet verified — most accounts in a dev database).
 *  `GET /ngo/volunteers` reports it per row too: there is no separate "volunteer status", so a
 *  suspended or deactivated account is still on the roster. */
export type AccountStatus = 'active' | 'pending_verification' | 'suspended' | 'deactivated'

export interface Volunteer {
  id: string
  email: string
  status: AccountStatus
  /** When the *account* was created — not when they joined the organisation (no such field). */
  created_at: string
}

export const VOLUNTEERS_QUERY_KEY = ['ngo', 'volunteers'] as const

/**
 * GET /ngo/volunteers — `ngo_admin` only (`403 "insufficient permissions"` for a volunteer,
 * `403 "account is not affiliated with an ngo"` without a membership). Every `ngo_volunteer`
 * account currently tied to the caller's own organisation, newest first; `[]` when there are none.
 * Rows carry no name (that lives in the profile, which has no NGO-side route) — email only.
 */
export async function getVolunteers(): Promise<Volunteer[]> {
  const res = await apiClient.get<Volunteer[]>('/ngo/volunteers')
  return res.data
}

/** `201` body of `POST /ngo/volunteers/invitations`. */
export interface SentVolunteerInvitation {
  id: string
  ngo_id: string
  invited_account_id: string
  status: 'pending'
  created_at: string
}

/**
 * POST /ngo/volunteers/invitations — `ngo_admin` only. The invitee is looked up by email and must
 * already exist as a plain citizen; nothing about their account changes until they accept. Errors:
 * `404 "account not found"` (no such email), `409 "invited account must be a citizen…"` (already
 * staff somewhere — which includes the caller's own email: the doc promises `400 "cannot invite
 * yourself"`, but the role check runs first, so an `ngo_admin` inviting themselves really gets this
 * 409), `409 "ngo is not active"`. There is no route for an NGO to list the invitations it has
 * sent, and nothing stops the same person being invited twice — each call creates another pending
 * invitation (verified against the real backend: two `201`s, two pending rows).
 */
export async function inviteVolunteer(email: string): Promise<SentVolunteerInvitation> {
  const res = await apiClient.post<SentVolunteerInvitation>('/ngo/volunteers/invitations', { email })
  return res.data
}

/**
 * PATCH /ngo/volunteers/{id}/deactivate — `id` is the volunteer's *account* id. Despite the name it
 * does not touch `accounts.status`: it removes them from the roster (`ngo_id` cleared, role reset
 * to a plain citizen) and revokes their sessions, and the account stays fully usable. A target
 * that isn't a volunteer of the caller's own NGO — including someone already removed — is
 * `403 "this account is not a volunteer under your ngo"`.
 */
export async function removeVolunteer(accountId: string): Promise<{ message: string }> {
  const res = await apiClient.patch<{ message: string }>(`/ngo/volunteers/${accountId}/deactivate`)
  return res.data
}

/** One account as the admin routes return it (`GET /admin/accounts`, `GET /admin/accounts/{id}`,
 *  and the body of a status change). No name, organisation or region: those live in other
 *  contexts and have no admin-side route. */
export interface AccountSummary {
  id: string
  email: string
  role: Role
  status: AccountStatus
  email_verified: boolean
  created_at: string
  updated_at: string
}

interface AccountsPage {
  accounts: AccountSummary[]
  total: number
  limit: number
  offset: number
}

export const ADMIN_ACCOUNTS_QUERY_KEY = ['admin', 'accounts'] as const
export const adminAccountQueryKey = (id: string) => ['admin', 'account', id] as const

const ACCOUNTS_PAGE_SIZE = 100
/** Safety cap on how many accounts the list screen will pull in one go (50 pages of 100). */
const MAX_ACCOUNTS_LOADED = 5000

/**
 * GET /admin/accounts?limit=&offset= — `admin`/`super_admin` only. Plain offset pagination, newest
 * first, over every non-deleted account. `limit` is capped at 100 (anything outside `1..100` is
 * silently replaced by 20) and `total` counts *all* accounts, not just this page. There is **no**
 * search, role or status parameter — anything else in the query string is ignored.
 */
export async function getAccountsPage(limit: number, offset: number): Promise<AccountsPage> {
  const res = await apiClient.get<AccountsPage>('/admin/accounts', { params: { limit, offset } })
  return res.data
}

export interface AllAccounts {
  accounts: AccountSummary[]
  /** The server's count of every account. Larger than `accounts.length` only when the safety cap
   *  cut the load short. */
  total: number
}

/**
 * Every account, newest first, assembled from pages of 100 — because the API can't search or
 * filter, the list screen does that itself, over this. Fine for a few thousand accounts; past
 * `MAX_ACCOUNTS_LOADED` it stops and `total` says how many it left out. The right long-term fix
 * is server-side `q`/`role`/`status` parameters, at which point this is the one function to swap.
 * Pages are fetched in parallel after the first (which supplies `total`), and rows are de-duplicated
 * by id in case accounts were added between requests and shifted the offsets.
 */
export async function getAllAccounts(): Promise<AllAccounts> {
  const first = await getAccountsPage(ACCOUNTS_PAGE_SIZE, 0)
  const wanted = Math.min(first.total, MAX_ACCOUNTS_LOADED)
  const offsets: number[] = []
  for (let offset = ACCOUNTS_PAGE_SIZE; offset < wanted; offset += ACCOUNTS_PAGE_SIZE) offsets.push(offset)
  const rest = await Promise.all(offsets.map((offset) => getAccountsPage(ACCOUNTS_PAGE_SIZE, offset)))

  const seen = new Set<string>()
  const accounts: AccountSummary[] = []
  for (const page of [first, ...rest]) {
    for (const account of page.accounts) {
      if (!seen.has(account.id)) {
        seen.add(account.id)
        accounts.push(account)
      }
    }
  }
  return { accounts, total: first.total }
}

/**
 * GET /admin/accounts/{id} — `400 "invalid account id"` for a malformed id, `404 "account not
 * found"` for an unknown or soft-deleted one.
 */
export async function getAccount(id: string): Promise<AccountSummary> {
  const res = await apiClient.get<AccountSummary>(`/admin/accounts/${id}`)
  return res.data
}

/** What the admin UI offers. The API also accepts `block`/`unblock`, true synonyms for these two. */
export type AccountStatusAction = 'suspend' | 'reactivate'

/**
 * PATCH /admin/accounts/{id}/status — returns the updated account. Suspending revokes every one of
 * the account's refresh tokens immediately. **No guard of any kind:** an admin can suspend their
 * own account (verified: `200`, then locked out with `403 "account is not active"`), another admin,
 * or the last super admin, and `reactivate` flips *any* non-active status to `active` — including a
 * suspended account that was still `pending_verification`, which comes back `active` with
 * `email_verified: false`. `409 "account already suspended"` / `"account already active"` mean the
 * account is already in the requested state, so callers refresh rather than report a failure.
 */
export async function updateAccountStatus(id: string, action: AccountStatusAction): Promise<AccountSummary> {
  const res = await apiClient.patch<AccountSummary>(`/admin/accounts/${id}/status`, { action })
  return res.data
}
