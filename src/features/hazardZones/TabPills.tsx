import { cn } from '@/lib/utils'

export interface TabPillsProps<T extends string> {
  /** Names the group for a screen reader. */
  label: string
  value: T
  options: ReadonlyArray<{ id: T; label: string }>
  onChange: (value: T) => void
}

/** A small set of mutually exclusive pills (`aria-pressed` marks the chosen one) — the Active / Resolved and Zones / Predictions switches. Purely presentational. */
export function TabPills<T extends string>({ label, value, options, onChange }: TabPillsProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-surface-sunken p-0.75">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn('rounded-full px-3.5 py-1.5 font-body text-body-sm font-semibold whitespace-nowrap transition-colors', value === option.id ? 'bg-surface-raised text-primary-700 shadow-sm' : 'text-ink-700 hover:text-ink-900')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
