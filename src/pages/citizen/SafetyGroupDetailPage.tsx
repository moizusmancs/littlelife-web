import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { extractErrorMessage } from '@/api/errors'
import { ActionBanner } from '@/features/safetyGroups/ActionBanner'
import { RemoveConnectionDialog } from '@/features/safetyGroups/RemoveConnectionDialog'
import { SafetyGroupDetail } from '@/features/safetyGroups/SafetyGroupDetail'
import { SafetyGroupNotFound } from '@/features/safetyGroups/SafetyGroupNotFound'
import { SafetyGroupsLoadState } from '@/features/safetyGroups/SafetyGroupsLoadState'
import { groupConnections, otherParty, personLabel, removeTargetOf, standingOf } from '@/features/safetyGroups/connections'
import { actionNotice } from '@/features/safetyGroups/notices'
import { useConnectionActions } from '@/features/safetyGroups/useConnectionActions'
import { useSafetyConnections } from '@/features/safetyGroups/useSafetyConnections'
import { useLiveLocation, useNow, useWatchLiveLocation } from '@/features/liveLocation/liveLocationContext'
import { MemberLiveLocation } from '@/features/liveLocation/MemberLiveLocation'
import { shareStatus } from '@/features/liveLocation/shareStatus'
import { ShareLocationCard } from '@/features/liveLocation/ShareLocationCard'
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

  // A connected member's live location: listen for it while this page is on screen, and offer the switch that shares yours.
  const live = useLiveLocation()
  const now = useNow()
  const isConnected = connection ? standingOf(connection, me) === 'connected' : false
  useWatchLiveLocation(isConnected)

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
        liveLocation={
          isConnected ? (
            <MemberLiveLocation
              name={personLabel(connection, me)}
              position={live.positions[otherParty(connection, me).accountId]}
              now={now}
              channel={live.channel}
              blocked={live.blocked}
              onRetry={live.retry}
            />
          ) : undefined
        }
        shareCard={
          isConnected ? (
            <ShareLocationCard
              status={shareStatus(live)}
              on={live.sharing}
              connectedCount={groupConnections(query.data ?? [], me).connected.length}
              onChange={(on) => (on ? live.startSharing() : live.stopSharing())}
              onRetry={live.retry}
            />
          ) : undefined
        }
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
