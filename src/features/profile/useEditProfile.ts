import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getProfile, updateProfile, PROFILE_QUERY_KEY } from '@/api/profiling'
import { extractErrorMessage } from '@/api/errors'
import { editProfileSchema, type EditProfileFormValues } from './schemas'

/**
 * The query + form + mutation behind editing the signed-in account's own name (`GET`/`PATCH
 * /profile`), shared by the citizen Edit Profile screen and the NGO/Admin My Account screen — same
 * data, same rules, different presentation. Lives in the *container* layer (each page calls it and
 * hands the pieces to its dumb components), so the "state in the parent" rule holds.
 *
 * Reads through `PROFILE_QUERY_KEY` (shared with the citizen sidebar) and writes the server's
 * response straight back into that cache entry on save. `values` (not `defaultValues`) hydrates
 * the form from the query, so a save — which changes the cached data — resets dirtiness, and
 * `showSaved` ("saved and untouched since") needs no timer.
 */
export function useEditProfile() {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const query = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile() })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { name: '' },
    values: query.data ? { name: query.data.name } : undefined,
  })

  const mutation = useMutation({
    mutationFn: (values: EditProfileFormValues) => updateProfile(values.name),
    onSuccess: (updated) => {
      setServerError(null)
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated)
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return {
    register,
    errors,
    isDirty,
    onSubmit: handleSubmit((values) => mutation.mutate(values)),
    isSubmitting: isSubmitting || mutation.isPending,
    serverError,
    /** The server's current name, `null` until the first load. */
    name: query.data?.name ?? null,
    isLoaded: !query.isPending,
    /** A real load failure (e.g. `404 "profile not found"` for an account with no profile row). */
    loadError: query.isError ? extractErrorMessage(query.error) : null,
    retry: () => void query.refetch(),
    showSaved: mutation.isSuccess && !isDirty,
  }
}
