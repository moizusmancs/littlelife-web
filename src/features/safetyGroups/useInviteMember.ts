import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requestSafetyConnection, SAFETY_CONNECTIONS_QUERY_KEY } from '@/api/trust'
import { extractErrorMessage } from '@/api/errors'
import { shortId } from './connections'
import { rememberInvite } from './inviteHints'
import { inviteMemberSchema, type InviteMemberFormValues, type InviteMethod } from './schemas'

const DEFAULTS: InviteMemberFormValues = { method: 'email', recipient: '', connectionType: 'family' }

/** The server's own words for "no such active citizen" — the same for a stranger's email and an id, so the reason is never given away. */
const NOT_FOUND = 'recipient account not found'
const NOT_FOUND_TEXT: Record<InviteMethod, string> = {
  email: "We couldn't find an active LittleLife member with that email.",
  id: "We couldn't find an active LittleLife member with that Member ID.",
}

export interface UseInviteMemberOptions {
  /** Your own account id — the key the typed email is remembered under. */
  me: string
  /** Told what the request was sent to (the email, or "Member 8D0D395C" for an id), once the server has accepted it. */
  onSent: (sentTo: string) => void
}

/**
 * The Invite Member dialog's state: whether it's open, whether the recipient is named by email or by
 * Member ID, the form, and the `POST /safety-connections` behind it. Nothing is checked here beyond the
 * shape of what was typed — the server refuses your own email/id, an unknown or ineligible account, and a
 * pending request either way round or an accepted connection already, each with a message written to be
 * shown as it is (the "not found" one is put in plainer words, since it also covers an account that
 * exists but isn't an active citizen). On success the email you typed is remembered (`rememberInvite`),
 * because the server won't tell you who you asked.
 */
export function useInviteMember({ me, onSent }: UseInviteMemberOptions) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<InviteMemberFormValues>({ resolver: zodResolver(inviteMemberSchema), defaultValues: DEFAULTS })
  const method = useWatch({ control, name: 'method' })

  const mutation = useMutation({
    mutationFn: (values: InviteMemberFormValues) =>
      requestSafetyConnection(values.method === 'email' ? { email: values.recipient } : { accountId: values.recipient.toLowerCase() }, values.connectionType),
    onSuccess: async (connection, values) => {
      setServerError(null)
      setOpen(false)
      if (values.method === 'email') rememberInvite(me, connection.id, values.recipient)
      await queryClient.invalidateQueries({ queryKey: SAFETY_CONNECTIONS_QUERY_KEY })
      onSent(values.method === 'email' ? values.recipient : `Member ${shortId(connection.recipient_account_id)}`)
    },
    onError: (error, values) => {
      const message = extractErrorMessage(error)
      setServerError(message === NOT_FOUND ? NOT_FOUND_TEXT[values.method] : message)
    },
  })

  return {
    open,
    openDialog: () => {
      reset(DEFAULTS)
      setServerError(null)
      setOpen(true)
    },
    setOpen,
    method,
    /** Switches between email and Member ID, clearing what was typed and any message about it. */
    setMethod: (next: InviteMethod) => {
      setValue('method', next)
      setValue('recipient', '')
      clearErrors()
      setServerError(null)
    },
    register,
    errors,
    onSubmit: handleSubmit((values) => mutation.mutate(values)),
    isSubmitting: mutation.isPending,
    serverError,
  }
}
