import { apiClient } from '@/api/client'

/**
 * Trust — safety connections + live GPS relay WS, trust score, moderation actions.
 * Backend doc: supporting-material/api/06-trust.md (built).
 * Filled in during FRONTEND_IMPLEMENTATION_PLAN.md Phase 4. The WS hook built here
 * (`?token=` query-param auth, reconnect-with-backoff) is the pattern Phase 7 reuses for
 * navigation rerouting and chat once those backend domains ship.
 *
 * Wired so far: the two admin-facing pieces the Users & Accounts screen needs (Phase 1's Admin
 * half) and the safety-connection CRUD behind Safety Groups. The WebSocket and the citizen's own
 * trust score are still to do.
 */

export interface TrustScore {
  account_id: string
  score: number
  /** Omitted entirely when the account has no persisted score row — the backend then reports an
   *  implicit `0`, which is "never scored", not "scored zero". */
  updated_at?: string
}

export const accountTrustScoreQueryKey = (id: string) => ['trust', 'score', id] as const

/**
 * GET /accounts/{id}/trust-score — open to NGO staff and admins. Never `404`s: an account with no
 * row (or a syntactically valid id that doesn't exist at all) comes back as `score: 0` with no
 * `updated_at`. There is no route for the itemised history the mockup implies — the
 * `credibility_events` table that would feed it is a later backend phase.
 */
export async function getAccountTrustScore(accountId: string): Promise<TrustScore> {
  const res = await apiClient.get<TrustScore>(`/accounts/${accountId}/trust-score`)
  return res.data
}

export type ModerationActionType = 'warn' | 'suspend' | 'block' | 'unblock'

export interface ModerationAction {
  id: string
  target_account_id: string
  action_type: ModerationActionType
  reason: string
  /** The admin who recorded it — an account id, with no route to resolve it to a person. */
  performed_by: string
  created_at: string
}

export const moderationActionsQueryKey = (id: string) => ['trust', 'moderation', id] as const

/**
 * GET /admin/accounts/{id}/moderation-actions — `admin`/`super_admin` only. Newest first, `[]` for
 * an account with none (and for one that doesn't exist: this route never `404`s).
 */
export async function listModerationActions(accountId: string): Promise<ModerationAction[]> {
  const res = await apiClient.get<ModerationAction[]>(`/admin/accounts/${accountId}/moderation-actions`)
  return res.data
}

/**
 * POST /admin/accounts/{id}/moderation-actions — an append-only log entry, **deliberately separate
 * from `accounts.status`**: recording `suspend` or `block` here does not suspend anything. `reason`
 * must be non-blank; recording against your own account is `400 "cannot record a moderation action
 * against your own account"`; an unknown target is `404 "target account not found"`.
 */
export async function recordModerationAction(
  accountId: string,
  actionType: ModerationActionType,
  reason: string,
): Promise<ModerationAction> {
  const res = await apiClient.post<ModerationAction>(`/admin/accounts/${accountId}/moderation-actions`, {
    action_type: actionType,
    reason,
  })
  return res.data
}

export type ConnectionType = 'family' | 'safety_group'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'

/**
 * One connection, in the same shape from every route that returns one (`GET`, `POST`, both `PATCH`es).
 * The backend has **no group entity** — a "safety group" is just a set of these pairwise connections.
 * Direction isn't labelled: compare `requester_account_id`/`recipient_account_id` with your own id.
 *
 * The four name/email fields are always present and `""` when there is nothing to show: no name set yet,
 * an account that no longer exists, or **you aren't allowed to see them yet**. The rule (api/06-trust.md,
 * *who sees whom*): you always see your own; once `accepted` both see each other's; until then the
 * person *asked* sees who is asking, but the *requester* sees nothing about the recipient — not even after
 * a decline. So an outgoing pending (or declined) request has `recipient_name`/`recipient_email` both `""`.
 */
export interface SafetyConnection {
  id: string
  requester_account_id: string
  requester_name: string
  requester_email: string
  recipient_account_id: string
  recipient_name: string
  recipient_email: string
  connection_type: ConnectionType
  status: ConnectionStatus
  created_at: string
  /** Absent until the recipient has accepted or declined. */
  responded_at?: string
  updated_at: string
}

export const SAFETY_CONNECTIONS_QUERY_KEY = ['trust', 'safety-connections'] as const

/** GET /safety-connections — every connection the caller is party to, on either side, any status, newest first. */
export async function listSafetyConnections(): Promise<SafetyConnection[]> {
  const res = await apiClient.get<SafetyConnection[]>('/safety-connections')
  return res.data
}

/** Who a request is addressed to: an email (matched case-insensitively, trimmed by the server) or an account id (the "Member ID"). */
export type ConnectionRecipient = { email: string } | { accountId: string }

/**
 * POST /safety-connections — the requester is always the caller; the recipient is named by email *or*
 * account id (exactly one). The server judges everything that can't be checked locally, with messages
 * meant to be shown as they are: `400` (your own id/email, a malformed one, an unknown type),
 * `404 "recipient account not found"` (no such account **or** not an active citizen — deliberately the
 * same answer), and `409` for a pending request either way round or an accepted connection already.
 * The response does not reveal the recipient's name or email to the requester (see `SafetyConnection`).
 */
export async function requestSafetyConnection(
  recipient: ConnectionRecipient,
  connectionType: ConnectionType,
): Promise<SafetyConnection> {
  const res = await apiClient.post<SafetyConnection>('/safety-connections', {
    ...('email' in recipient ? { recipient_email: recipient.email } : { recipient_account_id: recipient.accountId }),
    connection_type: connectionType,
  })
  return res.data
}

/** PATCH /safety-connections/{id}/accept — recipient only (`403` for anyone else), and only while pending (`409`). */
export async function acceptSafetyConnection(id: string): Promise<SafetyConnection> {
  const res = await apiClient.patch<SafetyConnection>(`/safety-connections/${id}/accept`)
  return res.data
}

/** PATCH /safety-connections/{id}/decline — same rules as accept. */
export async function declineSafetyConnection(id: string): Promise<SafetyConnection> {
  const res = await apiClient.patch<SafetyConnection>(`/safety-connections/${id}/decline`)
  return res.data
}

/**
 * DELETE /safety-connections/{id} — either party, at any status: cancels a request you sent, severs
 * an accepted connection, or tidies away a declined one. `204`; `404` if it's already gone.
 */
export async function removeSafetyConnection(id: string): Promise<void> {
  await apiClient.delete(`/safety-connections/${id}`)
}
