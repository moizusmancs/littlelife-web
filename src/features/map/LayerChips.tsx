import { cn } from '@/lib/utils'
import { LAYERS, type LayerId, type LayerState } from './mapLayers'

export interface LayerChipsProps {
  layers: LayerState
  onToggle: (id: LayerId) => void
  className?: string
}

/** Multi-select layer toggles. Each chip is a toggle button (`aria-pressed`), pink when on and outlined when off, as in the mockup. */
export function LayerChips({ layers, onToggle, className }: LayerChipsProps) {
  return (
    <div role="group" aria-label="Map layers" className={cn('flex flex-wrap gap-1.5', className)}>
      {LAYERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={layers[id]}
          onClick={() => onToggle(id)}
          className={cn(
            'h-8 flex-none rounded-full border px-3 font-body text-body-sm font-semibold whitespace-nowrap transition-colors',
            layers[id] ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
