import { CITIZEN_MODEL_FLOOR, RISK_COLOR, RISK_LABEL, confidencePercent, probabilityToColor } from './floodColor'
import { TONE_COLOR } from './placeIcon'
import type { Tone } from './mapModel'

const ramp = `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map(probabilityToColor).join(', ')})`

const MARKERS: ReadonlyArray<{ tone: Tone; label: string }> = [
  { tone: 'safe', label: 'Open / safe' },
  { tone: 'caution', label: 'At risk' },
  { tone: 'critical', label: 'Closed / damaged' },
  { tone: 'neutral', label: 'Status unknown' },
]

/**
 * What the colours on the map mean, in the map's own terms. Flood zones are outlined by risk level and filled by the
 * model's confidence on a continuous ramp (a zone staff declared by hand has no confidence, so it is one flat colour).
 * Confidence is how sure the model is about that zone's risk — not how much of it is flooded. Purely presentational.
 */
export function MapLegend({ showCitizenFloor = true }: { /** The citizen map never shows a model zone under 34% confidence and says so; the admin map shows everything and has a slider. */ showCitizenFloor?: boolean }) {
  return (
    <div className="flex flex-col gap-4 font-body text-body-sm text-ink-700">
      <section aria-labelledby="legend-flood">
        <h3 id="legend-flood" className="mb-2 font-heading text-body-md font-bold text-ink-900">
          Flood zones
        </h3>
        <div className="h-2.5 rounded-full border border-surface-border" style={{ background: ramp }} aria-hidden="true" />
        <div className="mt-1 flex justify-between text-ink-500">
          <span>Lower model confidence</span>
          <span>Higher</span>
        </div>
        {showCitizenFloor && <p className="mt-1.5 text-ink-500">Model zones under {confidencePercent(CITIZEN_MODEL_FLOOR)}% confidence aren't shown.</p>}
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {(['high', 'medium', 'low'] as const).map((risk) => (
            <li key={risk} className="flex items-center gap-2">
              <span className="size-3 flex-none rounded-xs border-2" style={{ borderColor: RISK_COLOR[risk] }} aria-hidden="true" />
              {RISK_LABEL[risk]} risk outline
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="size-3 flex-none rounded-xs border-2" style={{ borderColor: RISK_COLOR.medium, background: `${RISK_COLOR.medium}59` }} aria-hidden="true" />
            Declared by staff: one flat colour
          </li>
        </ul>
      </section>

      <section aria-labelledby="legend-places">
        <h3 id="legend-places" className="mb-2 font-heading text-body-md font-bold text-ink-900">
          Places
        </h3>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {MARKERS.map((marker) => (
            <li key={marker.tone} className="flex items-center gap-2">
              <span className="size-3 flex-none rounded-full border-2 border-white shadow-sm" style={{ background: TONE_COLOR[marker.tone] }} aria-hidden="true" />
              {marker.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
