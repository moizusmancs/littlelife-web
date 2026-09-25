import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ListPagination } from '@/components/ui/list-pagination'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { TabBar } from '@/components/ui/tab-bar'
import { extractErrorMessage } from '@/api/errors'
import { getEssentialLocations, getInfrastructure, getShelters, type EssentialLocation } from '@/api/facilities'
import { essentialPlace, infrastructurePlace, shelterPlace, type MapPlace } from '@/features/map/mapModel'
import { LocationPicker } from '@/features/map/LocationPicker'
import { RegionPickerDialog } from '@/features/regions/RegionPickerDialog'
import { pathLabel } from '@/features/regions/regionTree'
import { AddFacilityDrawer } from '@/features/facilities/AddFacilityDrawer'
import { EssentialReportsDialog } from '@/features/facilities/EssentialReportsDialog'
import { EssentialTable } from '@/features/facilities/EssentialTable'
import { FacilityLocation } from '@/features/facilities/FacilityLocation'
import { FacilityToolbar } from '@/features/facilities/FacilityToolbar'
import { FacilitiesEmptyState, FacilitiesLoadState, FacilitiesNoMatch, PartialLoadNotice } from '@/features/facilities/FacilityStates'
import { InfrastructureTable } from '@/features/facilities/InfrastructureTable'
import { RegionScope } from '@/features/facilities/RegionScope'
import { SheltersOversightTable } from '@/features/facilities/SheltersOversightTable'
import { UpdateInfrastructureStatusDialog } from '@/features/facilities/UpdateInfrastructureStatusDialog'
import {
  ALL,
  ESSENTIAL_SPEC,
  FACILITY_TABS,
  INFRA_SPEC,
  TAB_OPTIONS,
  countNoun,
  makeShelterSpec,
  parseFacilityTab,
  type FacilityTab,
} from '@/features/facilities/facilityModel'
import { useAddFacility } from '@/features/facilities/useAddFacility'
import { useEssentialReports, useFacilityRows, useOrganisationNames, useRegionScope } from '@/features/facilities/useFacilityData'
import { useFacilityList } from '@/features/facilities/useFacilityList'
import { useInfrastructureStatus } from '@/features/facilities/useInfrastructureStatus'
import { useScopePicker } from '@/features/facilities/useScopePicker'
import { PAGE_SIZES } from '@/lib/pagination'

interface ViewState {
  tab: FacilityTab
  /** The chosen region's id, or `null` for every region. */
  region: string | null
  /** The raw search text (untrimmed, so a space typed mid-word isn't eaten). */
  q: string
  type: string
  status: string
  size: number
  page: number
}

const known = (value: string | null, allowed: readonly string[]) => (value !== null && allowed.includes(value) ? value : ALL)

const readState = (params: URLSearchParams): ViewState => {
  const tab = parseFacilityTab(params.get('tab'))
  return {
    tab,
    region: params.get('region') || null,
    q: params.get('q') ?? '',
    type: known(params.get('type'), TAB_OPTIONS[tab].types),
    status: known(params.get('status'), TAB_OPTIONS[tab].statuses),
    size: PAGE_SIZES.find((size) => String(size) === params.get('size')) ?? PAGE_SIZES[0],
    page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
  }
}

/** Only what differs from the defaults, so an untouched page has a clean `/admin/facilities`. */
const toParams = ({ tab, region, q, type, status, size, page }: ViewState) => {
  const params = new URLSearchParams()
  if (tab !== FACILITY_TABS[0].id) params.set('tab', tab)
  if (region) params.set('region', region)
  if (q.trim()) params.set('q', q.trim())
  if (type !== ALL) params.set('type', type)
  if (status !== ALL) params.set('status', status)
  if (size !== PAGE_SIZES[0]) params.set('size', String(size))
  if (page > 1) params.set('page', String(page))
  return params
}

const HINT: Record<FacilityTab, string> = {
  shelters: 'Shelters are registered by the organisation that runs them. Once one is, it appears here.',
  infrastructure: 'Hospitals, bridges and utilities that you add appear here, with a status you keep current.',
  essential: 'Essential locations are meant to be bulk-imported. You can add one by hand.',
}

