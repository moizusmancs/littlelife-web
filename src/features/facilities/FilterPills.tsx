import { cn } from '@/lib/utils'
import { ALL, type Option } from './facilityModel'

export interface FilterPillsProps {
  /** Names the group ("Type", "Status") — visible, and the group's accessible name. */
  label: string
  value: string
  options: readonly Option[]
  /** How many rows each pill would show (`ALL` included). */
  counts: Record<string, number>
  onChange: (value: string) => void
}

/** One group of filter pills — All, then the options — each with how many it would show; the chosen one is pressed. Wraps rather than scrolls. Purely presentational. */
export function FilterPills({ label, value, options, counts, onChange }: FilterPillsProps) {
  const all: Option = { value: ALL, label: 'All' }
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="me-1 w-12 flex-none font-body text-[11px] font-semibold tracking-wider text-ink-500 uppercase" aria-hidden="true">
        {label}
      </span>
      {[all, ...options].map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-body text-label font-semibold whitespace-nowrap',
              selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
            )}
          >
            {option.label}
            <span className={cn('text-[11px]', selected ? 'text-white/85' : 'text-ink-500')}>{counts[option.value] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
