import { Link } from 'react-router-dom'
import { ArrowLeftIcon, HouseLineIcon, PencilSimpleIcon, TentIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Shelter } from '@/api/facilities'
import { CertificationBadge } from '@/features/shelters/CertificationBadge'
import { shelterTypeLabel } from './shelterModel'

export interface NgoShelterHeaderProps {
  shelter: Shelter
  /** The list, with the view it was opened from (`?filter=…`), so Back returns to it. */
  backTo: string
  /** `ngo_admin` of the managing organisation only. */
  canEdit: boolean
  onEdit: () => void
}

/** Back to the shelters list, then the shelter's identity — tile, name, kind, Open/Closed and certification — and **Edit** for an admin. Purely presentational. */
export function NgoShelterHeader({ shelter, backTo, canEdit, onEdit }: NgoShelterHeaderProps) {
  const open = shelter.status === 'open'
  const Icon = shelter.type === 'relief_center' ? TentIcon : HouseLineIcon
  return (
    <div className="flex flex-col gap-4">
      <Link to={backTo} className="inline-flex h-8 w-fit items-center gap-1.5 font-body text-label font-semibold text-primary-700 hover:underline">
        <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
        Back to shelters
      </Link>

      <div className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={cn('flex size-14 flex-none items-center justify-center rounded-full', open ? 'bg-status-safe-tint text-status-safe' : 'bg-status-critical-tint text-status-critical')}
            aria-hidden="true"
          >
            <Icon size={28} weight="fill" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-h2 font-bold text-ink-900 [overflow-wrap:anywhere]">{shelter.name}</h1>
            <p className="mt-0.5 font-body text-body-sm text-ink-500">{shelterTypeLabel(shelter.type)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={open ? 'safe' : 'critical'}>{open ? 'Open' : 'Closed'}</Badge>
              <CertificationBadge status={shelter.certification_status} />
            </div>
          </div>
        </div>
        {canEdit && (
          <Button type="button" variant="secondary" className="flex-none" onClick={onEdit}>
            <PencilSimpleIcon size={16} aria-hidden="true" />
            Edit shelter
          </Button>
        )}
      </div>
    </div>
  )
}
