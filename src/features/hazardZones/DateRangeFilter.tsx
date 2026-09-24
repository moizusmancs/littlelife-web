import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isReversedRange, type DateRange } from './zoneModel'

export interface DateRangeFilterProps {
  range: DateRange
  /** What the dates filter on — "detected" for zones, "generated" for predictions — so the labels say it. */
  noun: string
  onChange: (range: DateRange) => void
}

/** Two date inputs and a Clear; says so when the range runs backwards (nothing could match). Purely presentational. */
export function DateRangeFilter({ range, noun, onChange }: DateRangeFilterProps) {
  const reversed = isReversedRange(range)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <label className="flex flex-col gap-1 font-body text-body-sm font-medium text-ink-700">
          {noun} from
          <Input type="date" value={range.from} max={range.to || undefined} onChange={(event) => onChange({ ...range, from: event.target.value })} className="h-9 w-full text-body-sm sm:w-40" hasError={reversed} />
        </label>
        <label className="flex flex-col gap-1 font-body text-body-sm font-medium text-ink-700">
          {noun} to
          <Input type="date" value={range.to} min={range.from || undefined} onChange={(event) => onChange({ ...range, to: event.target.value })} className="h-9 w-full text-body-sm sm:w-40" hasError={reversed} />
        </label>
        {(range.from || range.to) && (
          <Button type="button" variant="ghost" size="sm" className="col-span-2 sm:col-auto" onClick={() => onChange({ from: '', to: '' })}>
            Clear dates
          </Button>
        )}
      </div>
      {reversed && (
        <p role="alert" className="font-body text-body-sm text-status-critical">
          The start date is after the end date, so nothing can match.
        </p>
      )}
    </div>
  )
}
