import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RiskCheckResult } from '@/api/floodIntel'
import { LocationNote, LocationStatusNote, type LocationNoteProps } from './LocationNote'

const settled = (data?: RiskCheckResult): LocationNoteProps['risk'] => ({ isPending: false, isError: false, data })

function renderNote(overrides: Partial<LocationNoteProps> = {}) {
  const props: LocationNoteProps = { status: 'ready', risk: settled(), onShowZone: vi.fn(), ...overrides }
  render(<LocationNote {...props} />)
  return props
}

describe('LocationNote', () => {
  it('says nothing before anyone has asked for their location', () => {
    const { container } = render(<LocationNote status="idle" risk={settled()} onShowZone={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gives each way the browser can refuse its own plain sentence', () => {
    const { rerender } = render(<LocationNote status="locating" risk={settled()} onShowZone={vi.fn()} />)
    expect(screen.getByText('Finding your location…')).toBeInTheDocument()
    rerender(<LocationNote status="denied" risk={settled()} onShowZone={vi.fn()} />)
    expect(screen.getByText(/Location is blocked for this site/)).toBeInTheDocument()
    rerender(<LocationNote status="unavailable" risk={settled()} onShowZone={vi.fn()} />)
    expect(screen.getByText("Couldn't get your location. Try the location button again.")).toBeInTheDocument()
    rerender(<LocationNote status="unsupported" risk={settled()} onShowZone={vi.fn()} />)
    expect(screen.getByText("This browser can't share its location.")).toBeInTheDocument()
  })

  it('says it is checking while the server’s answer is pending, and when it failed', () => {
    const { rerender } = render(<LocationNote status="ready" risk={{ isPending: true, isError: false, data: undefined }} onShowZone={vi.fn()} />)
    expect(screen.getByText('Checking your surroundings…')).toBeInTheDocument()
    rerender(<LocationNote status="ready" risk={{ isPending: false, isError: true, data: undefined }} onShowZone={vi.fn()} />)
    expect(screen.getByText("Couldn't check hazards near you.")).toBeInTheDocument()
  })

  it('warns that you are inside a zone, at the risk level the server named, and can show it', async () => {
    const props = renderNote({ risk: settled({ inside_hazard_zone: true, hazard_zone_id: 'z1', risk_level: 'high', distance_meters: 0 }) })
    expect(screen.getByRole('status')).toHaveTextContent("You're inside a high-risk hazard zone.")
    await userEvent.click(screen.getByRole('button', { name: 'Show zone' }))
    expect(props.onShowZone).toHaveBeenCalledWith('z1')
  })

  it('reports the nearest zone’s distance and risk when you are outside every zone', async () => {
    const props = renderNote({ risk: settled({ inside_hazard_zone: false, hazard_zone_id: 'z2', risk_level: 'medium', distance_meters: 842.3 }) })
    expect(screen.getByRole('status')).toHaveTextContent('The nearest active hazard is 840 m away (medium risk).')
    await userEvent.click(screen.getByRole('button', { name: 'Show zone' }))
    expect(props.onShowZone).toHaveBeenCalledWith('z2')
  })

  it('says there are no hazards anywhere when the server has no zone to name — and offers nothing to show', () => {
    renderNote({ risk: settled({ inside_hazard_zone: false, distance_meters: 0 }) })
    expect(screen.getByText('No active hazards are reported anywhere right now.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('LocationStatusNote', () => {
  it('says nothing before a request or once there is a position', () => {
    for (const status of ['idle', 'ready'] as const) {
      const { container, unmount } = render(<LocationStatusNote status={status} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('has a plain sentence for each way the browser can decline, and lets a screen say what a block costs it', () => {
    const { rerender } = render(<LocationStatusNote status="locating" />)
    expect(screen.getByRole('status')).toHaveTextContent('Finding your location…')
    rerender(<LocationStatusNote status="unavailable" />)
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't get your location")
    rerender(<LocationStatusNote status="unsupported" />)
    expect(screen.getByRole('status')).toHaveTextContent("This browser can't share its location.")
    rerender(<LocationStatusNote status="denied" />)
    expect(screen.getByRole('status')).toHaveTextContent('whether a hazard is near')
    rerender(<LocationStatusNote status="denied" deniedText="Blocked — allow it to see the distance." />)
    expect(screen.getByRole('status')).toHaveTextContent('Blocked — allow it to see the distance.')
  })
})
