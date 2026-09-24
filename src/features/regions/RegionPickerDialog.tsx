import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { RegionPicker, type RegionPickerProps } from './RegionPicker'
import type { RegionChoiceState } from './useRegionChoice'

export interface RegionPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** The confirm button's label ("Add region", "Set home region"). */
  confirmLabel: string
  /** What the list of all regions is doing: still loading, failed, there are none, or ready to pick from. */
  state: RegionChoiceState
  /** For `error`: the message. */
  error: string | null
  onRetry: () => void
  picker: RegionPickerProps
  /** Whether a region is chosen — Add stays disabled until one is. */
  hasSelection: boolean
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * A dialog for choosing one region with the shared `RegionPicker` (drill down province › district ›
 * tehsil, or search), for whichever screen needs it — the caller supplies the wording and what
 * confirming does. A region that can't be chosen stays listed, disabled, with the reason beside it
 * (`unavailable` on the picker), so nobody sends a request the API would refuse. Confirm stays
 * disabled until something is chosen. Purely presentational.
 */
export function RegionPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  state,
  error,
  onRetry,
  picker,
  hasSelection,
  onConfirm,
  isSubmitting,
  serverError,
}: RegionPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <div className="mt-4">
          {state === 'loading' && (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading regions">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
              ))}
            </div>
          )}
          {state === 'error' && (
            <div>
              <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                {error}
              </div>
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
          {state === 'empty' && (
            <p className="font-body text-body-md text-ink-500">There are no regions to choose from yet. A platform admin adds them under Regions.</p>
          )}
          {state === 'ready' && <RegionPicker {...picker} />}
        </div>

        {serverError && (
          <div role="alert" className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {serverError}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={!hasSelection} isLoading={isSubmitting} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
