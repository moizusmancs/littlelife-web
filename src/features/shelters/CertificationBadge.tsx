import { SealCheckIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import type { Shelter } from '@/api/facilities'
import { CERTIFICATION_LABEL } from '@/features/map/mapModel'

const TONE = { certified: 'trust', pending: 'caution', uncertified: 'info' } as const

/** Certified (with a seal), pending or uncertified — the shelter's certification as the API states it. Purely presentational. */
export function CertificationBadge({ status }: { status: Shelter['certification_status'] }) {
  return (
    <Badge tone={TONE[status]}>
      {status === 'certified' && <SealCheckIcon size={11} weight="fill" className="me-1 inline align-[-1px]" aria-hidden="true" />}
      {CERTIFICATION_LABEL[status]}
    </Badge>
  )
}
