import { useDeferredValue, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { DeclareZoneInput, RiskLevel } from '@/api/floodIntel'
import { BoundaryPreview } from '@/features/regions/BoundaryPreview'
import { parseBoundary } from '@/features/regions/geojson'
import { RISK_LABEL } from '@/features/map/floodColor'

export interface DeclareZoneDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: DeclareZoneInput) => void
  isSubmitting: boolean
  serverError: string | null
  /** The map's current view as a GeoJSON Polygon, offered as a starting point — most zones are drawn around what someone is looking at. */
  suggestedBoundary?: string
}

const MAX_FILE_BYTES = 8 * 1024 * 1024
const RISKS: RiskLevel[] = ['low', 'medium', 'high']

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })

/**
 * Declare a hazard zone: a risk level and a boundary. The boundary is checked as it is typed, with the checks the backend doesn't make
 * (valid JSON, a single Polygon, a closed ring, real coordinates, no self-crossing — the same rules as a region's boundary) and drawn
 * as a thumbnail, and every problem is listed before anything is sent. `source` is never asked for: the server derives it from who is
 * signed in. The zone is created active, so it is on the citizen map at once. Mounted only while open, so each opening starts empty.
 */
export function DeclareZoneDialog({ open, onClose, onSubmit, isSubmitting, serverError, suggestedBoundary }: DeclareZoneDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <DeclareZoneForm onSubmit={onSubmit} isSubmitting={isSubmitting} serverError={serverError} suggestedBoundary={suggestedBoundary} />}
    </Dialog>
  )
}

function DeclareZoneForm({ onSubmit, isSubmitting, serverError, suggestedBoundary }: Omit<DeclareZoneDialogProps, 'open' | 'onClose'>) {
  const [risk, setRisk] = useState<RiskLevel | ''>('')
  const [text, setText] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const deferred = useDeferredValue(text)
  const parsed = useMemo(() => (deferred.trim() === '' ? null : parseBoundary(deferred, 'hazard zone')), [deferred])
  const boundaryErrors = parsed && !parsed.ok ? parsed.errors : attempted && text.trim() === '' ? ['Paste a GeoJSON Polygon, upload a .geojson file, or use the map’s current view.'] : []

  const submit = () => {
    setAttempted(true)
    const result = parseBoundary(text, 'hazard zone')
    if (!risk || !result.ok) return
    onSubmit({ boundary: result.polygon, risk_level: risk })
  }

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 8 MB.`)
      return
    }
    setFileError(null)
    setText(await readAsText(file))
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogTitle>Declare a hazard zone</DialogTitle>
      <DialogDescription>Flag an area as hazardous without waiting for a model run. It is active straight away, so it shows on the citizen map and counts in "am I in a hazard zone?" checks.</DialogDescription>

      <form
        className="mt-4 flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone-risk" className="font-body text-label font-semibold text-ink-900">
            Risk level
          </label>
          <Select id="zone-risk" value={risk} onChange={(event) => setRisk(event.target.value as RiskLevel | '')} hasError={attempted && !risk}>
            <option value="">Choose a level…</option>
            {RISKS.map((level) => (
              <option key={level} value={level}>
                {RISK_LABEL[level]}
              </option>
            ))}
          </Select>
          {attempted && !risk && <p className="font-body text-body-sm text-status-critical">Choose a risk level.</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone-boundary" className="font-body text-label font-semibold text-ink-900">
            Boundary (GeoJSON Polygon)
          </label>
          <Textarea id="zone-boundary" rows={7} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} placeholder='{"type":"Polygon","coordinates":[[[70.1,22.5],[70.4,22.5],[70.4,22.8],[70.1,22.8],[70.1,22.5]]]}' className="font-mono text-body-sm" hasError={boundaryErrors.length > 0} />
          <div className="flex flex-wrap gap-2">
            {suggestedBoundary && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setText(suggestedBoundary)}>
                Use the map's current view
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              Upload a .geojson file
            </Button>
            <input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" tabIndex={-1} aria-label="Boundary file" onChange={upload} />
          </div>
          {fileError && <p className="font-body text-body-sm text-status-critical">{fileError}</p>}
          {boundaryErrors.length > 0 && (
            <ul role="alert" className="list-disc ps-5 font-body text-body-sm text-status-critical">
              {boundaryErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {parsed?.ok && (
            <div className="flex items-center gap-3 rounded-sm border border-surface-border bg-surface-sunken p-2">
              <BoundaryPreview polygon={parsed.polygon} label="The zone's outline" className="h-16 w-24 flex-none" />
              <p className="font-body text-body-sm text-ink-700">
                A polygon of {parsed.summary.points} points{parsed.droppedAltitude ? ' (altitude values dropped)' : ''}.
              </p>
            </div>
          )}
        </div>

        {serverError && (
          <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {serverError}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" isLoading={isSubmitting}>
            Declare zone
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
