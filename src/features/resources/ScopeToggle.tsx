import { cn } from '@/lib/utils'

export type LocalScope = 'home' | 'all'

export interface ScopeToggleProps {
  scope: LocalScope
  /** The citizen's home region, by name — the first option. */
  homeName: string
  onChange: (scope: LocalScope) => void
}

/** Two choices: places in the citizen's home region, or everywhere the app has regions for. Purely presentational. */
export function ScopeToggle({ scope, homeName, onChange }: ScopeToggleProps) {
  const options: Array<{ id: LocalScope; label: string }> = [
    { id: 'home', label: homeName },
    { id: 'all', label: 'Everywhere' },
  ]
  return (
    <div role="group" aria-label="Where to look" className="inline-flex max-w-full rounded-full bg-surface-sunken p-0.75">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={scope === option.id}
          onClick={() => onChange(option.id)}
          className={cn('min-w-0 truncate rounded-full px-3.5 py-1.5 font-body text-body-sm font-semibold transition-colors', scope === option.id ? 'bg-surface-raised text-primary-700 shadow-sm' : 'text-ink-700 hover:text-ink-900')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
