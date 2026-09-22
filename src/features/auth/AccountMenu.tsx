import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { SignOut } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface AccountMenuProps {
  /** The trigger element (an avatar circle, or an identity card — each layout supplies its
   *  own; Radix's `asChild` means this component owns zero opinions about what it looks like). */
  trigger: ReactNode
  email: string
  roleLabel: string
  onLogout: () => void
  isLoggingOut: boolean
  align?: 'start' | 'end'
}

/**
 * Purely presentational aside from Radix's own open/closed state, which is ephemeral UI
 * interaction state (not business data) and stays uncontrolled here — same precedent as the
 * password-visibility toggle. The actual logout side effect (API call, store clear,
 * navigation) is owned by the caller via `onLogout` (see useLogout.ts).
 */
export function AccountMenu({ trigger, email, roleLabel, onLogout, isLoggingOut, align = 'end' }: AccountMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={8}
          className="z-50 w-64 rounded-md border border-surface-border bg-surface-raised p-1.5 shadow-lg"
        >
          <div className="px-3 py-2.5">
            <p className="truncate font-body text-body-md font-semibold text-ink-900">{email}</p>
            <p className="mt-0.5 font-body text-body-sm text-ink-500">{roleLabel}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-surface-border" />
          <DropdownMenu.Item
            onSelect={onLogout}
            disabled={isLoggingOut}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2.5 font-body text-body-md text-status-critical outline-none select-none',
              'data-[highlighted]:bg-status-critical-tint',
              isLoggingOut && 'pointer-events-none opacity-60',
            )}
          >
            <SignOut size={18} />
            {isLoggingOut ? 'Logging out…' : 'Log Out'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
