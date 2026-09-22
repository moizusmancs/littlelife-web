import * as React from 'react'
import { cn } from '@/lib/utils'

export interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  hasError?: boolean
  disabled?: boolean
  /** Fires once `value` reaches `length` digits — the natural point to auto-submit, matching
   *  the mockup's "Verify" button staying disabled until then rather than requiring an extra
   *  click once the last digit lands. */
  onComplete?: (value: string) => void
  'aria-describedby'?: string
}

/**
 * Six individual boxes (Batch 3 Citizen §3b), not one text field split visually — matches the
 * mockup exactly and is the accessible pattern real OTP UIs use (each box is independently
 * focusable/readable). Focus-moves-as-you-type and backspace-to-previous are the control's own
 * UI interaction behavior (like the password show/hide toggle), not business state — the
 * *value* itself is still fully controlled by the parent via `value`/`onChange`.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  hasError = false,
  disabled = false,
  onComplete,
  'aria-describedby': ariaDescribedBy,
}: OtpInputProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([])

  function setDigit(index: number, digit: string) {
    const chars = value.padEnd(length, ' ').split('')
    chars[index] = digit
    const next = chars.join('').replace(/ +$/, '')
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    setDigit(index, digit)
    if (index < length - 1) inputRefs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      if (value[index]) {
        setDigit(index, '')
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        setDigit(index - 1, '')
      }
      event.preventDefault()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    event.preventDefault()
    onChange(digits)
    if (digits.length === length) {
      onComplete?.(digits)
      inputRefs.current[length - 1]?.focus()
    } else {
      inputRefs.current[digits.length]?.focus()
    }
  }

  return (
    // Boxes are flex-1 with min-w-0 (not fixed 52px) and the row is capped at a max width, not
    // given one — at 52px × 6 + gaps the mockup's sizing needs ~362px, which doesn't fit inside
    // a narrow phone's card padding (e.g. 390px viewport leaves ~286px). Letting flexbox shrink
    // every box together keeps the code always fully visible instead of overflowing the card,
    // while still reaching the mockup's exact 52×60px at any width that has room for it.
    <div
      className="flex w-full min-w-0 max-w-90 gap-2 sm:gap-2.5"
      role="group"
      aria-label="6-digit verification code"
      aria-describedby={ariaDescribedBy}
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={value[index] ?? ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={hasError || undefined}
          className={cn(
            'aspect-13/15 h-auto min-w-0 flex-1 rounded-md border bg-surface-sunken text-center font-heading text-h2 font-bold text-ink-900 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-h1',
            hasError ? 'border-2 border-status-critical' : 'border-surface-border',
          )}
        />
      ))}
    </div>
  )
}
