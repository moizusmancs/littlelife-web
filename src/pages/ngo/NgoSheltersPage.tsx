import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { extractErrorMessage } from '@/api/errors'
import { MY_SHELTERS_QUERY_KEY, getMyShelters } from '@/api/facilities'
import { LocationPicker } from '@/features/map/LocationPicker'
import { EditShelterDrawer } from '@/features/ngoShelters/EditShelterDrawer'
import { RegisterShelterDrawer } from '@/features/ngoShelters/RegisterShelterDrawer'
import { ShelterKpis } from '@/features/ngoShelters/ShelterKpis'
import { SheltersEmptyState, SheltersLoadState, SheltersNoMatch } from '@/features/ngoShelters/ShelterListStates'
import { ShelterTable } from '@/features/ngoShelters/ShelterTable'
import { ShelterToolbar } from '@/features/ngoShelters/ShelterToolbar'
import {
  DEFAULT_SHELTER_FILTER,
  SHELTER_FILTERS,
  countByFilter,
  filterShelters,
  shelterTotals,
  type ShelterFilter,
} from '@/features/ngoShelters/shelterModel'
import { useEditShelter } from '@/features/ngoShelters/useEditShelter'
import { useOccupancyEditor } from '@/features/ngoShelters/useOccupancyEditor'
import { useRegisterShelter } from '@/features/ngoShelters/useRegisterShelter'
import { useAuthStore } from '@/store/auth'

interface ListState {
  filter: ShelterFilter
  /** The raw search text (untrimmed, so a space typed mid-word isn't eaten). */
  q: string
}

const readState = (params: URLSearchParams): ListState => ({
  filter: SHELTER_FILTERS.find((filter) => filter === params.get('show')) ?? DEFAULT_SHELTER_FILTER,
  q: params.get('q') ?? '',
})

/** Only what differs from the defaults, so an untouched list has a clean `/ngo/shelters`. */
const toParams = ({ filter, q }: ListState) => {
  const params = new URLSearchParams()
  if (filter !== DEFAULT_SHELTER_FILTER) params.set('show', filter)
  if (q.trim()) params.set('q', q.trim())
  return params
}

/**
 * Container for /ngo/shelters — any NGO staff. Everything the organisation manages comes from one read, `GET /ngo/shelters` (unordered,
 * unpaginated, no region), and the KPI figures, filter counts, search and order are all worked out here. What each role may do follows
 * the API: **occupancy** is open to admin and volunteer alike (an editor opens inside the row), while **registering** and **editing** —
 * status and certification, the only fields that can change — are `ngo_admin` only, so a volunteer simply isn't offered them.
 *
 * Owns the list query, the view (filter and search — mirrored to the URL from state, not driven by it, so two quick changes can't undo
 * each other, and Back from a shelter returns to the same view) and the notice; the three writes and their forms live in hooks, and the
 * table, KPIs, toolbar and drawers are pure presentation.
 */
export function NgoSheltersPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ngo_admin')
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ListState>(() => readState(params))
  const [notice, setNotice] = useState<PageNotice | null>(null)

  useEffect(() => {
    const next = toParams(view)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [view, params, setParams])

  const query = useQuery({ queryKey: MY_SHELTERS_QUERY_KEY, queryFn: getMyShelters })
  const occupancy = useOccupancyEditor({ onNotice: setNotice })
  const edit = useEditShelter({ onNotice: setNotice })
  const registration = useRegisterShelter({ onNotice: setNotice })

  const shelters = query.data
  const totals = useMemo(() => (shelters ? shelterTotals(shelters) : undefined), [shelters])
  const counts = useMemo(() => (shelters ? countByFilter(shelters, view.q) : undefined), [shelters, view.q])
  const visible = useMemo(() => (shelters ? filterShelters(shelters, view) : []), [shelters, view])
  const listSearch = toParams(view).toString()

  // An editor whose shelter has gone from the list (deleted elsewhere, refetched) has nothing to edit.
  const draftShelter = occupancy.draft && shelters?.find((shelter) => shelter.id === occupancy.draft?.shelterId)
  const editTarget = edit.target && shelters?.find((shelter) => shelter.id === edit.target?.id)

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-heading text-h2 font-bold text-ink-900">Shelters</h1>
          <p className="mt-1 font-body text-body-md text-ink-500">
            {totals && totals.registered > 0
              ? `${totals.registered} registered · ${totals.occupied.toLocaleString('en-US')} / ${totals.capacity.toLocaleString('en-US')} occupied${totals.closed > 0 ? ` · ${totals.closed} closed` : ''}`
              : 'The shelters and relief centers your organisation runs.'}
          </p>
        </div>
        {isAdmin && (
          <Button type="button" onClick={registration.open}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            Register shelter
          </Button>
        )}
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {query.isPending ? (
        <SheltersLoadState error={null} onRetry={() => void query.refetch()} />
      ) : query.isError ? (
        <SheltersLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : shelters && shelters.length === 0 ? (
        <SheltersEmptyState canRegister={isAdmin} onRegister={registration.open} />
      ) : (
        shelters &&
        totals &&
        counts && (
          <>
            <ShelterKpis totals={totals} />
            <ShelterToolbar
              filter={view.filter}
              onFilterChange={(filter) => setView((previous) => ({ ...previous, filter }))}
              counts={counts}
              search={view.q}
              onSearchChange={(q) => setView((previous) => ({ ...previous, q }))}
            />
            {visible.length === 0 ? (
              <SheltersNoMatch onClear={() => setView({ filter: DEFAULT_SHELTER_FILTER, q: '' })} />
            ) : (
              <ShelterTable
                shelters={visible}
                canEdit={isAdmin}
                draft={draftShelter ? occupancy.draft : null}
                onToggleOccupancy={occupancy.toggle}
                onDraftChange={occupancy.setText}
                onDraftSave={() => draftShelter && occupancy.save(draftShelter)}
                onDraftCancel={occupancy.cancel}
                onEdit={edit.open}
                detailState={{ listSearch: listSearch ? `?${listSearch}` : '' }}
              />
            )}
          </>
        )
      )}

      {registration.isOpen && (
        <RegisterShelterDrawer
          onClose={registration.close}
          map={<LocationPicker value={registration.position} onChange={registration.pick} areas={registration.areas} label="Map for choosing the shelter's location" />}
          {...registration.drawerProps}
        />
      )}
      {editTarget && <EditShelterDrawer key={editTarget.id} shelter={editTarget} onClose={edit.close} {...edit.drawerProps} />}
    </div>
  )
}
