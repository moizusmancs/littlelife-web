import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { AccountSettingsPanel } from '@/features/profile/AccountSettingsPanel'
import { DeactivateAccountDialog } from '@/features/profile/DeactivateAccountDialog'
import { DeleteAccountDialog } from '@/features/profile/DeleteAccountDialog'
import { deleteAccountSchema, type DeleteAccountFormValues } from '@/features/profile/schemas'
import { deactivateAccount, deleteAccount } from '@/api/identity'
import { useAuthStore } from '@/store/auth'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Container for /app/profile/account-settings — owns both mutations, both dialogs' open state,
 * and the delete form; AccountSettingsPanel/DeactivateAccountDialog/DeleteAccountDialog are pure
 * presentation. Both `POST /auth/me/deactivate` and `POST /auth/me/delete` already revoke every
 * session and clear the web cookie server-side (api/00-identity.md) — there's no session left
 * afterward for a separate `logout()` call to act on, so success just clears local auth state
 * directly and routes to `/login`, same cross-screen handoff pattern ResetPasswordPage uses
 * (`navigate('/login', {state: {infoMessage}})`, read once by LoginForm).
 */
export function AccountSettingsPage() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountFormValues>({ resolver: zodResolver(deleteAccountSchema) })

  const deactivateMutation = useMutation({
    mutationFn: deactivateAccount,
    onSuccess: () => {
      // Store-based, not `navigate(..., {state})` — this navigation is racing RequireRole's own
      // guard, which reacts to the same `clearAuth()` and fires its own *stateless* redirect to
      // /login; router state attached to whichever navigate loses that race is simply gone. See
      // `pendingMessage`'s own comment in store/auth.ts.
      useAuthStore
        .getState()
        .setPendingMessage('Your account has been deactivated. Log back in any time to reactivate it.')
      clearAuth()
      navigate('/login', { replace: true })
    },
    onError: (error) => setDeactivateError(extractErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (values: DeleteAccountFormValues) => deleteAccount(values.currentPassword),
    onSuccess: () => {
      useAuthStore.getState().setPendingMessage('Your account has been deleted.')
      clearAuth()
      navigate('/login', { replace: true })
    },
    onError: (error) => setDeleteError(extractErrorMessage(error)),
  })

  return (
    <>
      <AccountSettingsPanel
        onDeactivateClick={() => {
          setDeactivateError(null)
          setDeactivateOpen(true)
        }}
        onDeleteClick={() => {
          setDeleteError(null)
          reset()
          setDeleteOpen(true)
        }}
      />
      <DeactivateAccountDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        onConfirm={() => deactivateMutation.mutate()}
        isSubmitting={deactivateMutation.isPending}
        serverError={deactivateError}
      />
      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => deleteMutation.mutate(values))}
        isSubmitting={isSubmitting || deleteMutation.isPending}
        serverError={deleteError}
      />
    </>
  )
}
