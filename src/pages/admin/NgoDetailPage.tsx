import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { NgoDecisionDialog } from '@/features/ngoDirectory/NgoDecisionDialog'
import { NgoDetailHeader } from '@/features/ngoDirectory/NgoDetailHeader'
import { NgoDetailState } from '@/features/ngoDirectory/NgoDetailState'
import { NgoProfileCard } from '@/features/ngoDirectory/NgoProfileCard'
import { NgoRegionsCard } from '@/features/ngoDirectory/NgoRegionsCard'
import { NgoVolunteersCard } from '@/features/ngoDirectory/NgoVolunteersCard'
import { useNgoDecision } from '@/features/ngoDirectory/useNgoDecision'
import { adminNgoQueryKey, adminNgoVolunteersQueryKey, getAdminNgo, getAdminNgoVolunteers } from '@/api/identity'
import { adminNgoRegionsQueryKey, getAdminNgoRegions } from '@/api/geo'
import { extractErrorMessage } from '@/api/errors'

/**
 * Container for /admin/ngos/:id. Two independent reads — the organisation, and its volunteer roster
 * — so a failed roster shows an error in its own card without taking the page down; only the
 * organisation itself decides between the page, "not found" (a `404`, or a `400` for a malformed id
 * in the URL) and a load error with retry. Approve/Reject (pending only) share the list's
 * `useNgoDecision`, which refreshes this page's data afterwards.
 *
 * A third read, the organisation's operational regions (`GET /admin/ngos/{id}/regions`), fails in its
 * own card too. Shown as a list rather than the mockup's map, which is Phase 3's shared component.
 */
export function NgoDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const [notice, setNotice] = useState<PageNotice | null>(null)

  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? ''
  const backTo = `/admin/ngos${listSearch}`

  const ngoQuery = useQuery({ queryKey: adminNgoQueryKey(id), queryFn: () => getAdminNgo(id) })
  const volunteersQuery = useQuery({
    queryKey: adminNgoVolunteersQueryKey(id),
    queryFn: () => getAdminNgoVolunteers(id),
  })
  const regionsQuery = useQuery({ queryKey: adminNgoRegionsQueryKey(id), queryFn: () => getAdminNgoRegions(id) })
  const decision = useNgoDecision({ onNotice: setNotice })

  if (ngoQuery.isPending) return <NgoDetailState kind="loading" onRetry={() => undefined} backTo={backTo} />
  if (ngoQuery.isError) {
    const code = isAxiosError(ngoQuery.error) ? ngoQuery.error.response?.status : undefined
    return code === 404 || code === 400 ? (
      <NgoDetailState kind="not-found" onRetry={() => undefined} backTo={backTo} />
    ) : (
      <NgoDetailState
        kind="error"
        message={extractErrorMessage(ngoQuery.error)}
        onRetry={() => void ngoQuery.refetch()}
        backTo={backTo}
      />
    )
  }

  const ngo = ngoQuery.data

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <NgoDetailHeader ngo={ngo} onDecide={(next) => decision.open(ngo, next)} backTo={backTo} />

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <NgoProfileCard ngo={ngo} />
        <NgoVolunteersCard
          volunteers={volunteersQuery.data}
          isLoading={volunteersQuery.isPending}
          error={volunteersQuery.isError ? extractErrorMessage(volunteersQuery.error) : null}
          onRetry={() => void volunteersQuery.refetch()}
        />
      </div>

      <NgoRegionsCard
        regions={regionsQuery.data}
        error={regionsQuery.isError ? extractErrorMessage(regionsQuery.error) : null}
        onRetry={() => void regionsQuery.refetch()}
      />

      <NgoDecisionDialog {...decision.dialogProps} />
    </div>
  )
}
