import type { AccountStatus } from '@/api/identity'

/** Human labels for an account's lifecycle status. */
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  pending_verification: 'Pending verification',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
}
