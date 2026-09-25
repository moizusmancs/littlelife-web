import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CaretRightIcon, DownloadSimpleIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { Region, RegionLevel } from '@/api/geo'
import { BoundaryPreview } from './BoundaryPreview'
import { polygonFromGeometry, summarizePolygon } from './geojson'
import { PARENT_LEVEL, REGION_LEVEL_LABEL, REGION_LEVELS } from './regionTree'

const when = (iso: string) => format(parseISO(iso), 'd MMM yyyy, HH:mm')
const card = 'rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm'

/** The level below, that a new sub-region would be. */
const childLevelOf = (level: RegionLevel): RegionLevel | null => REGION_LEVELS.find((candidate) => PARENT_LEVEL[candidate] === level) ?? null

export interface RegionDetailPanelProps {
  region: Region
  /** Root → this region, for the path above the name. */
  path: Region[]
  /** Its direct sub-regions, by name. */
  subRegions: Region[]
  onEdit: () => void
  onAddSubRegion: (level: RegionLevel) => void
  onDownloadBoundary: () => void
  /** The list's `?q=…&level=…`, kept on the links so the tree's filter survives navigating. */
  linkSearch: string
  /** Mobile only: the way back to the tree. */
  backLink: React.ReactNode
  /** The organisations covering this region — its own card, loaded by the container so a failure stays inside it. */
  coverage?: React.ReactNode
}

const linkTo = (id: string, search: string) => ({ pathname: `/admin/regions/${id}`, search })

/**
 * The right half of Admin Regions: one region's path and name, its sub-regions, its boundary, and
 * its raw details. Edit and "Add a district/tehsil" open the container's drawer; nothing here
 * fetches. The boundary is drawn as a flat outline (no map yet — that's Phase 3's shared component)
 * and can be downloaded as GeoJSON; a stored boundary that isn't a well-formed polygon (the API has
 * stored some) says so instead of drawing garbage. The mockup's population/area/code and boundary
 * import have no data or route behind them and aren't shown; the assigned NGOs come in as `coverage`.
 */
export function RegionDetailPanel({ region, path, subRegions, onEdit, onAddSubRegion, onDownloadBoundary, linkSearch, backLink, coverage }: RegionDetailPanelProps) {
  const polygon = polygonFromGeometry(region.boundary)
  const summary = polygon ? summarizePolygon(polygon) : null
  const childLevel = childLevelOf(region.level)
  const parent = path.length > 1 ? path[path.length - 2] : null

  const details: Array<[string, React.ReactNode]> = [
    [
      'Parent',
      parent ? (
        <Link to={linkTo(parent.id, linkSearch)} className="font-semibold text-primary-700 hover:underline [overflow-wrap:anywhere]">
          {parent.name}
        </Link>
      ) : (
        <span className="text-ink-500">None — top level</span>
      ),
    ],
    ['Region ID', <span key="id" className="font-mono text-body-sm [overflow-wrap:anywhere]">{region.id}</span>],
    ['Created', when(region.created_at)],
    ['Last updated', when(region.updated_at)],
  ]

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {backLink}

      <div className={cn(card, 'flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between')}>
        <div className="min-w-0">
          {path.length > 1 && (
            <nav aria-label="Region path" className="mb-1.5 flex flex-wrap items-center gap-1 font-body text-body-sm text-ink-500">
              {path.slice(0, -1).map((ancestor) => (
                <span key={ancestor.id} className="flex items-center gap-1">
                  <Link to={linkTo(ancestor.id, linkSearch)} className="font-semibold text-primary-700 hover:underline">
                    {ancestor.name}
                  </Link>
                  <CaretRightIcon size={12} aria-hidden="true" />
                </span>
              ))}
              <span aria-current="page">{region.name}</span>
            </nav>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-heading text-h2 font-bold text-ink-900 [overflow-wrap:anywhere]">{region.name}</h2>
            <Badge tone="info">{REGION_LEVEL_LABEL[region.level]}</Badge>
          </div>
        </div>
        <Button type="button" variant="secondary" className="flex-none" onClick={onEdit}>
          <PencilSimpleIcon size={16} aria-hidden="true" />
          Edit region
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className={card} aria-labelledby="region-boundary-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 id="region-boundary-heading" className="font-heading text-h3 font-bold text-ink-900">
              Boundary
            </h3>
            <button type="button" onClick={onDownloadBoundary} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
              <DownloadSimpleIcon size={16} aria-hidden="true" />
              Download GeoJSON
            </button>
          </div>
          {polygon && summary ? (
            <>
              <div className="mt-3 rounded-sm border border-surface-border bg-surface-sunken p-3">
                <BoundaryPreview polygon={polygon} label={`Outline of ${region.name}`} className="max-h-64" />
              </div>
              <p className="mt-3 font-body text-body-sm text-ink-700">
                Polygon · {summary.rings} ring{summary.rings === 1 ? '' : 's'} · {summary.points} points
                <br />
                {summary.bbox[0].toFixed(2)}° to {summary.bbox[2].toFixed(2)}° E, {summary.bbox[1].toFixed(2)}° to {summary.bbox[3].toFixed(2)}° N
              </p>
            </>
          ) : (
            <p className="mt-3 font-body text-body-md text-ink-500">
              This boundary isn't a well-formed polygon, so it can't be drawn. Edit the region to replace it.
            </p>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className={card} aria-labelledby="region-sub-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="region-sub-heading" className="font-heading text-h3 font-bold text-ink-900">
                Sub-regions
                <span className="ms-1.5 font-body text-body-md font-normal text-ink-500">{subRegions.length}</span>
              </h3>
              {childLevel && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onAddSubRegion(childLevel)}>
                  <PlusIcon size={14} weight="bold" aria-hidden="true" />
                  Add {childLevel}
                </Button>
              )}
            </div>
            {subRegions.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {subRegions.map((child) => (
                  <li key={child.id}>
                    <Link
                      to={linkTo(child.id, linkSearch)}
                      className="inline-flex min-h-8 items-center rounded-full border border-surface-border bg-surface-sunken px-3 font-body text-label font-semibold text-ink-900 hover:border-primary-500 hover:text-primary-700"
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 font-body text-body-md text-ink-500">
                {childLevel ? `No ${childLevel}s under ${region.name} yet.` : 'Tehsils are the smallest level, so they have no sub-regions.'}
              </p>
            )}
          </section>

          <section className={card} aria-labelledby="region-details-heading">
            <h3 id="region-details-heading" className="font-heading text-h3 font-bold text-ink-900">
              Details
            </h3>
            <dl className="mt-3 divide-y divide-surface-border">
              {details.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="flex-none font-body text-body-sm text-ink-500">{label}</dt>
                  <dd className="min-w-0 text-end font-body text-body-md text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {coverage}
    </div>
  )
}
