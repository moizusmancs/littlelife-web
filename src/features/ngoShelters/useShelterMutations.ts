import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  MY_SHELTERS_QUERY_KEY,
  registerShelter,
  shelterQueryKey,
  updateShelter,
  updateShelterOccupancy,
  type RegisterShelterInput,
  type Shelter,
  type ShelterChanges,
} from '@/api/facilities'

/** The shelter has gone (or never was) — `404 "shelter not found"`. Someone else can't have taken it over: no route moves a shelter between organisations. */
export const isShelterGone = (error: unknown) => isAxiosError(error) && error.response?.status === 404

/**
 * The three writes an organisation can make to its shelters, and what each does to the caches that show them. Every response *is* the
 * updated shelter, so it is written straight into the list and into the shelter's own entry (the detail page and the citizen page share
 * that key) and the list is then refetched for the server's version — the screen never shows a shelter the server didn't return. The
 * citizen map's per-region shelter lists are marked stale too, so anyone opening it next sees the new headcount or status.
 *
 * Callers pass `onSuccess`/`onError` to `mutate` for what the *screen* does next (a notice, closing a drawer); this hook only owns the data.
 */
export function useShelterMutations() {
  const queryClient = useQueryClient()

  const refresh = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: MY_SHELTERS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['map', 'shelters'] })
    if (id) void queryClient.invalidateQueries({ queryKey: shelterQueryKey(id) })
  }

  const applyUpdated = (shelter: Shelter) => {
    queryClient.setQueryData<Shelter[]>(MY_SHELTERS_QUERY_KEY, (list) => list?.map((item) => (item.id === shelter.id ? shelter : item)))
    queryClient.setQueryData(shelterQueryKey(shelter.id), shelter)
    refresh(shelter.id)
  }

  const register = useMutation({
    mutationFn: (input: RegisterShelterInput) => registerShelter(input),
    onSuccess: (shelter) => {
      queryClient.setQueryData<Shelter[]>(MY_SHELTERS_QUERY_KEY, (list) => (list ? [...list.filter((item) => item.id !== shelter.id), shelter] : list))
      refresh(shelter.id)
    },
  })

  const occupancy = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) => updateShelterOccupancy(id, value),
    onSuccess: applyUpdated,
    // Most likely the shelter is gone, or someone else changed it — either way the list is what to look at now.
    onError: (_error, { id }) => refresh(id),
  })

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: ShelterChanges }) => updateShelter(id, changes),
    onSuccess: applyUpdated,
    onError: (_error, { id }) => refresh(id),
  })

  return { register, occupancy, update }
}
