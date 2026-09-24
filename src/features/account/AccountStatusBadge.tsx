import { Badge } from '@/components/ui/badge'
import type { AccountStatus } from '@/api/identity'
import { ACCOUNT_STATUS_LABEL } from './accountStatusLabels'

const TONE: Record<AccountStatus, 'safe' | 'info' | 'caution' | 'critical'> = {
  active: 'safe',
  pending_verification: 'info',
  suspended: 'critical',
  deactivated: 'caution',
}

/** An account's lifecycle status as a pill — one mapping for every screen that lists accounts. */
export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <Badge tone={TONE[status]}>{ACCOUNT_STATUS_LABEL[status]}</Badge>
}
