import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { RegionDetailPanel } from '@/features/regions/RegionDetailPanel'
import { RegionEditor, type RegionEditorTarget } from '@/features/regions/RegionEditor'
import { RegionNgosCard } from '@/features/regions/RegionNgosCard'
import { RegionsState } from '@/features/regions/RegionsState'
import { RegionTreePanel } from '@/features/regions/RegionTreePanel'
import { downloadBoundary } from '@/features/regions/downloadGeoJson'
import {
  REGION_LEVELS,
  ancestorIds,
  buildRegionTree,
  childrenOf,
  countByLevel,
  describeCounts,
  isFiltering,
  pathLabel,
  pathTo,
  searchRegions,
  visibleRows,
  type RegionFilter,
} from '@/features/regions/regionTree'
import { REGIONS_QUERY_KEY, getRegionNgos, getRegions, regionNgosQueryKey, type Region } from '@/api/geo'
import { extractErrorMessage } from '@/api/errors'
import { cn } from '@/lib/utils'

const readFilter = (params: URLSearchParams): RegionFilter => ({
  q: params.get('q') ?? '',
  level: REGION_LEVELS.find((level) => level === params.get('level')) ?? 'all',
})

const toParams = ({ q, level }: RegionFilter) => {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (level !== 'all') params.set('level', level)
  return params
}

/**
 * Container for /admin/regions and /admin/regions/:id (`admin` and `super_admin`) — one route with an
 * optional `:id`, so the filter and what's expanded survive moving between regions. Master–detail as
 * in the mockup (Batch 5 §5f): the hierarchy tree with search and a level filter, and the selected
 * region beside it. On a phone only one shows at a time — the tree at `/admin/regions`, the region
 * at `/admin/regions/:id` with a way back.
 *
 * `GET /regions` returns every region with its boundary and has no filter worth using here, so the
 * whole list is loaded once and the tree, search, counts and selected region are all derived from
 * it; there's no per-region request. The filter lives in React state mirrored to the URL (as on
 * the other admin lists) and the expanded branches are page state, opened to reveal the selected
 * region whenever the selection changes — set while rendering, not in an effect.
 *
 * Add/Edit open RegionEditor's drawer. There is no delete: the API has no route for it.
 * Each region also lists the organisations assigned to it (`GET /admin/regions/{id}/ngos`, direct
 * assignments only), in a card that loads and fails on its own. Not built from the mockup: the map
 * (Phase 3's shared component — an outline is drawn instead), population/area/code (no such fields),
 * assigning an NGO from here (only an NGO's own admin can change its coverage) and boundary import.
 */
