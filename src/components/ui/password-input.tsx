import * as React from 'react'
import { EyeIcon, EyeSlashIcon, LockKeyIcon } from '@phosphor-icons/react'
import { Input, type InputProps } from '@/components/ui/input'

/**
 * The show/hide toggle is ephemeral UI presentation state, not form data — the password value
 * itself stays fully controlled by the caller (react-hook-form's `register`, spread via
 * `...props`), so this local `useState` doesn't violate "state lives in the parent, not the
 * component": there is no business state here, only whether the glyphs are masked.
 */
export interface PasswordInputProps extends Omit<InputProps, 'type' | 'leadingIcon' | 'trailingSlot'> {
  /** Login's mockup shows a leading lock icon on the password field; Register's doesn't
   *  (Batch 3 Citizen §3a) — default on, so existing call sites don't need to change. */
  showLockIcon?: boolean
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showLockIcon = true, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        leadingIcon={showLockIcon ? <LockKeyIcon size={18} /> : undefined}
        trailingSlot={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="flex text-ink-500 hover:text-ink-700"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        }
        {...props}
      />
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
