import { Link } from 'react-router-dom'
import { CaretRightIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import type { AdminNgo } from '@/api/identity'
import { NgoStatusBadge } from './NgoStatusBadge'
import type { NgoDecision } from './NgoDecisionDialog'
import { canDecide } from './ngoFilters'

export interface NgoDetailHeaderProps {
  ngo: AdminNgo
  onDecide: (decision: NgoDecision) => void
  /** Where the breadcrumb leads: the list, with whatever tab/search it was left on. */
  backTo: string
}

/**
 * Breadcrumb, identity (tile, name, status, and who applied) and — for a pending application only —
 * Approve and Reject. The applicant links to their account page, since an admin weighing an
 * application wants to see who they are. Purely presentational.
 */
export function NgoDetailHeader({ ngo, onDecide, backTo }: NgoDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-body text-body-sm text-ink-500">
        <Link to={backTo} className="flex-none font-semibold whitespace-nowrap text-primary-700 hover:underline">
          NGOs
        </Link>
        <CaretRightIcon size={12} aria-hidden="true" />
        <span aria-current="page" className="min-w-0 [overflow-wrap:anywhere]">
          {ngo.name}
        </span>
      </nav>

      <div className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex size-14 flex-none items-center justify-center rounded-xl bg-status-trust-tint font-heading text-h3 font-bold text-status-trust"
            aria-hidden="true"
          >
            {getInitials(ngo.name) || '?'}
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-h2 font-bold text-ink-900 [overflow-wrap:anywhere]">{ngo.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <NgoStatusBadge status={ngo.status} />
              <span className="font-body text-body-sm text-ink-500">
                Submitted by{' '}
                <Link to={`/admin/users/${ngo.created_by_id}`} className="font-semibold text-primary-700 hover:underline [overflow-wrap:anywhere]">
                  {ngo.created_by_email}
                </Link>
              </span>
            </div>
          </div>
        </div>

        {canDecide(ngo) && (
          <div className="flex flex-wrap items-center gap-3 lg:flex-none">
            <Button type="button" variant="dangerOutline" onClick={() => onDecide('reject')}>
              <XIcon size={16} weight="bold" aria-hidden="true" />
              Reject
            </Button>
            <Button type="button" onClick={() => onDecide('approve')}>
              <CheckIcon size={16} weight="bold" aria-hidden="true" />
              Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
