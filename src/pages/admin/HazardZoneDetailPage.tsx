import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { extractErrorMessage } from '@/api/errors'
import { getHazardZone, hazardZoneQueryKey, type HazardZoneDetail } from '@/api/floodIntel'
import { ResolveZoneDialog } from '@/features/hazardZones/ResolveZoneDialog'
import { ZoneDetailHeader, ZoneFactsCard, ZonePredictionCard } from '@/features/hazardZones/ZoneDetailParts'
import { ZoneDetailState } from '@/features/hazardZones/ZoneDetailState'
import { detailToOverlayEntry, shortId, zoneTitle } from '@/features/hazardZones/zoneModel'
import { useResolveZone } from '@/features/hazardZones/useZoneData'
import { MapCanvas } from '@/features/map/MapCanvas'
import { MapLegend } from '@/features/map/MapLegend'
import { PAKISTAN_BOUNDS, boundaryBounds } from '@/features/map/mapGeo'

const noop = () => undefined

/**
 * Container for /admin/hazard-zones/:id. One public read, `GET /hazard-zones/{id}` (the tooltip shape — there is no admin route by id, so the
 * account that declared a zone and its region aren't available here): the page, "not found" (a `404`, or a `400` for an id that isn't a
 * UUID), or a load error with retry. Resolve is offered while the zone is active and refreshes the page afterwards.
 */
export function HazardZoneDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: hazardZoneQueryKey(id), queryFn: () => getHazardZone(id) })

  if (query.isPending) return <ZoneDetailState kind="loading" onRetry={noop} />
  if (query.isError) {
    const code = isAxiosError(query.error) ? query.error.response?.status : undefined
    if (code === 404 || code === 400) return <ZoneDetailState kind="not-found" onRetry={noop} />
    return <ZoneDetailState kind="error" message={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  }
  return <ZoneDetail zone={query.data} />
}

function ZoneDetail({ zone }: { zone: HazardZoneDetail }) {
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const resolve = useResolveZone()

  const entry = useMemo(() => detailToOverlayEntry(zone), [zone])
  const hazards = useMemo(() => [entry], [entry])
  const bounds = useMemo(() => boundaryBounds(zone.boundary) ?? PAKISTAN_BOUNDS, [zone.boundary])

  const confirm = () => {
    setServerError(null)
    resolve.mutate(zone.id, {
      onSuccess: () => {
        setNotice({ tone: 'success', text: `Resolved. ${zoneTitle(zone)} (#${shortId(zone.id)}) is off the citizen map.` })
        setConfirming(false)
      },
      onError: (error) => {
        const code = isAxiosError(error) ? error.response?.status : undefined
        if (code === 400 || code === 404) {
          setNotice({ tone: 'caution', text: `Couldn't resolve this zone: ${extractErrorMessage(error)}. The page has been refreshed.` })
          setConfirming(false)
        } else setServerError(extractErrorMessage(error))
      },
    })
  }

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <ZoneDetailHeader zone={zone} onResolve={() => (setServerError(null), setConfirming(true))} />
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <section aria-label="Where the zone is" className="h-80 overflow-hidden rounded-md border border-surface-border lg:col-span-2 lg:h-[26rem]">
          <MapCanvas
            initialBounds={bounds}
            hazards={hazards}
            places={[]}
            selectedHazardId={zone.id}
            selectedPlaceKey={null}
            userPosition={null}
            focus={null}
            onViewportChange={noop}
            onSelectHazard={noop}
            onSelectPlace={noop}
            legend={<MapLegend showCitizenFloor={false} />}
            scrollWheelZoom={false}
          />
        </section>
        <div className="flex flex-col gap-5">
          <ZoneFactsCard zone={zone} />
          <ZonePredictionCard zone={zone} />
        </div>
      </div>
      <ResolveZoneDialog target={confirming ? { id: zone.id, title: zoneTitle(zone), shortId: shortId(zone.id) } : null} onClose={() => setConfirming(false)} onConfirm={confirm} isSubmitting={resolve.isPending} serverError={serverError} />
    </div>
  )
}
