import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  acceptSafetyConnection,
  declineSafetyConnection,
  removeSafetyConnection,
  SAFETY_CONNECTIONS_QUERY_KEY,
  type SafetyConnection,
} from '@/api/trust'
import { extractErrorMessage } from '@/api/errors'

export type ConnectionAction = 'accept' | 'decline' | 'remove'

export interface UseConnectionActionsOptions {
  /** Called once the server has done it (and the list has been refetched), with the connection as it was when acted on. */
  onDone?: (action: ConnectionAction, connection: SafetyConnection) => void
}

/**
 * Accept / decline / remove on one connection, shared by the list and the detail screen. One action
 * runs at a time: `pending` says which (`id` + `action`) so the matching button shows its spinner and
 * every other button is disabled. On any failure the server's own message is kept in `error` and the
 * list is refetched, since the likeliest cause is that the connection changed (the other person
 * removed it, or answered it) since the page loaded. Success also waits for the refetch, so a row
 * doesn't flash back into its old section.
 */
export function useConnectionActions({ onDone }: UseConnectionActionsOptions = {}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const refetch = () => queryClient.invalidateQueries({ queryKey: SAFETY_CONNECTIONS_QUERY_KEY })

  // What every one of the three does once the server has answered.
  const settle = (action: ConnectionAction) => ({
    onSuccess: async (_result: unknown, connection: SafetyConnection) => {
      setError(null)
      await refetch()
      onDone?.(action, connection)
    },
    onError: (e: unknown) => {
      setError(extractErrorMessage(e))
      void refetch()
    },
  })

  const accept = useMutation({ mutationFn: (c: SafetyConnection) => acceptSafetyConnection(c.id), ...settle('accept') })
  const decline = useMutation({ mutationFn: (c: SafetyConnection) => declineSafetyConnection(c.id), ...settle('decline') })
  const remove = useMutation({ mutationFn: (c: SafetyConnection) => removeSafetyConnection(c.id), ...settle('remove') })

  const inFlight = (
    [
      ['accept', accept],
      ['decline', decline],
      ['remove', remove],
    ] as const
  ).find(([, m]) => m.isPending)
  const pending = inFlight ? { id: inFlight[1].variables!.id, action: inFlight[0] } : null

  return {
    accept: (connection: SafetyConnection) => accept.mutate(connection),
    decline: (connection: SafetyConnection) => decline.mutate(connection),
    remove: (connection: SafetyConnection) => remove.mutate(connection),
    pending,
    error,
    clearError: () => setError(null),
  }
}
