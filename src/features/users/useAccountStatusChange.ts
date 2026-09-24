import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  ADMIN_ACCOUNTS_QUERY_KEY,
  adminAccountQueryKey,
  updateAccountStatus,
  type AccountStatusAction,
  type AccountSummary,
  type AllAccounts,
} from '@/api/identity'
import { moderationActionsQueryKey, recordModerationAction } from '@/api/trust'
import { extractErrorMessage } from '@/api/errors'
import { statusReasonSchema, type StatusReasonFormValues } from './schemas'
import type { AccountStatusDialogProps, StatusChangeTarget } from './AccountStatusDialog'

export interface PageNotice {
  tone: 'success' | 'caution'
  text: string
}

type Outcome =
  | { kind: 'changed'; account: AccountSummary; action: AccountStatusAction; logError: string | null }
  | { kind: 'already'; account: AccountSummary; action: AccountStatusAction }

const PAST_TENSE: Record<AccountStatusAction, string> = { suspend: 'suspended', reactivate: 'reactivated' }

/**
 * Everything a screen needs to suspend/reactivate an account with a confirmation: `open` the change,
 * render `dialogProps` into an AccountStatusDialog, and read the outcome from `onNotice`.
 *
 * On confirm it changes the status first, then saves the reason to the moderation log (the log is a
 * separate append-only record that doesn't follow status changes on its own). The outcomes are kept
 * apart on purpose: a `409` (already in that state — someone else got there first) is not a
 * failure, so the caches are refreshed and the notice says so; and if the status change worked but
 * the log entry didn't, the account IS changed, so that's reported as exactly that instead of an
 * error that would tempt a second, failing attempt. A successful change writes the returned account
 * straight into the detail cache and the loaded list, so nothing has to refetch (the list is many
 * requests).
 */
export function useAccountStatusChange({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<StatusChangeTarget | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StatusReasonFormValues>({ resolver: zodResolver(statusReasonSchema), defaultValues: { reason: '' } })

  const mutation = useMutation({
    mutationFn: async ({ account, action, reason }: StatusChangeTarget & { reason: string }): Promise<Outcome> => {
      let updated: AccountSummary
      try {
        updated = await updateAccountStatus(account.id, action)
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 409) return { kind: 'already', account, action }
        throw error
      }
      let logError: string | null = null
      try {
        await recordModerationAction(account.id, action === 'suspend' ? 'suspend' : 'unblock', reason)
      } catch (error) {
        logError = extractErrorMessage(error)
      }
      return { kind: 'changed', account: updated, action, logError }
    },
    onSuccess: (outcome) => {
      const { account, action } = outcome
      setServerError(null)
      setTarget(null)

      if (outcome.kind === 'already') {
        void queryClient.invalidateQueries({ queryKey: ADMIN_ACCOUNTS_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: adminAccountQueryKey(account.id) })
        onNotice({
          tone: 'caution',
          text: `${account.email} was already ${action === 'suspend' ? 'suspended' : 'active'}, so nothing changed. The view has been refreshed.`,
        })
        return
      }

      queryClient.setQueryData(adminAccountQueryKey(account.id), account)
      queryClient.setQueryData<AllAccounts>(ADMIN_ACCOUNTS_QUERY_KEY, (old) =>
        old && { ...old, accounts: old.accounts.map((a) => (a.id === account.id ? account : a)) },
      )
      void queryClient.invalidateQueries({ queryKey: moderationActionsQueryKey(account.id) })

      onNotice(
        outcome.logError
          ? {
              tone: 'caution',
              text: `${account.email} was ${PAST_TENSE[action]}, but the moderation log entry couldn't be saved (${outcome.logError}). Record it from their account page.`,
            }
          : { tone: 'success', text: `${account.email} was ${PAST_TENSE[action]}.` },
      )
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  const dialogProps: AccountStatusDialogProps = {
    target,
    onClose: () => setTarget(null),
    register,
    errors,
    onSubmit: handleSubmit(({ reason }) => {
      if (target) mutation.mutate({ ...target, reason })
    }),
    isSubmitting: mutation.isPending,
    serverError,
  }

  return {
    open: (account: AccountSummary, action: AccountStatusAction) => {
      reset({ reason: '' })
      setServerError(null)
      setTarget({ account, action })
    },
    dialogProps,
  }
}
