import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { AccountDetailHeader } from '@/features/users/AccountDetailHeader'
import { AccountDetailState } from '@/features/users/AccountDetailState'
import { AccountStatusDialog } from '@/features/users/AccountStatusDialog'
import { AccountSummaryCard } from '@/features/users/AccountSummaryCard'
import { CredibilityCard } from '@/features/users/CredibilityCard'
import { LogModerationDialog } from '@/features/users/LogModerationDialog'
import { ModerationHistoryCard } from '@/features/users/ModerationHistoryCard'
import { availableStatusActions } from '@/features/users/accountFilters'
import { moderationActionSchema, type ModerationActionFormValues } from '@/features/users/schemas'
import { useAccountStatusChange } from '@/features/users/useAccountStatusChange'
import { adminAccountQueryKey, getAccount } from '@/api/identity'
import {
  accountTrustScoreQueryKey,
  getAccountTrustScore,
  listModerationActions,
  moderationActionsQueryKey,
  recordModerationAction,
} from '@/api/trust'
import { extractErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/store/auth'

const ACTION_LABEL = { warn: 'warning', suspend: 'suspension', block: 'block', unblock: 'unblock' } as const

/**
 * Container for /admin/users/:id. Three independent reads — the account itself, its credibility
 * score, its moderation history — so a failure in one card doesn't take down the page; only the
 * account itself decides between the page, "not found" (a `404`, or a `400` for a malformed id in
 * the URL) and a load error with retry. Owns the suspend/reactivate flow (shared with the list via
 * `useAccountStatusChange`) and the separate "log a moderation action" dialog.
 *
 * The moderation log records the admin's id, not a name, and there's no route to look one up
 * except the accounts route itself, so the (few) distinct recording admins are resolved to emails
 * through `GET /admin/accounts/{id}` and cached; until each arrives it shows a short id. The
 * caller's own account gets no controls at all (see AccountDetailHeader).
 */
export function UserDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const currentAccountId = useAuthStore((s) => s.user?.id)
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? ''
  const backTo = `/admin/users${listSearch}`
  const isSelf = id === currentAccountId

  const accountQuery = useQuery({ queryKey: adminAccountQueryKey(id), queryFn: () => getAccount(id) })
  const scoreQuery = useQuery({ queryKey: accountTrustScoreQueryKey(id), queryFn: () => getAccountTrustScore(id) })
  const historyQuery = useQuery({ queryKey: moderationActionsQueryKey(id), queryFn: () => listModerationActions(id) })
  const statusChange = useAccountStatusChange({ onNotice: setNotice })

  const performerIds = [...new Set((historyQuery.data ?? []).map((a) => a.performed_by))].filter(
    (performerId) => performerId !== currentAccountId,
  )
  const performers = useQueries({
    queries: performerIds.map((performerId) => ({
      queryKey: adminAccountQueryKey(performerId),
      queryFn: () => getAccount(performerId),
      staleTime: 5 * 60_000,
    })),
  })
  const performerEmails = new Map(performers.flatMap((q, i) => (q.data ? [[performerIds[i], q.data.email] as const] : [])))
  const performerLabel = (performerId: string) =>
    performerId === currentAccountId ? 'You' : (performerEmails.get(performerId) ?? `Admin ${performerId.slice(0, 8)}`)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ModerationActionFormValues>({
    resolver: zodResolver(moderationActionSchema),
    defaultValues: { actionType: 'warn', reason: '' },
  })

  const logMutation = useMutation({
    mutationFn: (values: ModerationActionFormValues) => recordModerationAction(id, values.actionType, values.reason),
    onSuccess: async (_entry, values) => {
      setLogError(null)
      setLogOpen(false)
      setNotice({ tone: 'success', text: `Recorded a ${ACTION_LABEL[values.actionType]} in this account's history.` })
      await queryClient.invalidateQueries({ queryKey: moderationActionsQueryKey(id) })
    },
    onError: (error) => setLogError(extractErrorMessage(error)),
  })

  if (accountQuery.isPending) {
    return <AccountDetailState kind="loading" onRetry={() => undefined} backTo={backTo} />
  }
  if (accountQuery.isError) {
    const code = isAxiosError(accountQuery.error) ? accountQuery.error.response?.status : undefined
    return code === 404 || code === 400 ? (
      <AccountDetailState kind="not-found" onRetry={() => undefined} backTo={backTo} />
    ) : (
      <AccountDetailState
        kind="error"
        message={extractErrorMessage(accountQuery.error)}
        onRetry={() => void accountQuery.refetch()}
        backTo={backTo}
      />
    )
  }

  const account = accountQuery.data

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <AccountDetailHeader
        account={account}
        isSelf={isSelf}
        actions={availableStatusActions(account, isSelf)}
        onStatusAction={(action) => statusChange.open(account, action)}
        backTo={backTo}
      />

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        <AccountSummaryCard account={account} />
        <CredibilityCard
          score={scoreQuery.data}
          isLoading={scoreQuery.isPending}
          error={scoreQuery.isError ? extractErrorMessage(scoreQuery.error) : null}
          onRetry={() => void scoreQuery.refetch()}
        />
      </div>

      <ModerationHistoryCard
        actions={historyQuery.data}
        isLoading={historyQuery.isPending}
        error={historyQuery.isError ? extractErrorMessage(historyQuery.error) : null}
        onRetry={() => void historyQuery.refetch()}
        performerLabel={performerLabel}
        onLog={
          isSelf
            ? undefined
            : () => {
                reset({ actionType: 'warn', reason: '' })
                setLogError(null)
                setLogOpen(true)
              }
        }
      />

      <AccountStatusDialog {...statusChange.dialogProps} />
      <LogModerationDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        accountEmail={account.email}
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => logMutation.mutate(values))}
        isSubmitting={logMutation.isPending}
        serverError={logError}
      />
    </div>
  )
}
