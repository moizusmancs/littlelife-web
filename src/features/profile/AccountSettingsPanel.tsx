import { TrashIcon, WarningIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export interface AccountSettingsPanelProps {
  onDeactivateClick: () => void
  onDeleteClick: () => void
}

/**
 * No reference mockup pictures this exact panel for a citizen account — Batch 4 NGO §4m ("My
 * Account") is staff-facing and includes several sections (2FA, recovery codes, active
 * sessions) with no backing route anywhere in api/00-identity.md, so it isn't a reliable pixel
 * source for content here; only its row layout (icon + title/description + trailing action,
 * divided rows in one card) is reused, since that's a generic, real pattern. Two rows only,
 * matching exactly the two real routes this screen has (WEB_DESIGN_PLAN.md §6.2): Deactivate
 * (caution icon, reversible) and Delete (critical icon, irreversible). Purely presentational —
 * both actions open a confirm dialog owned by AccountSettingsPage, this component only reports
 * the click.
 */
export function AccountSettingsPanel({ onDeactivateClick, onDeleteClick }: AccountSettingsPanelProps) {
  return (
    <div className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
      <h1 className="font-heading text-h2 font-bold text-ink-900">Account Settings</h1>
      <p className="mt-1 font-body text-body-md text-ink-500">Manage your account's active status.</p>

      <div className="mt-6 flex flex-col">
        <div className="flex items-start gap-4 border-b border-surface-border py-5 first:pt-0 last:border-b-0 last:pb-0">
          <WarningIcon weight="fill" size={22} className="mt-0.5 flex-none text-status-caution" />
          <div className="min-w-0 flex-1">
            <p className="font-body text-body-md font-semibold text-ink-900">Deactivate account</p>
            <p className="mt-0.5 font-body text-body-sm text-ink-500">
              Signs you out everywhere. Logging back in with your password reactivates it — nothing is lost.
            </p>
          </div>
          <Button type="button" variant="dangerOutline" size="sm" onClick={onDeactivateClick} className="flex-none">
            Deactivate
          </Button>
        </div>

        <div className="flex items-start gap-4 border-b border-surface-border py-5 first:pt-0 last:border-b-0 last:pb-0">
          <TrashIcon weight="fill" size={22} className="mt-0.5 flex-none text-status-critical" />
          <div className="min-w-0 flex-1">
            <p className="font-body text-body-md font-semibold text-ink-900">Delete account</p>
            <p className="mt-0.5 font-body text-body-sm text-ink-500">
              Permanent. Your reports, connections, and history are gone — this can't be undone.
            </p>
          </div>
          <Button type="button" variant="dangerOutline" size="sm" onClick={onDeleteClick} className="flex-none">
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
