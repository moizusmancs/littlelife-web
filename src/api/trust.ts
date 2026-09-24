import { apiClient } from '@/api/client'

/**
 * Trust — safety connections + live GPS relay WS, trust score, moderation actions.
 * Backend doc: supporting-material/api/06-trust.md (built).
 * Filled in during FRONTEND_IMPLEMENTATION_PLAN.md Phase 4. The WS hook built here
 * (`?token=` query-param auth, reconnect-with-backoff) is the pattern Phase 7 reuses for
 * navigation rerouting and chat once those backend domains ship.
 *
 * So far only the two admin-facing pieces the Users & Accounts screen needs are wired
 * (Phase 1's Admin half); safety connections and the WebSocket are Phase 4.
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
