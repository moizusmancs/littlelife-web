import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLiveLocation } from './liveLocationContext'
import { LiveLocationProvider } from './LiveLocationProvider'

function Probe() {
  const live = useLiveLocation()
  return <output data-testid="probe">{live.visible ? 'in front' : 'in the background'}</output>
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={['/app/x']}>
      <Routes>
        <Route element={<LiveLocationProvider />}>
          <Route path="/app/x" element={<Probe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const setVisibility = (state: 'visible' | 'hidden') => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('LiveLocationProvider', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the screen inside it, and starts idle and in front', () => {
    renderProvider()
    expect(screen.getByTestId('probe')).toHaveTextContent('in front')
  })

  it('tells the controller when the tab goes to the background and comes back — the whole of web live location rests on it', () => {
    renderProvider()

    act(() => setVisibility('hidden'))
    expect(screen.getByTestId('probe')).toHaveTextContent('in the background')

    act(() => setVisibility('visible'))
    expect(screen.getByTestId('probe')).toHaveTextContent('in front')
  })

  it('starts in the background if the page was opened in a background tab', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderProvider()
    expect(screen.getByTestId('probe')).toHaveTextContent('in the background')
  })

  it('stops listening for visibility changes when it goes away', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderProvider()
    unmount()
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
