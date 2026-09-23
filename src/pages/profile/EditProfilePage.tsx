import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { EditProfileForm } from '@/features/profile/EditProfileForm'
import { editProfileSchema, type EditProfileFormValues } from '@/features/profile/schemas'
import { getProfile, updateProfile, PROFILE_QUERY_KEY } from '@/api/profiling'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Container for /app/profile/edit — owns all query/form/mutation state, EditProfileForm is pure
 * presentation. Reads through the same `PROFILE_QUERY_KEY` cache entry ProfileLayout's sidebar
 * populates (TanStack Query dedupes the two subscriptions into one real fetch), and writes back
 * to that same cache entry on a successful save via `setQueryData` — so the sidebar's name
 * updates immediately, with no second round trip and no manual refetch.
 *
 * `values` (not `defaultValues`) syncs the form to the fetched/just-saved name and resets RHF's
 * `isDirty` flag every time that reference changes — including right after a successful submit,
 * once the mutation writes the fresh server response into the cache. That's what drives the
 * "Saved" indicator (`showSaved`): true once a save has succeeded and the user hasn't touched
 * the field since, false again the moment they start editing — no separate timer/flag needed.
 */
export function EditProfilePage() {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data, isPending } = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile() })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { name: '' },
    values: data ? { name: data.name } : undefined,
  })

  const mutation = useMutation({
    mutationFn: (values: EditProfileFormValues) => updateProfile(values.name),
    onSuccess: (updated) => {
      setServerError(null)
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated)
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return (
    <EditProfileForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      isSubmitting={isSubmitting || mutation.isPending}
      serverError={serverError}
      isLoaded={!isPending}
      showSaved={mutation.isSuccess && !isDirty}
    />
  )
}
