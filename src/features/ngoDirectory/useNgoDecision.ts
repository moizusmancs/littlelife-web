import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  ADMIN_ACCOUNTS_QUERY_KEY,
  ADMIN_NGOS_QUERY_KEY,
  adminAccountQueryKey,
  adminNgoQueryKey,
  approveNgo,
  rejectNgo,
  type AdminNgo,
} from '@/api/identity'
import { extractErrorMessage } from '@/api/errors'
import type { PageNotice } from '@/components/ui/notice'
import type { NgoDecision, NgoDecisionDialogProps, NgoDecisionTarget } from './NgoDecisionDialog'

type Outcome =
  | { kind: 'done'; ngo: AdminNgo; decision: NgoDecision }
  | { kind: 'refused'; ngo: AdminNgo; decision: NgoDecision; reason: string }

/**
 * Everything a screen needs to approve or reject an application with a confirmation: `open` the
 * decision, render `dialogProps` into an NgoDecisionDialog, and read the outcome from `onNotice`.
 *
 * A `409` is not shown as a failure inside the dialog. The API answers it in two ways — `"ngo is
 * not pending approval"` when someone else already decided, and `"this account is already
 * affiliated with an ngo"` (checked first, so it's also what approving an already-approved NGO
 * returns) — and the second can also mean a genuinely pending NGO whose applicant has since joined
 * another organisation. So the notice quotes the server's own words and says the view was
 * refreshed, rather than asserting "already decided", and the refreshed list tells the truth.
 * Anything else (`404`, network, `5xx`) stays in the dialog. Nothing is patched into the caches by
 * hand: a decision changes the NGO *and*, on approval, the applicant's account (its role), so the
 * list, the NGO, and the accounts list/detail are all invalidated and refetch as needed.
 */
export function useNgoDecision({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<NgoDecisionTarget | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const refresh = (ngo: AdminNgo) => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_NGOS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: adminNgoQueryKey(ngo.id) })
    void queryClient.invalidateQueries({ queryKey: ADMIN_ACCOUNTS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: adminAccountQueryKey(ngo.created_by_id) })
  }

  const mutation = useMutation({
    mutationFn: async ({ ngo, decision }: NgoDecisionTarget): Promise<Outcome> => {
      try {
        await (decision === 'approve' ? approveNgo(ngo.id) : rejectNgo(ngo.id))
        return { kind: 'done', ngo, decision }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 409) {
          return { kind: 'refused', ngo, decision, reason: extractErrorMessage(error) }
        }
        throw error
      }
    },
    onSuccess: (outcome) => {
      const { ngo, decision } = outcome
      setServerError(null)
      setTarget(null)
      refresh(ngo)

      if (outcome.kind === 'refused') {
        onNotice({
          tone: 'caution',
          text: `Couldn't ${decision} ${ngo.name}: ${outcome.reason}. The view has been refreshed.`,
        })
      } else if (decision === 'approve') {
        onNotice({
          tone: 'success',
          text: `${ngo.name} was approved. ${ngo.created_by_email} is now its NGO admin and needs to log in again to see it.`,
        })
      } else {
        onNotice({
          tone: 'success',
          text: `${ngo.name} was rejected. ${ngo.created_by_email} can submit a new application.`,
        })
      }
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  const dialogProps: NgoDecisionDialogProps = {
    target,
    onClose: () => setTarget(null),
    onConfirm: () => {
      if (target) mutation.mutate(target)
    },
    isSubmitting: mutation.isPending,
    serverError,
  }

  return {
    open: (ngo: AdminNgo, decision: NgoDecision) => {
      setServerError(null)
      setTarget({ ngo, decision })
    },
    dialogProps,
  }
}
