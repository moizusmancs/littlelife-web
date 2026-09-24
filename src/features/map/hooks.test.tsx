import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { coarsen } from './useMapData'
import { useGeolocation } from './useGeolocation'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds the old value until the new one has stopped changing', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'a' } })
    rerender({ value: 'b' })
    rerender({ value: 'c' })
    expect(result.current).toBe('a')
    act(() => void vi.advanceTimersByTime(299))
    expect(result.current).toBe('a')
    act(() => void vi.advanceTimersByTime(2))
    expect(result.current).toBe('c')
  })
})

describe('useMediaQuery', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  it('reads a query as false where matchMedia does not exist', () => {
    // @ts-expect-error — simulating an environment without it
    window.matchMedia = undefined
    expect(renderHook(() => useMediaQuery('(min-width: 768px)')).result.current).toBe(false)
  })

  it('reads the current match and updates when it changes', () => {
    let matches = false
    const listeners = new Set<() => void>()
    window.matchMedia = ((query: string) => ({
      get matches() {
        return matches
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    })) as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
    act(() => {
      matches = true
      listeners.forEach((fn) => fn())
    })
    expect(result.current).toBe(true)
  })
})

describe('coarsen', () => {
  it('rounds to three decimals (about 110 m), which is less precise than the GPS fix that is sent', () => {
    expect(coarsen(24.860712)).toBe(24.861)
    expect(coarsen(67.0011)).toBe(67.001)
    expect(coarsen(-24.8607)).toBe(-24.861)
  })
})

describe('useGeolocation', () => {
  const original = navigator.geolocation
  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true })
  })

  const stub = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) =>
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn(impl) }, configurable: true })

  it('asks for nothing until told to', () => {
    stub(() => undefined)
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.status).toBe('idle')
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('reports the position as [lat, lng] and hands it to onFix', () => {
    stub((ok) => ok({ coords: { latitude: 24.86, longitude: 67.0 } } as GeolocationPosition))
    const onFix = vi.fn()
    const { result } = renderHook(() => useGeolocation(onFix))
    act(() => result.current.locate())
    expect(result.current).toMatchObject({ status: 'ready', position: [24.86, 67] })
    expect(onFix).toHaveBeenCalledWith([24.86, 67])
  })

  it('tells a blocked permission from a failed fix', () => {
    stub((_, fail) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    const denied = renderHook(() => useGeolocation())
    act(() => denied.result.current.locate())
    expect(denied.result.current.status).toBe('denied')

    stub((_, fail) => fail({ code: 3, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    const timedOut = renderHook(() => useGeolocation())
    act(() => timedOut.result.current.locate())
    expect(timedOut.result.current.status).toBe('unavailable')
  })

  it('says unsupported when the browser has no geolocation', () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.locate())
    expect(result.current.status).toBe('unsupported')
  })

  it('keeps the last known position when a later attempt fails', () => {
    let attempt = 0
    stub((ok, fail) => (attempt++ === 0 ? ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition) : fail({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError)))
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.locate())
    act(() => result.current.locate())
    expect(result.current).toMatchObject({ status: 'unavailable', position: [1, 2] })
  })
})
