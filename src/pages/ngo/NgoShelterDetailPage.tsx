import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { extractErrorMessage } from '@/api/errors'
import { getShelter, shelterQueryKey, type Shelter } from '@/api/facilities'
import { NGO_ME_QUERY_KEY, getMyNgo } from '@/api/identity'
import { shelterPlace } from '@/features/map/mapModel'
import { EditShelterDrawer } from '@/features/ngoShelters/EditShelterDrawer'
import { NgoShelterHeader } from '@/features/ngoShelters/NgoShelterHeader'
import { NgoShelterOccupancyCard } from '@/features/ngoShelters/NgoShelterOccupancyCard'
import { useEditShelter } from '@/features/ngoShelters/useEditShelter'
import { useOccupancyEditor } from '@/features/ngoShelters/useOccupancyEditor'
import { CoverageNote } from '@/features/regions/CoverageNote'
import { useRegionCoverage } from '@/features/regions/useRegionCoverage'
import { ShelterDetailState } from '@/features/shelters/ShelterDetailState'
import { ShelterFactsCard } from '@/features/shelters/ShelterFactsCard'
import { ShelterLocation } from '@/features/shelters/ShelterLocation'
import { useAuthStore } from '@/store/auth'

const noop = () => undefined

/**
 * Container for /ngo/shelters/:id — any NGO staff. There is no NGO-side read by id, so it reads the public `GET /shelters/{id}` (the
 * same entry, and the same not-found rules, as the citizen's page: a `404`, or a `400` for an id that isn't a UUID) and the
 * organisation (`GET /ngo/me`, cached and shared) to tell whether the shelter is *theirs* — the API refuses writes to another
 * organisation's shelter with a `403`, so the page doesn't offer them. If the organisation lookup itself fails the controls are shown
 * and the server keeps the final say.
 */
export function NgoShelterDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? ''
  const back = { to: `/ngo/shelters${listSearch}`, label: 'Back to shelters' }

  const query = useQuery({ queryKey: shelterQueryKey(id), queryFn: () => getShelter(id) })
  const ngo = useQuery({ queryKey: NGO_ME_QUERY_KEY, queryFn: getMyNgo })

  if (query.isPending || ngo.isPending) return <ShelterDetailState kind="loading" onRetry={noop} back={back} />
  if (query.isError) {
    const code = isAxiosError(query.error) ? query.error.response?.status : undefined
    if (code === 404 || code === 400) return <ShelterDetailState kind="not-found" onRetry={noop} back={back} />
    return <ShelterDetailState kind="error" message={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} back={back} />
  }
  const mine = ngo.data ? query.data.managed_by_ngo_id === ngo.data.id : true
  return <NgoShelterDetail shelter={query.data} mine={mine} backTo={back.to} />
}

/** A loaded shelter: identity, occupancy (with its editor), where it is and whether citizens can see it, and its details. */
function NgoShelterDetail({ shelter, mine, backTo }: { shelter: Shelter; mine: boolean; backTo: string }) {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ngo_admin')
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const occupancy = useOccupancyEditor({ onNotice: setNotice })
  const edit = useEditShelter({ onNotice: setNotice })

  const place = useMemo(() => shelterPlace(shelter), [shelter])
  const coverage = useRegionCoverage(place.position, true)
  const draft = occupancy.draft?.shelterId === shelter.id ? occupancy.draft : null

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <NgoShelterHeader shelter={shelter} backTo={backTo} canEdit={isAdmin && mine} onEdit={() => edit.open(shelter)} />

      {!mine && (
        <Notice tone="caution">This shelter is run by another organisation. You can see it here, but only that organisation can change it.</Notice>
      )}
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-3 xl:grid-rows-[auto_1fr] xl:items-start">
        <div className="xl:col-start-3 xl:row-start-1">
          <NgoShelterOccupancyCard
            shelter={shelter}
            draft={draft}
            canUpdate={mine}
            onOpen={() => occupancy.toggle(shelter)}
            onTextChange={occupancy.setText}
            onSave={() => occupancy.save(shelter)}
            onCancel={occupancy.cancel}
          />
        </div>
        <div className="xl:col-span-2 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <ShelterLocation shelter={shelter}>
            <CoverageNote coverage={coverage} />
          </ShelterLocation>
        </div>
        <div className="xl:col-start-3 xl:row-start-2">
          <ShelterFactsCard shelter={shelter} extraRows={[['Managed by', mine ? 'Your organisation' : 'Another organisation']]} />
        </div>
      </div>

      {edit.target && <EditShelterDrawer key={edit.target.id} shelter={shelter} onClose={edit.close} {...edit.drawerProps} />}
    </div>
  )
}
