import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ListPagination } from '@/components/ui/list-pagination'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { extractErrorMessage } from '@/api/errors'
import type { AdminHazardZone, PredictionFilters, ZoneFilters } from '@/api/floodIntel'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { PAGE_SIZES } from '@/lib/pagination'
import { cn } from '@/lib/utils'
import { DateRangeFilter } from '@/features/hazardZones/DateRangeFilter'
import { ConfidenceSlider } from '@/features/hazardZones/ConfidenceSlider'
import { DeclareZoneDialog } from '@/features/hazardZones/DeclareZoneDialog'
import { PredictionList } from '@/features/hazardZones/PredictionList'
import { ResolveZoneDialog, type ResolveZoneTarget } from '@/features/hazardZones/ResolveZoneDialog'
import { TabPills } from '@/features/hazardZones/TabPills'
import { ZoneList } from '@/features/hazardZones/ZoneList'
import { ZoneListState } from '@/features/hazardZones/ZoneListStates'
import { isReversedRange, rangeToParams, shortId, viewportBoundaryText, zoneTitle, zoneToOverlayEntry, type DateRange } from '@/features/hazardZones/zoneModel'
import { useAdminOverlay, useAdminPredictions, useAdminZones, useDeclareZone, useResolveZone } from '@/features/hazardZones/useZoneData'
import { MapCanvas, type MapFocus } from '@/features/map/MapCanvas'
import { MapLegend } from '@/features/map/MapLegend'
import { PAKISTAN_BOUNDS, boundaryBounds, viewportToBBox, type ViewportBounds } from '@/features/map/mapGeo'

type View = 'zones' | 'predictions'
type Status = 'active' | 'resolved'

interface ViewState {
  view: View
  status: Status
  range: DateRange
  size: number
  page: number
}

const readState = (params: URLSearchParams): ViewState => ({
  view: params.get('view') === 'predictions' ? 'predictions' : 'zones',
  status: params.get('status') === 'resolved' ? 'resolved' : 'active',
  range: { from: params.get('from') ?? '', to: params.get('to') ?? '' },
  size: PAGE_SIZES.find((size) => String(size) === params.get('size')) ?? PAGE_SIZES[0],
  page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
})

/** Only what differs from the defaults, so an untouched page has a clean `/admin/hazard-zones`. */
const toParams = ({ view, status, range, size, page }: ViewState) => {
  const params = new URLSearchParams()
  if (view !== 'zones') params.set('view', view)
  if (status !== 'active') params.set('status', status)
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  if (size !== PAGE_SIZES[0]) params.set('size', String(size))
  if (page > 1) params.set('page', String(page))
  return params
}

const VIEWS = [
  { id: 'zones' as const, label: 'Hazard zones' },
  { id: 'predictions' as const, label: 'Predictions' },
]
const STATUSES = [
  { id: 'active' as const, label: 'Active' },
  { id: 'resolved' as const, label: 'Resolved' },
]

const noop = () => undefined

/**
 * Container for /admin/hazard-zones (admin and super_admin, via the Admin route group): the zone table beside a map, and the model's
 * predictions as a second view. The table is `GET /admin/hazard-zones` — paginated by the server, filtered by status and a date range on
 * when the zone was detected. The map is a different route, `GET /admin/map/flood-overlay`: every active zone in the visible box,
 * with a confidence slider (the citizen map hides model zones under 34%; this one shows them all), and — on the Resolved tab, which the
 * overlay can't draw because it only holds active zones — the zones of the table's current page. A zone is opened from its row or its
 * outline; a row can also point the map at it, and resolve it. Declaring a zone is open to NGO admins too (the dialog is shared), resolving is not.
 */
