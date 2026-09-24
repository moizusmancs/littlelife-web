import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { RESOURCE_TABS, type ResourcesTab } from './localResources'

export interface ResourceTabsProps {
  active: ResourcesTab
  onChange: (tab: ResourcesTab) => void
}

/**
 * The hub's tabs (Local resources, Aid requests, Campaigns, Missing persons). A proper tablist: one tab is in the tab order, the arrow
 * keys, Home and End move between them, and each tab names the panel it controls. Scrolls sideways on a narrow phone rather than
 * wrapping. Purely presentational — the page keeps the chosen tab in the URL.
 */
export function ResourceTabs({ active, onChange }: ResourceTabsProps) {
  const refs = useRef<Partial<Record<ResourcesTab, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = RESOURCE_TABS.findIndex((tab) => tab.id === active)
    const target =
      event.key === 'ArrowRight' ? (index + 1) % RESOURCE_TABS.length : event.key === 'ArrowLeft' ? (index - 1 + RESOURCE_TABS.length) % RESOURCE_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? RESOURCE_TABS.length - 1 : null
    if (target === null) return
    event.preventDefault()
    const next = RESOURCE_TABS[target].id
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label="Resources" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-surface-border">
      {RESOURCE_TABS.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node
            }}
            type="button"
            role="tab"
            id={`resources-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="resources-panel"
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
