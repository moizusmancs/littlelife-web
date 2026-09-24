import { useEffect, useState } from 'react'

/** `value`, but only after it has stopped changing for `delayMs` — for things like a map viewport that changes every frame while dragging. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
