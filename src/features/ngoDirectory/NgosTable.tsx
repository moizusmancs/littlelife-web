import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CheckIcon, EyeIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn, getInitials } from '@/lib/utils'
import type { AdminNgo } from '@/api/identity'
import { NgoStatusBadge } from './NgoStatusBadge'
import { canDecide } from './ngoFilters'

/** One shared column template so the header and every row line up from `md` up. Everything after
 *  the two flexible columns is fixed-width: each row is its own grid, so an `auto` column would size
 *  to that row's buttons and push its neighbours out of line (see the accounts table). */
const COLUMNS = 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_4.5rem_6.5rem_8rem_15.5rem]'

export interface NgosTableProps {
  ngos: AdminNgo[]
  onApprove: (ngo: AdminNgo) => void
  onReject: (ngo: AdminNgo) => void
  /** Router state passed along to the detail page (it uses it to link back to this exact view). */
  detailState?: unknown
}

/**
 * The organisations table for one page. Pattern W-List; pixel reference Batch 5 §5e (uppercase 11px
 * column labels, a rounded tile, pills, actions at the end). Only what an admin-side NGO carries is
 * shown — name, contact, applicant, volunteer and region counts, submitted date, status — so the
 * mockup's tasks-done, response-time and feedback columns are absent. Pending rows offer Approve
 * and Reject next to View; every other row offers View only. Below `md` each row is a small card.
 * Purely presentational.
 */
export function NgosTable({ ngos, onApprove, onReject, detailState }: NgosTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
      <div
        className={`hidden h-10 items-center gap-4 border-b border-surface-border bg-surface-base px-5 font-body text-[11px] font-semibold tracking-wider text-ink-500 uppercase md:grid ${COLUMNS}`}
        aria-hidden="true"
      >
        <div>Organisation</div>
        <div>Applicant</div>
        <div>Volunteers</div>
        <div>Regions</div>
        <div>Submitted</div>
        <div>Status</div>
        <div />
      </div>

      <ul>
        {ngos.map((ngo) => (
          <li
            key={ngo.id}
            className={`grid grid-cols-1 gap-2 border-b border-surface-border px-4 py-3.5 last:border-b-0 md:items-center md:gap-x-4 md:px-5 ${COLUMNS}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex size-10 flex-none items-center justify-center rounded-lg bg-status-trust-tint font-heading text-label font-bold text-status-trust"
                aria-hidden="true"
              >
                {getInitials(ngo.name) || '?'}
              </div>
              <div className="min-w-0">
                <p className="font-body text-body-md font-semibold text-ink-900 [overflow-wrap:anywhere]">{ngo.name}</p>
                {(ngo.contact_email || ngo.contact_phone) && (
                  <p className="font-body text-body-sm text-ink-500 [overflow-wrap:anywhere]">
                    {[ngo.contact_email, ngo.contact_phone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <p className="font-body text-body-sm text-ink-700 [overflow-wrap:anywhere] max-md:ps-13">
              <span className="text-ink-500 md:sr-only">Applicant </span>
              {ngo.created_by_email}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-body text-body-sm text-ink-500 max-md:ps-13 md:contents">
              <span className="md:text-ink-700">
                {ngo.volunteer_count}
                <span className="md:sr-only"> {ngo.volunteer_count === 1 ? 'volunteer' : 'volunteers'}</span>
              </span>
              <span className="md:text-ink-700">
                {ngo.region_count}
                <span className="md:sr-only"> {ngo.region_count === 1 ? 'region' : 'regions'}</span>
              </span>
              <span>
                <span className="md:sr-only">Submitted </span>
                {format(parseISO(ngo.created_at), 'd MMM yyyy')}
              </span>
              <div className="flex items-center">
                <NgoStatusBadge status={ngo.status} />
              </div>
            </div>

            <div className="flex items-center gap-2 max-md:ps-13">
              <Link
                to={`/admin/ngos/${ngo.id}`}
                state={detailState}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-9 flex-none px-0')}
                aria-label={`View ${ngo.name}`}
              >
                <EyeIcon size={16} aria-hidden="true" />
              </Link>
              {canDecide(ngo) && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onApprove(ngo)}
                    aria-label={`Approve ${ngo.name}`}
                  >
                    <CheckIcon size={14} weight="bold" aria-hidden="true" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="dangerOutline"
                    onClick={() => onReject(ngo)}
                    aria-label={`Reject ${ngo.name}`}
                  >
                    <XIcon size={14} weight="bold" aria-hidden="true" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
