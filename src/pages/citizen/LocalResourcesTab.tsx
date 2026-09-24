import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { CrosshairIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { extractErrorMessage } from '@/api/errors'
import { reportEssentialLocationStatus, type ReportedStatus } from '@/api/facilities'
import { LocationStatusNote } from '@/features/map/LocationNote'
import { distanceMeters } from '@/features/map/mapGeo'
import type { LayerState } from '@/features/map/mapLayers'
import type { MapPlace } from '@/features/map/mapModel'
import { useGeolocation } from '@/features/map/useGeolocation'
import { useMapRegions, usePlaces } from '@/features/map/useMapData'
import { CategoryChips } from '@/features/resources/CategoryChips'
import { LocalListPlaceholder, LocalResourceList } from '@/features/resources/LocalResourceList'
import { ScopeToggle, type LocalScope } from '@/features/resources/ScopeToggle'
import { LOCAL_CATEGORIES, countByCategory, isLocalResource, matchesCategory, sortLocal, type LocalCategory } from '@/features/resources/localResources'

/** Shelters and essential locations are what the tab lists; nothing else is asked for. */
const LOCAL_LAYERS: LayerState = { flood: false, shelters: true, infrastructure: false, essentials: true }
const PAGE_SIZE = 25

/**
 * The Local Resources tab: the shelters, pharmacies, grocery stores and ATMs of the citizen's home region (or everywhere, on request),
 * filtered by kind, nearest first once they say where they are, and — for the essential ones — a way to tell everyone whether a place is
 * open or closed. The lists come from the same region-scoped routes as the map (and share its cache); a report is
 * `POST /essential-locations/{id}/status-reports`, after which the list is asked for again, so what is shown is what the server now says.
 */
export function LocalResourcesTab() {
  const queryClient = useQueryClient()
  const regions = useMapRegions()
  const { home, roots, settled } = regions

  const [scope, setScope] = useState<LocalScope>('home')
  const [category, setCategory] = useState<LocalCategory>('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [notice, setNotice] = useState<PageNotice | null>(null)

  const inScope = useMemo(() => (home && scope === 'home' ? [home] : roots), [home, scope, roots])
  // Nothing is asked for until the profile and the region list have both answered — otherwise everywhere is fetched first, then the home region.
  const placeData = usePlaces(LOCAL_LAYERS, settled ? inScope : [])
  const location = useGeolocation()

  const report = useMutation({
    mutationFn: ({ place, status }: { place: MapPlace; status: ReportedStatus }) => reportEssentialLocationStatus(place.id, status),
    onSuccess: (_result, { place, status }) => {
      setNotice({ tone: 'success', text: `Thanks — ${place.name} is now shown as ${status}.` })
      void queryClient.invalidateQueries({ queryKey: ['map', 'essential-locations'] })
    },
    onError: (error, { place }) => {
      const gone = isAxiosError(error) && error.response?.status === 404
      setNotice({ tone: 'caution', text: gone ? `${place.name} is no longer listed, so your report wasn't sent. The list has been refreshed.` : `Couldn't send your report about ${place.name}: ${extractErrorMessage(error)}` })
      if (gone) void queryClient.invalidateQueries({ queryKey: ['map', 'essential-locations'] })
    },
  })

  const local = useMemo(() => placeData.places.filter(isLocalResource), [placeData.places])
  const counts = useMemo(() => countByCategory(local), [local])
  const visible = useMemo(() => sortLocal(local.filter((place) => matchesCategory(place, category)), location.position), [local, category, location.position])
  const distanceOf = (place: MapPlace) => (location.position ? distanceMeters(location.position, place.position) : null)

  const changeCategory = (next: LocalCategory) => {
    setCategory(next)
    setShown(PAGE_SIZE)
  }
  const changeScope = (next: LocalScope) => {
    setScope(next)
    setShown(PAGE_SIZE)
  }

  const loading = !settled || (placeData.isPending && inScope.length > 0)
  const categoryLabel = LOCAL_CATEGORIES.find((entry) => entry.id === category)?.label.toLowerCase() ?? ''

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {home ? <ScopeToggle scope={scope} homeName={home.name} onChange={changeScope} /> : <span />}
        {location.position ? (
          <p className="flex items-center gap-1.5 font-body text-body-sm text-ink-500">
            <CrosshairIcon size={14} aria-hidden="true" />
            Nearest first
          </p>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={location.locate} disabled={location.status === 'locating'}>
            <CrosshairIcon size={14} aria-hidden="true" />
            Nearest first
          </Button>
        )}
      </div>
      <LocationStatusNote status={location.status} className="rounded-md border px-3.5 py-3 font-body text-body-sm text-ink-900" deniedText="Location is blocked for this site. Allow it in your browser's site settings to put the nearest places first." />

      {settled && !home && (
        <p className="font-body text-body-sm text-ink-500">
          Showing everywhere.{' '}
          <Link to="/app/profile/edit" className="font-semibold text-primary-700 hover:underline">
            Set your home region
          </Link>{' '}
          to see what is near you.
        </p>
      )}

      <CategoryChips category={category} counts={counts} onChange={changeCategory} />

      {regions.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
          <span className="min-w-0 flex-1">Couldn't load the regions that places are found by.</span>
          <Button type="button" variant="secondary" size="sm" onClick={regions.retry}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {placeData.error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
              <span className="min-w-0 flex-1">Couldn't load some places.</span>
              <Button type="button" variant="secondary" size="sm" onClick={placeData.refetch}>
                Try again
              </Button>
            </div>
          )}
          {loading ? (
            <LocalListPlaceholder kind="loading" />
          ) : settled && roots.length === 0 ? (
            <LocalListPlaceholder kind="empty" message="No regions have been set up yet, so there are no places to show." />
          ) : visible.length === 0 ? (
            <LocalListPlaceholder
              kind="empty"
              message={category === 'all' ? (home && scope === 'home' ? `No shelters or shops are listed in ${home.name} yet.` : 'No shelters or shops are listed yet.') : `No ${categoryLabel} are listed here.`}
            />
          ) : (
            <LocalResourceList
              places={visible.slice(0, shown)}
              total={visible.length}
              distanceOf={distanceOf}
              reportingBusy={report.isPending}
              onReport={(place, status) => report.mutate({ place, status })}
              onShowMore={() => setShown((count) => count + PAGE_SIZE)}
            />
          )}
        </>
      )}
    </div>
  )
}
