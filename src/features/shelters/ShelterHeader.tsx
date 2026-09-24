import { Link } from 'react-router-dom'
import { ArrowLeftIcon, HouseLineIcon, NavigationArrowIcon, TentIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { Shelter } from '@/api/facilities'
import { shelterPlace } from '@/features/map/mapModel'
import { CertificationBadge } from './CertificationBadge'

/**
 * Back to the map, then the shelter's identity: an illustration in place of a photo (the API has none — never a broken image), the
 * name, what it is, whether it is open, its certification, and **Navigate Here**. On a phone that button is pinned to the bottom
 * of the screen, as the mobile spec has it; from `md` up it sits beside the name. Purely presentational.
 */
export function ShelterHeader({ shelter }: { shelter: Shelter }) {
  const place = shelterPlace(shelter)
  const open = shelter.status === 'open'
  const Icon = shelter.type === 'relief_center' ? TentIcon : HouseLineIcon

  return (
    <div className="flex flex-col gap-4">
      <Link to="/app/map" className="inline-flex h-8 w-fit items-center gap-1.5 font-body text-label font-semibold text-primary-700 hover:underline">
        <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
        Back to map
      </Link>

      <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
        <div className={cn('flex h-28 items-center justify-center bg-linear-to-br via-surface-sunken to-peach-100', open ? 'from-status-safe-tint' : 'from-status-critical-tint')} aria-hidden="true">
          <span className="flex size-16 items-center justify-center rounded-full bg-white shadow-md">
            <Icon size={32} weight="fill" className={open ? 'text-status-safe' : 'text-status-critical'} />
          </span>
        </div>
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-h2 font-bold text-ink-900 [overflow-wrap:anywhere]">{shelter.name}</h1>
            <p className="mt-1 font-body text-body-sm text-ink-500">{place.typeLabel}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge tone={open ? 'safe' : 'critical'}>{place.statusLabel}</Badge>
              <CertificationBadge status={shelter.certification_status} />
            </div>
          </div>
          <Link
            to={`/app/navigate?destination_shelter_id=${shelter.id}`}
            className={cn(buttonVariants({ size: 'lg' }), 'md:flex-none max-md:fixed max-md:inset-x-4 max-md:bottom-4 max-md:z-30 max-md:shadow-lg')}
          >
            <NavigationArrowIcon size={18} weight="bold" aria-hidden="true" />
            Navigate Here
          </Link>
        </div>
      </div>
    </div>
  )
}
