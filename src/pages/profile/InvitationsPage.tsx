import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { InvitationsLoadState } from '@/features/profile/InvitationsLoadState'
import { InvitationsPanel } from '@/features/profile/InvitationsPanel'
import { useLogout } from '@/features/auth/useLogout'
import {
  acceptVolunteerInvitation,
  declineVolunteerInvitation,
  getVolunteerInvitations,
  INVITATIONS_QUERY_KEY,
  type VolunteerInvitation,
} from '@/api/identity'
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
 * Container for /app/profile/invitations — owns the `GET /volunteer-invitations` query and both
 * mutations; InvitationsPanel/InvitationCard/InvitationsLoadState are pure presentation. The
 * query key is shared with ProfileLayout's sidebar badge, so accepting/declining here updates the
 * count there with no extra wiring.
 *
 * Decline is simple: the server marks it declined and touches nothing else, so the page just
 * refetches (the mutation stays pending until the refetch lands, so the card disappears under the
 * spinner rather than flashing back). Accept is the consequential one: the server promotes the
 * account to `ngo_volunteer` and revokes its sessions, but this tab's access token still carries
 * the old `user` role — so success signs out immediately (`useLogout`: real `POST /auth/logout`,
 * clear auth, redirect to `/login`) with a message carried in the auth store's `pendingMessage`
 * (see that field's comment for why not router state). Logging in again lands in the NGO console.
 *
 * On any failure (404 not found / 409 not pending / 409 NGO no longer active) the server's own
 * message is shown and the list is refetched, since the likeliest cause is that the invitation
 * changed since this page loaded.
 */
export function InvitationsPage() {
  const queryClient = useQueryClient()
  const { logout } = useLogout()
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useQuery({ queryKey: INVITATIONS_QUERY_KEY, queryFn: getVolunteerInvitations })

  const refetchList = () => queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY })

  const acceptMutation = useMutation({
    mutationFn: (invitation: VolunteerInvitation) => acceptVolunteerInvitation(invitation.id),
    onSuccess: (_data, invitation) => {
      setActionError(null)
      useAuthStore
        .getState()
        .setPendingMessage(`You're now a volunteer with ${invitation.ngo_name}. Log in again to continue in the NGO console.`)
      logout()
    },
    onError: (error) => {
      setActionError(extractErrorMessage(error))
      void refetchList()
    },
  })

  const declineMutation = useMutation({
    mutationFn: (invitation: VolunteerInvitation) => declineVolunteerInvitation(invitation.id),
    onSuccess: async () => {
      setActionError(null)
      await refetchList()
    },
    onError: (error) => {
      setActionError(extractErrorMessage(error))
      void refetchList()
    },
  })

  if (query.isPending) return <InvitationsLoadState error={null} onRetry={() => void query.refetch()} />
  if (query.isError) {
    return <InvitationsLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  // A successful accept stays "pending" until the sign-out navigation unmounts this page, so the
  // buttons can't be clicked again in that gap.
  const pending =
    acceptMutation.variables && (acceptMutation.isPending || acceptMutation.isSuccess)
      ? { id: acceptMutation.variables.id, action: 'accept' as const }
      : declineMutation.variables && declineMutation.isPending
        ? { id: declineMutation.variables.id, action: 'decline' as const }
        : null

  return (
    <InvitationsPanel
      invitations={query.data}
      onAccept={(invitation) => acceptMutation.mutate(invitation)}
      onDecline={(invitation) => declineMutation.mutate(invitation)}
      pending={pending}
      actionError={actionError}
    />
  )
}
