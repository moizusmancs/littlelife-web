import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { extractErrorMessage } from '@/api/errors'
import { ActionBanner } from '@/features/safetyGroups/ActionBanner'
import { RemoveConnectionDialog } from '@/features/safetyGroups/RemoveConnectionDialog'
import { SafetyGroupDetail } from '@/features/safetyGroups/SafetyGroupDetail'
import { SafetyGroupNotFound } from '@/features/safetyGroups/SafetyGroupNotFound'
import { SafetyGroupsLoadState } from '@/features/safetyGroups/SafetyGroupsLoadState'
import { removeTargetOf } from '@/features/safetyGroups/connections'
import { actionNotice } from '@/features/safetyGroups/notices'
import { useConnectionActions } from '@/features/safetyGroups/useConnectionActions'
import { useSafetyConnections } from '@/features/safetyGroups/useSafetyConnections'
import { useAuthStore } from '@/store/auth'

/**
 * Container for /app/safety-groups/:id. There is no `GET /safety-connections/{id}`, so the connection is
 * looked up in the same list query the list screen uses (one cache entry, so accepting here updates the
 * list and the sidebar count with no extra wiring); an id that isn't in it is the "not in your list"
 * state. Accept and decline stay on this screen and show a notice; removing hands off to the list with
 * the notice as router state, since the connection is gone.
 */
export function SafetyGroupDetailPage() {
  const { id } = useParams()
  const me = useAuthStore((s) => s.user?.id) ?? ''
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const query = useSafetyConnections(me)
  const connection = query.data?.find((c) => c.id === id)

  const actions = useConnectionActions({
    onDone: (action, done) => {
      const message = actionNotice(action, done, me)
      if (action === 'remove') {
        navigate('/app/safety-groups', { state: { notice: message } })
        return
      }
      setNotice(message)
    },
  })

  if (query.isPending) return <SafetyGroupsLoadState error={null} onRetry={() => void query.refetch()} />
  if (query.isError) {
    return <SafetyGroupsLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} title="Safety Group" />
  }
  if (!connection) return <SafetyGroupNotFound />


  return (
    <>
      <SafetyGroupDetail
        connection={connection}
        me={me}
        banner={<ActionBanner notice={notice} onDismissNotice={() => setNotice(null)} error={confirmingRemove ? null : actions.error} />}
        busy={actions.pending?.id === connection.id ? actions.pending.action : null}
        onAccept={() => {
          setNotice(null)
          actions.accept(connection)
        }}
        onDecline={() => {
          setNotice(null)
          actions.decline(connection)
        }}
        onRemove={() => {
          actions.clearError()
          setConfirmingRemove(true)
        }}
      />

      <RemoveConnectionDialog
        target={confirmingRemove ? removeTargetOf(connection, me) : null}
        onClose={() => setConfirmingRemove(false)}
        onConfirm={() => actions.remove(connection)}
        isSubmitting={actions.pending?.action === 'remove'}
        serverError={actions.error}
      />
    </>
  )
}
