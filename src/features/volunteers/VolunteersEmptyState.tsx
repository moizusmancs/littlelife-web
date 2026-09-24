import { UsersThreeIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export interface VolunteersEmptyStateProps {
  onInvite: () => void
  /** False when the organisation can't invite (it isn't active) — the page explains why above. */
  canInvite: boolean
}

/** Shown when `GET /ngo/volunteers` succeeds with `[]`. Purely presentational. */
export function VolunteersEmptyState({ onInvite, canInvite }: VolunteersEmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <UsersThreeIcon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-h3 font-bold text-ink-900">No volunteers yet</h2>
      <p className="mt-1 max-w-sm font-body text-body-md text-ink-500">
        Invite a citizen by email. They accept from their profile, and once they do they'll appear here.
      </p>
      {canInvite && (
        <Button type="button" className="mt-5" onClick={onInvite}>
          Invite a volunteer
        </Button>
      )}
    </div>
  )
}
