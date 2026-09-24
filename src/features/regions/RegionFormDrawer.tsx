import { useRef } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { FileArrowUpIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { RegionLevel } from '@/api/geo'
import { BoundaryPreview } from './BoundaryPreview'
import type { BoundarySummary, ParsedBoundary } from './geojson'
import type { RegionFormValues } from './regionForm'
import { PARENT_LEVEL, REGION_LEVELS, REGION_LEVEL_LABEL } from './regionTree'

export interface RegionFormDrawerProps {
  mode: 'create' | 'edit'
  /** The region being edited, for the description. */
  regionName?: string
  onClose: () => void
  register: UseFormRegister<RegionFormValues>
  errors: FieldErrors<RegionFormValues>
  /** The level currently chosen, which decides what the parent field offers. */
  level: RegionLevel
  /** Why the level can't be changed (a region with sub-regions), or `null` when it can. */
  levelLockedReason: string | null
  parentChoices: { id: string; label: string }[]
  /** Offer "No parent" — only for a region that already has none. */
  allowNoParent: boolean
  /** The live reading of the boundary text; `null` while it's empty. */
  boundary: ParsedBoundary | null
  /** When editing: what is stored now, kept if the boundary is left blank. */
  currentBoundary: BoundarySummary | null
  onFile: (file: File) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

const fieldError = 'mt-1 font-body text-body-sm text-status-critical'

const formatBounds = ([w, s, e, n]: BoundarySummary['bbox']) => `${w.toFixed(2)}° to ${e.toFixed(2)}° E, ${s.toFixed(2)}° to ${n.toFixed(2)}° N`

/**
 * The create/edit form for a region, in a side drawer. Pure presentation: values and validation
 * live in the container's react-hook-form. The boundary is the interesting field — a GeoJSON
 * Polygon pasted or uploaded, read as it changes so every problem the API would let through (an
 * open ring, a bow-tie, longitude 200, a MultiPolygon it would 500 on) is listed *before* saving,
 * and a good one is drawn so a wrong or swapped shape is visible.
 */
export function RegionFormDrawer({
  mode,
  regionName,
  onClose,
  register,
  errors,
  level,
  levelLockedReason,
  parentChoices,
  allowNoParent,
  boundary,
  currentBoundary,
  onFile,
  onSubmit,
  isSubmitting,
  serverError,
}: RegionFormDrawerProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const parentLevel = PARENT_LEVEL[level]

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onFile(file)
    event.target.value = ''
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent onInteractOutside={(event) => event.preventDefault()}>
        <DrawerHeader>
          <DrawerTitle>{mode === 'create' ? 'Add region' : 'Edit region'}</DrawerTitle>
          <DrawerDescription>
            {mode === 'create'
              ? 'A province, district or tehsil, with its boundary.'
              : `Changes to ${regionName} apply everywhere it's used. Only what you change is saved.`}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="flex flex-col gap-5">
            {serverError && (
              <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                {serverError}
              </div>
            )}

            <div>
              <Label htmlFor="regionName">Name</Label>
              <Input
                id="regionName"
                autoComplete="off"
                autoFocus
                hasError={!!errors.name}
                aria-describedby={errors.name ? 'region-name-error' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <p id="region-name-error" className={fieldError}>
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="regionLevel">Level</Label>
              <Select id="regionLevel" disabled={levelLockedReason !== null} aria-describedby="region-level-hint" {...register('level')}>
                {REGION_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {REGION_LEVEL_LABEL[value]}
                  </option>
                ))}
              </Select>
              {levelLockedReason && (
                <p id="region-level-hint" className="mt-1 font-body text-body-sm text-ink-500">
                  {levelLockedReason}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="regionParent">{parentLevel ? `Parent ${parentLevel}` : 'Parent'}</Label>
              <Select
                id="regionParent"
                disabled={!parentLevel}
                hasError={!!errors.parentRegionId}
                aria-describedby={errors.parentRegionId ? 'region-parent-error' : undefined}
                {...register('parentRegionId')}
              >
                {parentLevel ? (
                  <>
                    <option value="">{allowNoParent ? 'No parent' : `Choose a ${parentLevel}…`}</option>
                    {parentChoices.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value="">None — provinces are top level</option>
                )}
              </Select>
              {errors.parentRegionId && (
                <p id="region-parent-error" className={fieldError}>
                  {errors.parentRegionId.message}
                </p>
              )}
              {parentLevel && parentChoices.length === 0 && (
                <p className="mt-1 font-body text-body-sm text-ink-500">There are no {parentLevel}s yet. Add one first.</p>
              )}
            </div>

            <div>
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="regionBoundary" className="mb-0">
                  Boundary
                </Label>
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                  <FileArrowUpIcon size={16} aria-hidden="true" />
                  Upload file
                </Button>
                <input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" aria-label="Upload a GeoJSON file" onChange={chooseFile} />
              </div>
              <p id="region-boundary-hint" className="mt-1 mb-1.5 font-body text-body-sm text-ink-500">
                {mode === 'edit' && currentBoundary
                  ? `Currently ${currentBoundary.rings} ring${currentBoundary.rings === 1 ? '' : 's'}, ${currentBoundary.points} points. Leave this blank to keep it, or paste a GeoJSON Polygon (or upload a file) to replace it.`
                  : 'A GeoJSON Polygon, [longitude, latitude]. A Feature holding one works too. Paste it here or upload a .geojson file.'}
              </p>
              <Textarea
                id="regionBoundary"
                rows={7}
                spellCheck={false}
                autoComplete="off"
                placeholder='{"type":"Polygon","coordinates":[[[67.0,24.0],[68.0,24.0],[68.0,25.0],[67.0,24.0]]]}'
                className="font-mono text-body-sm"
                hasError={!!errors.boundaryText || (boundary !== null && !boundary.ok)}
                aria-describedby="region-boundary-hint region-boundary-status"
                {...register('boundaryText')}
              />

              <div id="region-boundary-status" className="mt-2">
                {boundary && !boundary.ok && (
                  <ul role="alert" className="flex flex-col gap-1 font-body text-body-sm text-status-critical">
                    {boundary.errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                {!boundary && errors.boundaryText && <p className={fieldError}>{errors.boundaryText.message}</p>}
                {boundary?.ok && (
                  <div className="rounded-sm border border-surface-border bg-surface-sunken p-3">
                    <BoundaryPreview polygon={boundary.polygon} label="Outline of the boundary you entered" className="max-h-44" />
                    <p className="mt-2 font-body text-body-sm text-ink-700">
                      Valid polygon: {boundary.summary.rings} ring{boundary.summary.rings === 1 ? '' : 's'}, {boundary.summary.points} points.
                      <br />
                      {formatBounds(boundary.summary.bbox)}
                    </p>
                    {boundary.wrappedIn && (
                      <p className="mt-1 font-body text-body-sm text-ink-500">Using the polygon inside the {boundary.wrappedIn}.</p>
                    )}
                    {boundary.droppedAltitude && (
                      <p className="mt-1 font-body text-body-sm text-ink-500">Altitude values were dropped — a boundary is flat.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" isLoading={isSubmitting}>
              {mode === 'create' ? 'Add region' : 'Save changes'}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