export function RegionsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<RegionFilter>(() => readFilter(params))
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [editor, setEditor] = useState<RegionEditorTarget | null>(null)
  const [expansion, setExpansion] = useState<{ open: ReadonlySet<string>; focus: string | undefined }>({ open: new Set(), focus: undefined })

  useEffect(() => {
    const next = toParams(filter)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [filter, params, setParams])

  const query = useQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions() })
  const regions = query.data

  if (regions && expansion.focus !== id) {
    setExpansion({ open: new Set([...expansion.open, ...(id ? ancestorIds(regions, id) : [])]), focus: id })
  }

  const tree = useMemo(() => (regions ? buildRegionTree(regions) : []), [regions])
  const rows = useMemo(() => visibleRows(tree, expansion.open), [tree, expansion.open])
  const matches = useMemo(() => (regions && isFiltering(filter) ? searchRegions(regions, filter) : null), [regions, filter])
  const counts = useMemo(() => (regions ? countByLevel(regions) : undefined), [regions])

  const linkSearch = toParams(filter).toString() ? `?${toParams(filter).toString()}` : ''
  const selected = id ? regions?.find((region) => region.id === id) : undefined
  // Its own request per selected region, so a failure stays in the card instead of taking the panel down.
  const ngosQuery = useQuery({ queryKey: regionNgosQueryKey(id ?? ''), queryFn: () => getRegionNgos(id as string), enabled: selected !== undefined })

  const toggle = (regionId: string) =>
    setExpansion((previous) => {
      const open = new Set(previous.open)
      if (!open.delete(regionId)) open.add(regionId)
      return { ...previous, open }
    })

  const onSaved = (region: Region, kind: 'created' | 'updated') => {
    setEditor(null)
    setNotice({ tone: 'success', text: kind === 'created' ? `Added ${region.name}.` : `Saved changes to ${region.name}.` })
    if (kind === 'created') navigate({ pathname: `/admin/regions/${region.id}`, search: linkSearch })
  }

  const backLink = (
    <Link to={{ pathname: '/admin/regions', search: linkSearch }} className="inline-flex items-center gap-1.5 font-body text-label font-semibold text-primary-700 hover:underline lg:hidden">
      <ArrowLeftIcon size={14} weight="bold" aria-hidden="true" />
      All regions
    </Link>
  )

  let content: React.ReactNode
  if (query.isPending) {
    content = <RegionsState kind="loading" />
  } else if (query.isError) {
    content = <RegionsState kind="error" message={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  } else if (query.data.length === 0) {
    content = <RegionsState kind="empty" onAdd={() => setEditor({ mode: 'create' })} />
  } else {
    const all = query.data
    content = (
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <RegionTreePanel
          className={cn(id && 'max-lg:hidden')}
          rows={rows}
          matches={matches}
          parentPathOf={(region) => (region.parent_region_id ? pathLabel(all, region.parent_region_id) : '')}
          selectedId={id}
          onToggle={toggle}
          search={filter.q}
          onSearchChange={(q) => setFilter((previous) => ({ ...previous, q }))}
          level={filter.level}
          onLevelChange={(level) => setFilter((previous) => ({ ...previous, level }))}
          linkSearch={linkSearch}
        />

        <div className={cn('min-w-0', !id && 'max-lg:hidden')}>
          {selected ? (
            <RegionDetailPanel
              region={selected}
              path={pathTo(all, selected.id)}
              subRegions={childrenOf(all, selected.id)}
              onEdit={() => setEditor({ mode: 'edit', region: selected })}
              onAddSubRegion={(level) => setEditor({ mode: 'create', preset: { level, parentRegionId: selected.id } })}
              onDownloadBoundary={() => downloadBoundary(selected)}
              linkSearch={linkSearch}
              backLink={backLink}
              coverage={<RegionNgosCard ngos={ngosQuery.data} error={ngosQuery.isError ? extractErrorMessage(ngosQuery.error) : null} onRetry={() => void ngosQuery.refetch()} />}
            />
          ) : id ? (
            <div className="flex flex-col gap-4">
              {backLink}
              <div className="rounded-md border border-surface-border bg-surface-raised p-6">
                <h2 className="font-heading text-h3 font-bold text-ink-900">Region not found</h2>
                <p className="mt-1.5 font-body text-body-md text-ink-500">There's no region with that ID. The link may be wrong, or it's been removed.</p>
                <Link to={{ pathname: '/admin/regions', search: linkSearch }} className="mt-3 inline-flex h-11 items-center font-body text-label font-semibold text-primary-700 hover:underline">
                  Back to regions
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-surface-border bg-surface-raised p-8 text-center">
              <h2 className="font-heading text-h3 font-bold text-ink-900">Select a region</h2>
              <p className="mx-auto mt-1.5 max-w-sm font-body text-body-md text-ink-500">
                Choose one from the hierarchy to see its boundary and sub-regions, or add a new region.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-h2 font-bold text-ink-900">Regions</h1>
          <p className="mt-1 font-body text-body-md text-ink-500">
            {counts ? describeCounts(counts) : 'The provinces, districts and tehsils everything else is placed in.'}
          </p>
        </div>
        {regions && (
          <Button type="button" onClick={() => setEditor({ mode: 'create' })}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            Add region
          </Button>
        )}
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {content}

      {editor && regions && <RegionEditor key={editor.mode === 'edit' ? editor.region.id : `new-${editor.preset?.level ?? ''}-${editor.preset?.parentRegionId ?? ''}`} target={editor} regions={regions} onClose={() => setEditor(null)} onSaved={onSaved} />}
    </div>
  )
}
