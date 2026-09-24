import { AccountSettingsPanel } from '@/features/profile/AccountSettingsPanel'
import { DeactivateAccountDialog } from '@/features/profile/DeactivateAccountDialog'
import { DeleteAccountDialog } from '@/features/profile/DeleteAccountDialog'
import { useAccountLifecycle } from '@/features/profile/useAccountLifecycle'

/**
 * Container for /app/profile/account-settings — the two mutations, both dialogs' open state and
 * the delete form live in `useAccountLifecycle` (shared with the NGO/Admin My Account screen);
 * AccountSettingsPanel and the two dialogs are pure presentation. Both routes revoke every session
 * server-side, so success clears local auth and routes to `/login` — see the hook.
 */
export function AccountSettingsPage() {
  const lifecycle = useAccountLifecycle()

  return (
    <>
      <AccountSettingsPanel {...lifecycle.panelProps} />
      <DeactivateAccountDialog {...lifecycle.deactivateDialogProps} />
      <DeleteAccountDialog {...lifecycle.deleteDialogProps} />
    </>
  )
}
