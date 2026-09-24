import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AccountProfileCard } from '@/features/account/AccountProfileCard'
import { ChangePasswordCard } from '@/features/account/ChangePasswordCard'
import { ROLE_LABEL } from '@/features/account/roleLabels'
import { changePasswordSchema, type ChangePasswordFormValues } from '@/features/account/schemas'
import { useEndSession } from '@/features/auth/useEndSession'
import { AccountSettingsPanel } from '@/features/profile/AccountSettingsPanel'
import { DeactivateAccountDialog } from '@/features/profile/DeactivateAccountDialog'
import { DeleteAccountDialog } from '@/features/profile/DeleteAccountDialog'
import { useAccountLifecycle } from '@/features/profile/useAccountLifecycle'
import { useEditProfile } from '@/features/profile/useEditProfile'
import { changePassword, getMyNgo, NGO_ME_QUERY_KEY } from '@/api/identity'
import { extractErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/store/auth'

/**
 * Container for `/ngo/settings/account` and `/admin/settings/account` — one screen for both NGO
 * staff (`ngo_admin`, `ngo_volunteer`) and platform admins (`admin`, `super_admin`), mounted under
 * their own layouts; WEB_DESIGN_PLAN.md §6.3/§6.4: "same shape as Citizen's Edit Profile/Account
 * Settings, scoped to the staff member's own account." Three sections, each with its own state:
 *
 * - **Profile** — the name, via `useEditProfile` (the same hook the citizen Edit Profile uses); the
 *   email and role come from the session, and NGO staff also get their organisation's name from
 *   `GET /ngo/me` (under the shared `NGO_ME_QUERY_KEY`; a failure there just omits the chip).
 * - **Password** — `PATCH /auth/password`. Success revokes every session server-side, so per the
 *   API doc it's an immediate forced sign-out (`useEndSession`), not a "saved" toast.
 * - **Account** — deactivate/delete, via `useAccountLifecycle` (the same hook the citizen Account
 *   Settings uses). The backend puts no role restriction on either, so they're offered to every
 *   role; the copy for staff says they lose their console access too.
 *
 * Not built: the mockup's job title, mobile number, language picker, notification toggles, 2FA,
 * recovery codes, active-sessions list and "Leave organisation" — none has a route or field.
 */
export function MyAccountPage() {
  const user = useAuthStore((s) => s.user)
  const endSession = useEndSession()
  const profile = useEditProfile()
  const lifecycle = useAccountLifecycle()
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const isNgoStaff = user?.role === 'ngo_admin' || user?.role === 'ngo_volunteer'
  const ngoQuery = useQuery({ queryKey: NGO_ME_QUERY_KEY, queryFn: getMyNgo, enabled: isNgoStaff })

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) })

  const passwordMutation = useMutation({
    mutationFn: (values: ChangePasswordFormValues) => changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => endSession('Your password was changed. Log in with your new password.'),
    onError: (error) => setPasswordError(extractErrorMessage(error)),
  })

  const roleLabel = user ? ROLE_LABEL[user.role] : ''

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">My Account</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">Your own sign-in and profile.</p>
      </div>

      <AccountProfileCard
        email={user?.email ?? ''}
        roleLabel={roleLabel}
        organizationName={ngoQuery.data?.name}
        name={profile.name}
        register={profile.register}
        errors={profile.errors}
        onSubmit={profile.onSubmit}
        isSubmitting={profile.isSubmitting}
        isDirty={profile.isDirty}
        serverError={profile.serverError}
        showSaved={profile.showSaved}
        isLoaded={profile.isLoaded}
        loadError={profile.loadError}
        onRetry={profile.retry}
      />

      <ChangePasswordCard
        register={registerPassword}
        errors={passwordErrors}
        onSubmit={handlePasswordSubmit((values) => {
          setPasswordError(null)
          passwordMutation.mutate(values)
        })}
        isSubmitting={isPasswordSubmitting || passwordMutation.isPending}
        serverError={passwordError}
      />

      <AccountSettingsPanel
        {...lifecycle.panelProps}
        title="Account"
        titleAs="h2"
        description="Deactivate or delete your own account."
        deleteDescription="Permanent. You lose your staff access along with the account — this can't be undone."
        className="max-w-none p-6 shadow-sm md:p-6"
      />
      <DeactivateAccountDialog {...lifecycle.deactivateDialogProps} />
      <DeleteAccountDialog
        {...lifecycle.deleteDialogProps}
        description="This is permanent. Your account and your staff access are gone for good — there is no way to undo this, not even by an admin. Enter your password to confirm."
      />
    </div>
  )
}
