import { Badge } from '@/components/ui/badge'
import type { NgoStatus } from '@/api/identity'
import { NGO_STATUS_LABEL } from './ngoFilters'

const TONE: Record<NgoStatus, 'caution' | 'safe' | 'critical' | 'info'> = {
  pending_approval: 'caution',
  active: 'safe',
  suspended: 'critical',
  rejected: 'critical',
  deactivated: 'info',
}

/** An organisation's status as a pill, worded for the admin ("Active", not the citizen's "Approved"). */
export function NgoStatusBadge({ status }: { status: NgoStatus }) {
  return <Badge tone={TONE[status]}>{NGO_STATUS_LABEL[status]}</Badge>
}
