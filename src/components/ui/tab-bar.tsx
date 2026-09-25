import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface TabBarProps<T extends string> {
  tabs: ReadonlyArray<{ id: T; label: string }>
  active: T
  onChange: (tab: T) => void
  /** Names the tablist for a screen reader ("Resources", "Facility kinds"). */
  label: string
  /** Each tab gets the id `${idPrefix}-${tab.id}`, for the panel to name itself by. */
  idPrefix: string
  /** The id of the one panel the tabs control. */
  panelId: string
}

/**
 * A row of tabs over one panel, as a proper tablist: one tab is in the tab order, the arrow keys, Home and End move between them, and
 * each tab names the panel it controls. Scrolls sideways on a narrow phone rather than wrapping. Purely presentational — the page keeps
 * the chosen tab (in the URL, where it should survive a reload).
 */
export function TabBar<T extends string>({ tabs, active, onChange, label, idPrefix, panelId }: TabBarProps<T>) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Moves from the tab that has focus, not from `active`: the page chooses the tab through the URL, which lags the keypress, so a second arrow pressed before
    // it has caught up (a held key) would otherwise be measured from the tab the first one left.
    const focused = tabs.findIndex((tab) => refs.current[tab.id] === document.activeElement)
    const index = focused >= 0 ? focused : tabs.findIndex((tab) => tab.id === active)
    const target =
      event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (target === null) return
    event.preventDefault()
    const next = tabs[target].id
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-surface-border">
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${tab.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px flex-none border-b-2 px-4 py-3 font-body text-label font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500',
              selected ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-900',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
