import * as React from 'react'
import { Eye, EyeSlash, LockKey } from '@phosphor-icons/react'
import { Input, type InputProps } from '@/components/ui/input'

/**
 * The show/hide toggle is ephemeral UI presentation state, not form data — the password value
 * itself stays fully controlled by the caller (react-hook-form's `register`, spread via
 * `...props`), so this local `useState` doesn't violate "state lives in the parent, not the
 * component": there is no business state here, only whether the glyphs are masked.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'leadingIcon' | 'trailingSlot'>>(
  (props, ref) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        leadingIcon={<LockKey size={18} />}
        trailingSlot={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="flex text-ink-500 hover:text-ink-700"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        }
        {...props}
      />
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
