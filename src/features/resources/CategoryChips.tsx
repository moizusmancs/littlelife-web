import { cn } from '@/lib/utils'
import { LOCAL_CATEGORIES, type LocalCategory } from './localResources'

export interface CategoryChipsProps {
  category: LocalCategory
  counts: Record<LocalCategory, number>
  onChange: (category: LocalCategory) => void
}

/** One-of-many filter chips, each with how many places it holds (`aria-pressed` marks the chosen one). Purely presentational. */
export function CategoryChips({ category, counts, onChange }: CategoryChipsProps) {
  return (
    <div role="group" aria-label="Kind of place" className="flex flex-wrap gap-1.5">
      {LOCAL_CATEGORIES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={category === id}
          onClick={() => onChange(id)}
          className={cn(
            'flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 font-body text-body-sm font-semibold whitespace-nowrap transition-colors',
            category === id ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
          )}
        >
          {label}
          <span className={cn('font-medium', category === id ? 'text-white/80' : 'text-ink-500')}>{counts[id]}</span>
        </button>
      ))}
    </div>
  )
}