/**
 * Container for /admin/facilities (`admin` and `super_admin`, via the Admin route group): three tabs — Shelters (read-only oversight), Infrastructure (add, and update status) and
 * Essential locations (add, and read the report log). **The API only answers per region**, so "everywhere" is one request per top-level region and a chosen region is one request; the
 * reads share the citizen map's cache. Search, both filters and paging are done here (the API has none). A place outside every region is unreachable by any route, so the page says so.
 *
 * Owns the view (mirrored to the URL from state, not driven by it, so two quick changes can't undo each other, and a reload or link lands on the same view), the notice, and which dialog is
 * open; the three writes and their forms live in hooks, and the tables, toolbar, dialogs and drawers are pure presentation.
 */
export function FacilitiesPage() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ViewState>(() => readState(params))
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [locationPlace, setLocationPlace] = useState<MapPlace | null>(null)
  const [reportsTarget, setReportsTarget] = useState<EssentialLocation | null>(null)

  useEffect(() => {
    const next = toParams(view)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [view, params, setParams])

  const { tab } = view
  const region = useRegionScope(view.region)
  const organisations = useOrganisationNames(tab === 'shelters')
  const shelterSpec = useMemo(() => makeShelterSpec(organisations.names), [organisations.names])

  const shelters = useFacilityRows('shelters', getShelters, region.regionIds, tab === 'shelters' && region.ready)
  const infrastructure = useFacilityRows('infrastructure', getInfrastructure, region.regionIds, tab === 'infrastructure' && region.ready)
  const essential = useFacilityRows('essential-locations', getEssentialLocations, region.regionIds, tab === 'essential' && region.ready)
  const shelterList = useFacilityList(shelters.rows, shelterSpec, view)
  const infrastructureList = useFacilityList(infrastructure.rows, INFRA_SPEC, view)
  const essentialList = useFacilityList(essential.rows, ESSENTIAL_SPEC, view)

  const addInfrastructure = useAddFacility('infrastructure', { onNotice: setNotice })
  const addEssential = useAddFacility('essential', { onNotice: setNotice })
  const statusUpdate = useInfrastructureStatus({ onNotice: setNotice })
  const scopePicker = useScopePicker({ onChoose: (regionId) => setView((previous) => ({ ...previous, region: regionId, page: 1 })) })
  const reports = useEssentialReports(reportsTarget?.id ?? null)

  const changeTab = (next: FacilityTab) => setView((previous) => ({ ...previous, tab: next, type: ALL, status: ALL, q: '', page: 1 }))
  const changeFilters = (patch: Partial<Pick<ViewState, 'q' | 'type' | 'status' | 'size'>>) => setView((previous) => ({ ...previous, ...patch, page: 1 }))
  const scopePath = region.scope ? pathLabel(region.regions, region.scope.id) : null

  const current =
    tab === 'shelters'
      ? { spec: shelterSpec, list: shelterList, load: shelters }
      : tab === 'infrastructure'
        ? { spec: INFRA_SPEC, list: infrastructureList, load: infrastructure }
        : { spec: ESSENTIAL_SPEC, list: essentialList, load: essential }
  const { spec, list, load } = current
  const filtering = view.q.trim() !== '' || view.type !== ALL || view.status !== ALL

  const add = tab === 'infrastructure' ? { label: 'Add infrastructure', open: addInfrastructure.open } : tab === 'essential' ? { label: 'Add essential location', open: addEssential.open } : null

  const body = !region.ready ? (
    <FacilitiesLoadState label="regions" error={region.error} onRetry={region.retry} />
  ) : load.isPending ? (
    <FacilitiesLoadState label={spec.noun.many} error={null} onRetry={load.refetch} />
  ) : load.rows.length === 0 && load.error ? (
    <FacilitiesLoadState label={spec.noun.many} error={extractErrorMessage(load.error)} onRetry={load.refetch} />
  ) : list.total === 0 ? (
    <FacilitiesEmptyState noun={spec.noun.many} where={scopePath ? `in ${scopePath}` : 'in any region'} action={add ? { label: add.label, onClick: add.open } : undefined} hint={HINT[tab]} />
  ) : list.filtered.length === 0 ? (
    <FacilitiesNoMatch onClear={() => changeFilters({ q: '', type: ALL, status: ALL })} />
  ) : tab === 'shelters' ? (
    <SheltersOversightTable rows={shelterList.visible} organisationNames={organisations.names} onShowLocation={(row) => setLocationPlace(shelterPlace(row))} />
  ) : tab === 'infrastructure' ? (
    <InfrastructureTable rows={infrastructureList.visible} onShowLocation={(row) => setLocationPlace(infrastructurePlace(row))} onUpdateStatus={statusUpdate.open} />
  ) : (
    <EssentialTable rows={essentialList.visible} onShowLocation={(row) => setLocationPlace(essentialPlace(row))} onShowReports={setReportsTarget} />
  )

  const showingRows = region.ready && !load.isPending && list.filtered.length > 0

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-heading text-h2 font-bold text-ink-900">Facilities</h1>
          <p className="mt-1 font-body text-body-md text-ink-500">
            {region.ready && !load.isPending
              ? `${filtering ? `${list.filtered.length.toLocaleString('en-US')} of ${countNoun(list.total, spec.noun)}` : countNoun(list.total, spec.noun)} ${scopePath ? `in ${scopePath}` : 'in every region'}`
              : 'Shelters, infrastructure and essential locations across the platform.'}
          </p>
        </div>
        {add && (
          <Button type="button" onClick={add.open}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            {add.label}
          </Button>
        )}
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {region.unknownRegion && <Notice tone="caution">That region isn't on the platform, so every region is shown.</Notice>}

      <TabBar tabs={FACILITY_TABS} active={tab} onChange={changeTab} label="Facility kinds" idPrefix="facilities-tab" panelId="facilities-panel" />

      <div id="facilities-panel" role="tabpanel" aria-labelledby={`facilities-tab-${tab}`} className="flex flex-col gap-4">
        <FacilityToolbar
          search={view.q}
          onSearchChange={(q) => changeFilters({ q })}
          searchLabel={`Search ${spec.noun.many}`}
          scope={<RegionScope path={scopePath} onChoose={scopePicker.open} onClear={() => setView((previous) => ({ ...previous, region: null, page: 1 }))} />}
          groups={[
            { label: 'Type', value: view.type, options: spec.types, counts: list.counts.types, onChange: (type) => changeFilters({ type }) },
            { label: 'Status', value: view.status, options: spec.statuses, counts: list.counts.statuses, onChange: (status) => changeFilters({ status }) },
          ]}
        />

        {load.failed > 0 && load.rows.length > 0 && <PartialLoadNotice failed={load.failed} onRetry={load.refetch} />}
        {tab === 'shelters' && organisations.failed && <Notice tone="caution">Organisation names couldn't be loaded, so shelters show only that they are run by "an organisation".</Notice>}

        {body}

        {showingRows && (
          <ListPagination
            page={list.page}
            pageSize={view.size}
            total={list.filtered.length}
            onPageChange={(page) => setView((previous) => ({ ...previous, page }))}
            onPageSizeChange={(size) => changeFilters({ size })}
          />
        )}

        <p className="font-body text-body-sm text-ink-500">
          Only places inside a region are listed. A place outside every region can't be listed by any route — it exists, but no citizen is shown it and no admin can find, edit or remove it.
          {tab === 'shelters' && ' Shelters are managed by the organisation that runs them, from its own console.'}
        </p>
      </div>

      {addInfrastructure.isOpen && (
        <AddFacilityDrawer
          onClose={addInfrastructure.close}
          map={<LocationPicker value={addInfrastructure.position} onChange={addInfrastructure.pick} areas={addInfrastructure.areas} label="Map for choosing the infrastructure's location" />}
          {...addInfrastructure.drawerProps}
        />
      )}
      {addEssential.isOpen && (
        <AddFacilityDrawer
          onClose={addEssential.close}
          map={<LocationPicker value={addEssential.position} onChange={addEssential.pick} areas={addEssential.areas} label="Map for choosing the essential location's position" />}
          {...addEssential.drawerProps}
        />
      )}
      <UpdateInfrastructureStatusDialog
        target={statusUpdate.target}
        status={statusUpdate.status}
        onStatusChange={statusUpdate.setStatus}
        onSave={statusUpdate.save}
        onClose={statusUpdate.close}
        isSaving={statusUpdate.isSaving}
        error={statusUpdate.error}
      />
      <EssentialReportsDialog target={reportsTarget} isPending={reports.isPending} error={reports.error} entries={reports.entries} onRetry={reports.retry} onClose={() => setReportsTarget(null)} />
      <FacilityLocation place={locationPlace} onClose={() => setLocationPlace(null)} />
      <RegionPickerDialog {...scopePicker.dialogProps} />
    </div>
  )
}

