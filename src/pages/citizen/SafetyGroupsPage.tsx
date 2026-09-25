import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { SafetyConnection } from '@/api/trust'
import { extractErrorMessage } from '@/api/errors'
import { ActionBanner } from '@/features/safetyGroups/ActionBanner'
import { InviteMemberDialog } from '@/features/safetyGroups/InviteMemberDialog'
import { RemoveConnectionDialog } from '@/features/safetyGroups/RemoveConnectionDialog'
import { SafetyGroupsLoadState } from '@/features/safetyGroups/SafetyGroupsLoadState'
import { SafetyGroupsPanel } from '@/features/safetyGroups/SafetyGroupsPanel'
import { groupConnections, otherParty, removeTargetOf } from '@/features/safetyGroups/connections'
import { actionNotice, requestSentNotice } from '@/features/safetyGroups/notices'
import { useConnectionActions } from '@/features/safetyGroups/useConnectionActions'
import { useInviteMember } from '@/features/safetyGroups/useInviteMember'
import { useLiveLocation, useNow, useWatchLiveLocation } from '@/features/liveLocation/liveLocationContext'
import { isLive } from '@/features/liveLocation/liveLocationModel'
import { shareStatus } from '@/features/liveLocation/shareStatus'
import { ShareLocationCard } from '@/features/liveLocation/ShareLocationCard'
import { useSafetyConnections } from '@/features/safetyGroups/useSafetyConnections'
import { useAuthStore } from '@/store/auth'

/**
 * Container for /app/safety-groups — owns the `GET /safety-connections` query, the invite form and
 * every accept / decline / remove; SafetyGroupsPanel and its parts are pure presentation. The backend
 * has no group entity, so this is the account's circle of pairwise connections, worked out from the list
 * against the signed-in account's own id; people are shown by the name and email the server allows.
 *
 * A message from the detail screen (it navigates here after removing a connection, since that screen
 * has nothing left to show) arrives as router state and is shown once. Removal errors are shown in the
 * confirm dialog while it's open, and in the page banner otherwise (accept / decline).
 */
export function SafetyGroupsPage() {
  const me = useAuthStore((s) => s.user?.id) ?? ''
  const email = useAuthStore((s) => s.user?.email)
  const location = useLocation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(() => (location.state as { notice?: string } | null)?.notice ?? null)
  const [removeTarget, setRemoveTarget] = useState<SafetyConnection | null>(null)

  // The arrival message is shown once — clear it from the history entry so a reload doesn't repeat it.
  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) navigate('.', { replace: true, state: null })
  }, [location.state, navigate])

  const query = useSafetyConnections(me)

  const actions = useConnectionActions({
    onDone: (action, connection) => {
      setRemoveTarget(null)
      setNotice(actionNotice(action, connection, me))
    },
  })

  const invite = useInviteMember({ me, onSent: (sentTo) => setNotice(requestSentNotice(sentTo)) })

  // Live location: listen for members' positions while this screen shows anyone connected, and offer the switch that shares yours.
  const live = useLiveLocation()
  const now = useNow()
  const connected = groupConnections(query.data ?? [], me).connected
  useWatchLiveLocation(connected.length > 0)
  const liveIds = new Set(
    connected.map((c) => otherParty(c, me).accountId).filter((id) => live.positions[id] && isLive(live.positions[id], now)),
  )

  if (query.isPending) return <SafetyGroupsLoadState error={null} onRetry={() => void query.refetch()} />
  if (query.isError) return <SafetyGroupsLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />

  return (
    <>
      <SafetyGroupsPanel
        connections={query.data}
        me={me}
        email={email}
        onInvite={invite.openDialog}
        liveIds={liveIds}
        shareCard={
          connected.length > 0 || live.sharing ? (
            <ShareLocationCard
              status={shareStatus(live)}
              on={live.sharing}
              connectedCount={connected.length}
              onChange={(on) => (on ? live.startSharing() : live.stopSharing())}
              onRetry={live.retry}
            />
          ) : undefined
        }
        banner={<ActionBanner notice={notice} onDismissNotice={() => setNotice(null)} error={removeTarget ? null : actions.error} />}
        pending={actions.pending}
        onAccept={(connection) => {
          setNotice(null)
          actions.accept(connection)
        }}
        onDecline={(connection) => {
          setNotice(null)
          actions.decline(connection)
        }}
        onRemove={(connection) => {
          actions.clearError()
          setRemoveTarget(connection)
        }}
      />

      <InviteMemberDialog
        open={invite.open}
        onOpenChange={invite.setOpen}
        method={invite.method}
        onMethodChange={invite.setMethod}
        register={invite.register}
        errors={invite.errors}
        onSubmit={invite.onSubmit}
        isSubmitting={invite.isSubmitting}
        serverError={invite.serverError}
      />

      <RemoveConnectionDialog
        target={removeTarget && removeTargetOf(removeTarget, me)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && actions.remove(removeTarget)}
        isSubmitting={actions.pending?.action === 'remove'}
        serverError={actions.error}
      />
    </>
  )
}
