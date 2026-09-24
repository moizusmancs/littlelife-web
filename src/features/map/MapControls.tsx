import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DomEvent } from 'leaflet'
import { useMap } from 'react-leaflet'
import { CrosshairIcon, MinusIcon, PlusIcon, QuestionIcon, SpinnerGapIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface MapControlsProps {
  /** Without it there is no "Go to my location" button (a screen with no use for the visitor's position). */
  onRecenter?: () => void
  locating?: boolean
  legend: ReactNode
}

const button =
  'flex size-11 items-center justify-center rounded-md bg-surface-raised text-ink-700 shadow-md hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500'

/**
 * The stack in the map's top-right corner (mockup §2f): legend, my location, zoom in, zoom out. They are React
 * buttons laid over the map — Leaflet's own zoom control is off — so they are real, labelled, focusable buttons,
 * and scroll and double-click on them are kept from reaching the map underneath. The legend opens to the left of its
 * button and closes with its X or Escape.
 */
export function MapControls({ onRecenter, locating = false, legend }: MapControlsProps) {
  const map = useMap()
  const container = useRef<HTMLDivElement>(null)
  const [legendOpen, setLegendOpen] = useState(false)

  // Keep the map from reacting to what happens on the controls: scrolling the legend must not zoom the map, and
  // double-clicking "+" must not also zoom it at the pointer. Leaflet's `disableClickPropagation` swallows mousedown too
  // (breaking the buttons under some input methods), and `DomEvent.on(el, 'dblclick')` installs a double-tap emulator
  // that swallows the second of two quick taps on "+" — so this uses a plain native listener for the double-click.
  useEffect(() => {
    const element = container.current
    if (!element) return
    DomEvent.disableScrollPropagation(element)
    const stop = (event: Event) => event.stopPropagation()
    element.addEventListener('dblclick', stop)
    return () => element.removeEventListener('dblclick', stop)
  }, [])

  return (
    <div
      ref={container}
      className="absolute top-3 right-3 z-1000 flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setLegendOpen(false)
      }}
    >
      <div className="relative">
        <button type="button" className={cn(button, legendOpen && 'bg-primary-50 text-primary-700')} aria-label="Map legend" aria-expanded={legendOpen} onClick={() => setLegendOpen((open) => !open)}>
          <QuestionIcon size={22} />
        </button>
        {legendOpen && (
          <div role="dialog" aria-label="Map legend" className="absolute top-0 right-13 w-72 max-w-[calc(100vw-6rem)] rounded-md border border-surface-border bg-surface-raised p-4 shadow-lg">
            <button type="button" className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken" aria-label="Close legend" onClick={() => setLegendOpen(false)}>
              <XIcon size={16} />
            </button>
            {legend}
          </div>
        )}
      </div>

      {onRecenter && (
        <button type="button" className={button} aria-label="Go to my location" onClick={onRecenter} disabled={locating}>
          {locating ? <SpinnerGapIcon size={22} className="animate-spin" /> : <CrosshairIcon size={22} />}
        </button>
      )}

      <div className="flex flex-col overflow-hidden rounded-md bg-surface-raised shadow-md">
        <button type="button" className="flex size-11 items-center justify-center text-ink-700 hover:bg-surface-sunken" aria-label="Zoom in" onClick={() => map.zoomIn()}>
          <PlusIcon size={18} weight="bold" />
        </button>
        <div className="mx-2.5 h-px bg-surface-border" aria-hidden="true" />
        <button type="button" className="flex size-11 items-center justify-center text-ink-700 hover:bg-surface-sunken" aria-label="Zoom out" onClick={() => map.zoomOut()}>
          <MinusIcon size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}
