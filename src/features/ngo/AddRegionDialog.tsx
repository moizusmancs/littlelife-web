import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { RegionPicker, type RegionPickerProps } from '@/features/regions/RegionPicker'

export interface AddRegionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What the list of all regions is doing: still loading, failed, there are none, or ready to pick from. */
  state: 'loading' | 'error' | 'empty' | 'ready'
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
 * Adds one region to the organisation's coverage, chosen with the shared `RegionPicker` (drill down
 * province › district › tehsil, or search). A region already covered stays listed but can't be picked,
 * with the reason beside it, so nobody sends a request the API would answer with a `409`.
 */
export function AddRegionDialog({ open, onOpenChange, state, error, onRetry, picker, hasSelection, onConfirm, isSubmitting, serverError }: AddRegionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogTitle>Add an operational region</DialogTitle>
        <DialogDescription>
          Choose a whole province, or narrow down to a district or a tehsil. Use the arrow beside a region to see what's inside it.
        </DialogDescription>

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
            Add region
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
