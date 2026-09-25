import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ALERT_PREFERENCES_QUERY_KEY, getAlertPreferences, updateAlertPreferences, type AlertPreferences, type AlertPreferencesPatch } from '@/api/profiling'
import { extractErrorMessage } from '@/api/errors'
import type { SaveStatus } from './alertPreferences'

const SAVE_KEY = [...ALERT_PREFERENCES_QUERY_KEY, 'save'] as const

/**
 * The query and the auto-saving change behind Alert Preferences. A change is applied to the screen at once
 * (so a switch never waits on the network), sent as a partial patch of just that field, and the next change waits for
 * it (`scope`: one save at a time, in order, so two quick taps can't arrive backwards). When the server answers, its copy
 * replaces the cached one — unless another save is still queued, so a second tap never flickers back while the first lands.
 * A refused change reloads the truth from the server (putting the old value back) and keeps the server's message. `status`
 * says `saving` while any change is in flight and `saved` after the last one lands.
 */
export function useAlertPreferences() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const query = useQuery({ queryKey: ALERT_PREFERENCES_QUERY_KEY, queryFn: getAlertPreferences })

  const mutation = useMutation({
    mutationKey: SAVE_KEY,
    scope: { id: 'alert-preferences' },
    mutationFn: (patch: AlertPreferencesPatch) => updateAlertPreferences(patch),
    onMutate: async (patch) => {
      setError(null)
      setSaved(false)
      await queryClient.cancelQueries({ queryKey: ALERT_PREFERENCES_QUERY_KEY })
      queryClient.setQueryData<AlertPreferences>(ALERT_PREFERENCES_QUERY_KEY, (current) => (current ? { ...current, ...patch } : current))
    },
    onSuccess: (server) => {
      if (queryClient.isMutating({ mutationKey: SAVE_KEY }) <= 1) queryClient.setQueryData(ALERT_PREFERENCES_QUERY_KEY, server)
      setSaved(true)
    },
    onError: (e) => {
      setError(`We couldn't save that change. ${extractErrorMessage(e)}`)
      void queryClient.invalidateQueries({ queryKey: ALERT_PREFERENCES_QUERY_KEY })
    },
  })

  const status: SaveStatus = mutation.isPending ? 'saving' : saved ? 'saved' : 'idle'

  return {
    prefs: query.data,
    isLoading: query.isPending,
    loadError: query.isError ? extractErrorMessage(query.error) : null,
    retry: () => void query.refetch(),
    change: (patch: AlertPreferencesPatch) => mutation.mutate(patch),
    status,
    error,
    dismissError: () => setError(null),
  }
}
