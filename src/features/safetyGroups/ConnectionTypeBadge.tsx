import type { ConnectionType } from '@/api/trust'
import { Badge } from '@/components/ui/badge'
import { TYPE_LABEL } from './connections'

/** "Family" or "Safety group" as a small pill. */
export function ConnectionTypeBadge({ type }: { type: ConnectionType }) {
  return <Badge tone={type === 'family' ? 'trust' : 'info'}>{TYPE_LABEL[type]}</Badge>
}
