import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { MyNgoForm } from '@/features/profile/MyNgoForm'
import { MyNgoLoadState } from '@/features/profile/MyNgoLoadState'
import { MyNgoStatusCard } from '@/features/profile/MyNgoStatusCard'
import { registerNgoSchema, type RegisterNgoFormValues } from '@/features/profile/schemas'
import { useLogout } from '@/features/auth/useLogout'
import { getMyNgoRegistration, MY_NGO_QUERY_KEY, registerNgo } from '@/api/identity'
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
 * Container for /app/profile/ngo — owns the `GET /ngos/mine` query, the register form/mutation,
 * and the log-in-again action; MyNgoStatusCard/MyNgoForm/MyNgoLoadState are pure presentation.
 *
 * What's on screen is decided by the server's answer, not by anything remembered client-side, so
 * it survives a reload and reflects an admin's approve/reject the next time it refetches:
 *  - `404` (resolved to `null` by `getMyNgoRegistration`) → never submitted → the register form.
 *  - `pending_approval` → status card only (a second submit would `409`, so no form).
 *  - `rejected` → status card *and* the form again (a rejected row doesn't block a resubmit).
 *  - `active` → status card with "Log in again": approval promotes the account to `ngo_admin` and
 *    revokes its refresh tokens, but this session's access token still carries the old role.
 *
 * A successful submit invalidates the query and waits for the refetch (returning the promise from
 * `onSuccess` keeps the mutation pending until it lands), so the card that replaces the form is
 * the server's real row rather than something reconstructed from the thin `201` body.
 */
export function MyNgoPage() {
  const queryClient = useQueryClient()
  const { logout, isLoggingOut } = useLogout()
  const [serverError, setServerError] = useState<string | null>(null)

  const query = useQuery({ queryKey: MY_NGO_QUERY_KEY, queryFn: getMyNgoRegistration })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterNgoFormValues>({
    resolver: zodResolver(registerNgoSchema),
    defaultValues: { name: '', contactEmail: '', contactPhone: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: RegisterNgoFormValues) =>
      registerNgo(values.name, values.contactEmail, values.contactPhone),
    onSuccess: async () => {
      setServerError(null)
      reset()
      await queryClient.invalidateQueries({ queryKey: MY_NGO_QUERY_KEY })
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  const handleLogInAgain = () => {
    useAuthStore.getState().setPendingMessage('Your NGO was approved. Log in again to continue as its admin.')
    logout()
  }

  if (query.isPending) return <MyNgoLoadState error={null} onRetry={() => void query.refetch()} />
  if (query.isError) {
    return <MyNgoLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  const registration = query.data
  const canSubmit = registration === null || registration.status === 'rejected'

  return (
    <div className="flex flex-col gap-6">
      {registration && (
        <MyNgoStatusCard
          name={registration.name}
          status={registration.status}
          onLogInAgain={handleLogInAgain}
          isLoggingOut={isLoggingOut}
        />
      )}
      {canSubmit && (
        <MyNgoForm
          register={register}
          errors={errors}
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          isSubmitting={isSubmitting || mutation.isPending}
          serverError={serverError}
          title={registration ? 'Submit a new registration' : 'My NGO'}
          description={
            registration
              ? 'Update the details and try again.'
              : 'Register your organisation to help coordinate relief work through LittleLife.'
          }
          titleAs={registration ? 'h2' : 'h1'}
        />
      )}
    </div>
  )
}
