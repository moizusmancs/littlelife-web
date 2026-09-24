import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { InviteVolunteerDialog } from '@/features/volunteers/InviteVolunteerDialog'
import { RemoveVolunteerDialog } from '@/features/volunteers/RemoveVolunteerDialog'
import { VolunteerRoster } from '@/features/volunteers/VolunteerRoster'
import { VolunteersEmptyState } from '@/features/volunteers/VolunteersEmptyState'
import { VolunteersLoadState } from '@/features/volunteers/VolunteersLoadState'
import { inviteVolunteerSchema, type InviteVolunteerFormValues } from '@/features/volunteers/schemas'
import {
  getMyNgo,
  getVolunteers,
  inviteVolunteer,
  NGO_ME_QUERY_KEY,
  removeVolunteer,
  VOLUNTEERS_QUERY_KEY,
  type Volunteer,
} from '@/api/identity'
import { extractErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/store/auth'

/**
 * Container for /ngo/volunteers — `ngo_admin` only. Both `GET /ngo/volunteers` and the invite /
 * remove routes are admin-only on the backend, so the route sits behind
 * `RequireRole allowed={['ngo_admin']}` and the sidebar hides the link from volunteers; the
 * mockup's "read-only view of their own task history" for volunteers has nothing behind it yet
 * (no task routes exist), so a volunteer simply doesn't get this screen.
 *
 * Owns the roster query, the organisation query (only to know whether inviting can work at all —
 * `POST /ngo/volunteers/invitations` is `409 "ngo is not active"` otherwise, so the button is
 * replaced by an explanation instead of offering a certain failure), and both mutations;
 * VolunteerRoster/InviteVolunteerDialog/RemoveVolunteerDialog/VolunteersLoadState/
 * VolunteersEmptyState are pure presentation.
 *
 * The backend has no route listing the invitations an organisation has *sent*, so a sent invitation
 * can only be acknowledged with a page-level notice; it isn't shown anywhere afterwards, and the
 * volunteer appears in the roster only once they accept. Removal refetches on success and on
 * failure — the likeliest failure is `403 "not a volunteer under your ngo"` because the roster
 * changed since it loaded.
 */
export function VolunteersPage() {
  const queryClient = useQueryClient()
  const ownEmail = useAuthStore((s) => s.user?.email)
  const [notice, setNotice] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Volunteer | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const rosterQuery = useQuery({ queryKey: VOLUNTEERS_QUERY_KEY, queryFn: getVolunteers })
  // Failure here is silent on purpose: it only decides whether to pre-empt a certain 409, and the
  // server still has the final say when the invite is sent.
  const ngoQuery = useQuery({ queryKey: NGO_ME_QUERY_KEY, queryFn: getMyNgo })
  const canInvite = !ngoQuery.data || ngoQuery.data.status === 'active'

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteVolunteerFormValues>({
    resolver: zodResolver(inviteVolunteerSchema),
    defaultValues: { email: '' },
  })

  const inviteMutation = useMutation({
    mutationFn: (values: InviteVolunteerFormValues) => inviteVolunteer(values.email),
    onSuccess: (_invitation, values) => {
      setInviteError(null)
      setInviteOpen(false)
      setNotice(
        `Invitation sent to ${values.email}. They'll see it under Profile › Invitations, and appear here once they accept.`,
      )
    },
    onError: (error) => setInviteError(extractErrorMessage(error)),
  })

  const removeMutation = useMutation({
    mutationFn: (volunteer: Volunteer) => removeVolunteer(volunteer.id),
    onSuccess: async (_result, volunteer) => {
      setRemoveError(null)
      setRemoveTarget(null)
      setNotice(`${volunteer.email} was removed from your organisation.`)
      await queryClient.invalidateQueries({ queryKey: VOLUNTEERS_QUERY_KEY })
    },
    onError: (error) => {
      setRemoveError(extractErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: VOLUNTEERS_QUERY_KEY })
    },
  })

  const openInvite = () => {
    reset({ email: '' })
    setInviteError(null)
    setInviteOpen(true)
  }

  const volunteers = rosterQuery.data
  const inactiveCount = volunteers?.filter((v) => v.status !== 'active').length ?? 0

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-heading text-h2 font-bold text-ink-900">Volunteers</h1>
          <p className="mt-1 font-body text-body-md text-ink-500">
            {ngoQuery.data ? `Everyone volunteering with ${ngoQuery.data.name}.` : 'Everyone volunteering with your organisation.'}
            {volunteers && volunteers.length > 0 && (
              <>
                {' '}
                {volunteers.length} {volunteers.length === 1 ? 'volunteer' : 'volunteers'}
                {inactiveCount > 0 && ` · ${inactiveCount} not active`}
              </>
            )}
          </p>
        </div>
        {canInvite && (
          <Button type="button" onClick={openInvite}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            Invite volunteer
          </Button>
        )}
      </div>

      {!canInvite && (
        <Notice tone="caution">
          Your organisation isn't active, so it can't invite new volunteers. Existing volunteers can still be
          removed.
        </Notice>
      )}

      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {rosterQuery.isPending ? (
        <VolunteersLoadState error={null} onRetry={() => void rosterQuery.refetch()} />
      ) : rosterQuery.isError ? (
        <VolunteersLoadState error={extractErrorMessage(rosterQuery.error)} onRetry={() => void rosterQuery.refetch()} />
      ) : volunteers && volunteers.length === 0 ? (
        <VolunteersEmptyState onInvite={openInvite} canInvite={canInvite} />
      ) : (
        <VolunteerRoster
          volunteers={volunteers ?? []}
          onRemove={(volunteer) => {
            setRemoveError(null)
            setRemoveTarget(volunteer)
          }}
        />
      )}

      <InviteVolunteerDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => {
          // The backend answers this with its "must be a citizen" 409 (the caller is an ngo_admin),
          // which reads as a mystery when the admin just typed their own address.
          if (ownEmail && values.email.toLowerCase() === ownEmail.toLowerCase()) {
            setInviteError("That's your own email address. Invite someone else.")
            return
          }
          inviteMutation.mutate(values)
        })}
        isSubmitting={inviteMutation.isPending}
        serverError={inviteError}
      />

      <RemoveVolunteerDialog
        volunteerEmail={removeTarget?.email ?? null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget)}
        isSubmitting={removeMutation.isPending}
        serverError={removeError}
      />
    </div>
  )
}
