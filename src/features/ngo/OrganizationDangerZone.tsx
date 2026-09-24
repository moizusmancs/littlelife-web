import { WarningIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { NgoStatus } from '@/api/identity'

export interface OrganizationDangerZoneProps {
  status: NgoStatus
  onDeactivateClick: () => void
}

/**
 * Pixel reference for the styling: the destructive "Leave organisation" row in Batch 4 NGO §4m
 * (critical-tinted card, warning icon, title + one line of consequence, trailing action) — §4l has
 * no deactivate control, but WEB_DESIGN_PLAN.md §6.3 specifies one ("Deactivate Organization —
 * Danger-outline → confirm dialog"). Only an `active` organisation can be deactivated (the server
 * `409`s otherwise), so for any other status the action is replaced by a plain statement rather
 * than a button that can only fail. Purely presentational.
 */
export function OrganizationDangerZone({ status, onDeactivateClick }: OrganizationDangerZoneProps) {
  const isActive = status === 'active'

  return (
    <div className="flex flex-col gap-4 rounded-md border border-status-critical/30 bg-status-critical-tint p-5 sm:flex-row sm:items-center">
      <WarningIcon weight="fill" size={22} className="flex-none text-status-critical" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="font-body text-body-md font-semibold text-ink-900">
          {isActive ? 'Deactivate organisation' : 'This organisation is no longer active'}
        </h2>
        <p className="mt-0.5 font-body text-body-sm text-ink-700">
          {isActive
            ? "Stops it sending volunteer invitations. Staff keep their accounts, but there's currently no way to reactivate it."
            : "Deactivation can't be undone from the app, and only an active organisation can be deactivated."}
        </p>
      </div>
      {isActive && (
        <Button type="button" variant="dangerOutline" className="flex-none" onClick={onDeactivateClick}>
          Deactivate…
        </Button>
      )}
    </div>
  )
}
