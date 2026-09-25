import { useId, type FormEvent } from 'react'
import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Shelter } from '@/api/facilities'
import { capacityInfo } from '@/features/map/mapModel'
import { CAPACITY_PERCENT_TEXT } from '@/features/shelters/capacityTones'
import { checkOccupancy, stepOccupancy } from './shelterModel'

export interface OccupancyEditorProps {
  shelter: Pick<Shelter, 'name' | 'capacity_current' | 'capacity_total'>
  /** What is in the field — the parent holds it, so the same editor serves the list row and the detail card. */
  text: string
  onTextChange: (text: string) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  /** The server's refusal, if the last save was refused. */
  serverError: string | null
  className?: string
}

/**
 * "Update occupancy": a stepper around a number field, with what will happen said beside it — "of 450 · was 380 · 92% after save" —
 * or, for anything the API would refuse (empty, fractional, negative, over the capacity), why. Saving is only possible for a valid
 * number that differs from the stored one. Enter saves and Escape cancels. Purely presentational: the text and the request are the
 * parent's.
 */
export function OccupancyEditor({ shelter, text, onTextChange, onSave, onCancel, isSaving, serverError, className }: OccupancyEditorProps) {
  const hintId = useId()
  const check = checkOccupancy(text, shelter)
  const canSave = check.ok && check.changed && !isSaving
  const after = check.ok ? capacityInfo({ capacity_current: check.value, capacity_total: shelter.capacity_total }) : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSave) onSave()
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
      noValidate
      aria-label={`Update occupancy of ${shelter.name}`}
      className={cn('flex flex-col gap-3', className)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="font-body text-label font-semibold text-ink-900">Update occupancy</span>
        <div className="flex items-center rounded-sm border border-surface-border bg-surface-raised">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-s-sm border-e border-surface-border text-primary-700 hover:bg-surface-sunken"
            aria-label="One fewer person"
            onClick={() => onTextChange(stepOccupancy(text, shelter, -1))}
          >
            <MinusIcon size={16} weight="bold" aria-hidden="true" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            aria-label={`People currently at ${shelter.name}`}
            aria-invalid={!check.ok || undefined}
            aria-describedby={hintId}
            className="h-10 w-24 bg-transparent text-center font-heading text-body-lg font-bold text-ink-900 focus:outline-none"
          />
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-e-sm border-s border-surface-border text-primary-700 hover:bg-surface-sunken"
            aria-label="One more person"
            onClick={() => onTextChange(stepOccupancy(text, shelter, 1))}
          >
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <p id={hintId} className={cn('font-body text-body-sm', check.ok ? 'text-ink-500' : 'text-status-critical')}>
          {check.ok && after ? (
            check.changed ? (
              <>
                of {shelter.capacity_total.toLocaleString('en-US')} · was {shelter.capacity_current.toLocaleString('en-US')} ·{' '}
                <span className={cn('font-semibold', CAPACITY_PERCENT_TEXT[after.tone])}>{check.percent}% after save</span>
              </>
            ) : (
              `of ${shelter.capacity_total.toLocaleString('en-US')} · this is what's recorded now`
            )
          ) : (
            !check.ok && check.message
          )}
        </p>
        <div className="ms-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isSaving} disabled={!canSave && !isSaving}>
            Save occupancy
          </Button>
        </div>
      </div>

      {serverError && (
        <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          {serverError}
        </div>
      )}
    </form>
  )
}