export function HazardZonesPage() {
  const navigate = useNavigate()
  // The table beside the map needs ~34rem for the table *and* room for a map: the console's sidebar leaves a 1024px window only ~735px, so below 1280px it is List | Map, one at a time.
  const split = useMediaQuery('(min-width: 1280px)')
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<ViewState>(() => readState(params))
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [mobilePane, setMobilePane] = useState<'list' | 'map'>('list')
  const [minConfidence, setMinConfidence] = useState(0)
  const [viewport, setViewport] = useState<ViewportBounds | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [focused, setFocused] = useState<AdminHazardZone | null>(null)
  const [resolveTarget, setResolveTarget] = useState<AdminHazardZone | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [declareOpen, setDeclareOpen] = useState(false)
  const [declareError, setDeclareError] = useState<string | null>(null)

  useEffect(() => {
    const next = toParams(state)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [state, params, setParams])

  const { view, status, range, size, page } = state
  const change = (patch: Partial<ViewState>) => setState((previous) => ({ ...previous, ...patch, page: 'page' in patch ? (patch.page as number) : 1 }))
  const reversed = isReversedRange(range)

  const dates = useMemo(() => rangeToParams(range), [range])
  const zoneFilters: ZoneFilters = { ...dates, status, limit: size, offset: (page - 1) * size }
  const predictionFilters: PredictionFilters = { ...dates, limit: size, offset: (page - 1) * size }
  const zones = useAdminZones(zoneFilters, view === 'zones' && !reversed)
  const predictions = useAdminPredictions(predictionFilters, view === 'predictions' && !reversed)

  const bbox = useDebouncedValue(viewport ? viewportToBBox(viewport) : null, 350)
  const settledConfidence = useDebouncedValue(minConfidence, 300)
  const overlay = useAdminOverlay(bbox, settledConfidence, view === 'zones' && status === 'active')

  const resolve = useResolveZone()
  const declare = useDeclareZone()

  const current = view === 'zones' ? zones.data : predictions.data

  const mapZones = useMemo(() => {
    const base = status === 'active' ? (overlay.data ?? []) : (zones.data?.zones ?? []).map(zoneToOverlayEntry)
    // A zone the map was pointed at is always drawn, even when the slider hides it or it isn't on the overlay's box.
    return focused && !base.some((entry) => entry.hazard_zone_id === focused.id) ? [...base, zoneToOverlayEntry(focused)] : base
  }, [status, overlay.data, zones.data, focused])

  const showOnMap = useCallback((zone: AdminHazardZone) => {
    setFocused(zone)
    const bounds = boundaryBounds(zone.boundary)
    if (bounds) setFocus({ bounds })
    setMobilePane('map')
  }, [])

  const confirmResolve = () => {
    if (!resolveTarget) return
    setResolveError(null)
    resolve.mutate(resolveTarget.id, {
      onSuccess: () => {
        setNotice({ tone: 'success', text: `${zoneTitle(resolveTarget)} (#${shortId(resolveTarget.id)}) is resolved and off the citizen map.` })
        if (focused?.id === resolveTarget.id) setFocused(null)
        // Resolving the only row of the last page would leave the table on a page that no longer exists.
        if (page > 1 && zones.data?.zones.length === 1) setState((previous) => ({ ...previous, page: previous.page - 1 }))
        setResolveTarget(null)
      },
      onError: (error) => {
        const code = isAxiosError(error) ? error.response?.status : undefined
        if (code === 400 || code === 404) {
          // Someone else got there first (already resolved) or it is gone: nothing more to do, and the refreshed list will say so.
          setNotice({ tone: 'caution', text: `Couldn't resolve ${zoneTitle(resolveTarget)} (#${shortId(resolveTarget.id)}): ${extractErrorMessage(error)}. The list has been refreshed.` })
          setResolveTarget(null)
        } else setResolveError(extractErrorMessage(error))
      },
    })
  }

  const declareZone = (input: Parameters<typeof declare.mutate>[0]) => {
    setDeclareError(null)
    declare.mutate(input, {
      onSuccess: (zone) => {
        setDeclareOpen(false)
        setNotice({ tone: 'success', text: `Hazard zone declared (#${shortId(zone.id)}). It is active, and on the citizen map now.` })
        setState((previous) => ({ ...previous, view: 'zones', status: 'active', page: 1 }))
        showOnMap(zone)
      },
      onError: (error) => setDeclareError(extractErrorMessage(error)),
    })
  }

  const resolveDialogTarget: ResolveZoneTarget | null = resolveTarget ? { id: resolveTarget.id, title: zoneTitle(resolveTarget), shortId: shortId(resolveTarget.id) } : null
  const active = view === 'zones' ? zones : predictions
  const total = current?.total ?? 0

  const listBody =
    reversed ? (
      <ZoneListState kind="empty" noun="results" message="Fix the dates to see results." />
    ) : active.isPending ? (
      <ZoneListState kind="loading" noun={view === 'zones' ? 'zones' : 'predictions'} />
    ) : active.isError ? (
      <ZoneListState kind="error" noun={view === 'zones' ? 'hazard zones' : 'predictions'} message={extractErrorMessage(active.error)} onRetry={() => void active.refetch()} />
    ) : view === 'zones' && zones.data ? (
      zones.data.zones.length === 0 ? (
        <ZoneListState kind="empty" noun="zones" message={zones.data.total > 0 && page > 1 ? 'There is nothing on this page. Go back to an earlier one.' : `No ${status} hazard zones${range.from || range.to ? ' in those dates' : ''}.`} />
      ) : (
        <ZoneList zones={zones.data.zones} focusedId={focused?.id ?? null} onShowOnMap={showOnMap} onResolve={(zone) => (setResolveError(null), setResolveTarget(zone))} />
      )
    ) : predictions.data && predictions.data.predictions.length === 0 ? (
      <ZoneListState kind="empty" noun="predictions" message={`No predictions${range.from || range.to ? ' in those dates' : ''}.`} />
    ) : (
      predictions.data && <PredictionList predictions={predictions.data.predictions} />
    )

  const controls = (
    <div className="flex flex-col gap-3 border-b border-surface-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabPills label="Show" value={view} options={VIEWS} onChange={(next) => change({ view: next })} />
        {view === 'zones' && <TabPills label="Zone status" value={status} options={STATUSES} onChange={(next) => change({ status: next })} />}
      </div>
      <DateRangeFilter range={range} noun={view === 'zones' ? 'Detected' : 'Generated'} onChange={(next) => change({ range: next })} />
      {view === 'zones' && status === 'active' && <ConfidenceSlider value={minConfidence} onChange={setMinConfidence} />}
    </div>
  )

  const pane = (
    // From `lg` the filters stay put and only the rows scroll; on a phone the filters would take the whole screen, so the pane scrolls as one.
    <section aria-label={view === 'zones' ? 'Hazard zones' : 'Flood predictions'} className={cn('flex min-h-0 flex-1 flex-col rounded-md border border-surface-border bg-surface-raised shadow-sm', split ? 'overflow-hidden' : 'overflow-y-auto')}>
      {controls}
      <div className={cn(split && 'min-h-0 flex-1 overflow-y-auto')}>{listBody}</div>
      <div className="border-t border-surface-border px-4 py-2.5">
        <ListPagination page={page} pageSize={size} total={total} onPageChange={(next) => change({ page: next })} onPageSizeChange={(next) => change({ size: next })} />
      </div>
    </section>
  )

  return (
    <div className={cn('flex flex-col gap-4', view === 'zones' && 'h-[calc(100dvh-8.5rem)] min-h-[560px] md:h-[calc(100dvh-8rem)]')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Hazard zones &amp; predictions</h1>
          <p className="mt-1 font-body text-body-md text-ink-500">What is flagged as hazardous right now, and what the flood model has predicted.</p>
        </div>
        <Button type="button" onClick={() => (setDeclareError(null), setDeclareOpen(true))}>
          <PlusIcon size={16} weight="bold" aria-hidden="true" />
          Declare hazard zone
        </Button>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {view === 'zones' ? (
        <>
          {!split && (
            <div role="group" aria-label="View" className="flex flex-none gap-1 rounded-md border border-surface-border bg-surface-raised p-1">
              {(['list', 'map'] as const).map((pick) => (
                <button key={pick} type="button" aria-pressed={mobilePane === pick} onClick={() => setMobilePane(pick)} className={cn('h-9 flex-1 rounded-sm font-body text-label font-semibold', mobilePane === pick ? 'bg-primary-50 text-primary-700' : 'text-ink-500')}>
                  {pick === 'list' ? 'List' : 'Map'}
                </button>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 gap-4">
            {(split || mobilePane === 'list') && <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:w-[34rem] xl:flex-none">{pane}</div>}
            <div className={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-surface-border', !split && mobilePane === 'list' && 'hidden')}>
              <MapCanvas
                initialBounds={PAKISTAN_BOUNDS}
                hazards={mapZones}
                places={[]}
                selectedHazardId={focused?.id ?? null}
                selectedPlaceKey={null}
                userPosition={null}
                focus={focus}
                onViewportChange={setViewport}
                onSelectHazard={(id) => navigate(`/admin/hazard-zones/${id}`)}
                onSelectPlace={noop}
                legend={<MapLegend showCitizenFloor={false} />}
              />
              {overlay.isError && status === 'active' && (
                <p role="alert" className="absolute inset-x-3 bottom-3 z-900 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900 shadow-md">
                  Couldn't load the zones for this view.
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col">{pane}</div>
      )}

      <DeclareZoneDialog
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        onSubmit={declareZone}
        isSubmitting={declare.isPending}
        serverError={declareError}
        suggestedBoundary={viewport ? viewportBoundaryText(viewport) : undefined}
      />
      <ResolveZoneDialog target={resolveDialogTarget} onClose={() => setResolveTarget(null)} onConfirm={confirmResolve} isSubmitting={resolve.isPending} serverError={resolveError} />
    </div>
  )
}
