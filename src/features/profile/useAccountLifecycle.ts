import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { deactivateAccount, deleteAccount } from '@/api/identity'
import { extractErrorMessage } from '@/api/errors'
import { useEndSession } from '@/features/auth/useEndSession'
import { deleteAccountSchema, type DeleteAccountFormValues } from './schemas'

/**
 * Deactivate / delete the signed-in account — shared by the citizen Account Settings screen and
 * the NGO/Admin My Account screen (the routes and rules are identical for every role). Owns both
 * mutations, both dialogs' open state, and the delete form; the calling page spreads the returned
 * props into AccountSettingsPanel and the two dialogs.
 *
 * Both `POST /auth/me/deactivate` and `POST /auth/me/delete` already revoke every session and clear
 * the web cookie server-side (api/00-identity.md), so there's no session left for a separate
 * `logout()` — success ends the session locally (`useEndSession`: clear auth, go to `/login` with a
 * message).
 */
export function useAccountLifecycle() {
  const endSession = useEndSession()
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
    onSuccess: () => endSession('Your account has been deactivated. Log back in any time to reactivate it.'),
    onError: (error) => setDeactivateError(extractErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (values: DeleteAccountFormValues) => deleteAccount(values.currentPassword),
    onSuccess: () => endSession('Your account has been deleted.'),
    onError: (error) => setDeleteError(extractErrorMessage(error)),
  })

  return {
    panelProps: {
      onDeactivateClick: () => {
        setDeactivateError(null)
        setDeactivateOpen(true)
      },
      onDeleteClick: () => {
        setDeleteError(null)
        reset()
        setDeleteOpen(true)
      },
    },
    deactivateDialogProps: {
      open: deactivateOpen,
      onOpenChange: setDeactivateOpen,
      onConfirm: () => deactivateMutation.mutate(),
      isSubmitting: deactivateMutation.isPending,
      serverError: deactivateError,
    },
    deleteDialogProps: {
      open: deleteOpen,
      onOpenChange: setDeleteOpen,
      register,
      errors,
      onSubmit: handleSubmit((values) => deleteMutation.mutate(values)),
      isSubmitting: isSubmitting || deleteMutation.isPending,
      serverError: deleteError,
    },
  }
}
