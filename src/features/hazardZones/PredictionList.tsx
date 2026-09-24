import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import type { FloodPrediction } from '@/api/floodIntel'
import { RISK_LABEL, confidencePercent, probabilityToColor } from '@/features/map/floodColor'
import { riskTone } from '@/features/map/mapModel'

const TONE = { critical: 'critical', caution: 'caution', safe: 'safe', neutral: 'info' } as const
const validWindow = (from: string, to: string) => `${format(parseISO(from), 'd MMM HH:mm')} – ${format(parseISO(to), 'd MMM HH:mm')}`

/**
 * The model's raw output, newest first: when it was generated, by which model version, how confident it was (a bar on the map's own colour
 * ramp) and the window it is valid for. `uncertainty_score` and the raster link are shown only when there is one — this deployment's model
 * never produces either. Purely presentational.
 */
export function PredictionList({ predictions }: { predictions: readonly FloodPrediction[] }) {
  return (
    <ul aria-label="Flood predictions">
      {predictions.map((prediction) => (
        <li key={prediction.id} className="flex flex-col gap-2 border-b border-surface-border px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-body text-body-md font-semibold text-ink-900">
              <Badge tone={TONE[riskTone(prediction.risk_level)]}>{RISK_LABEL[prediction.risk_level]} risk</Badge>
              <span className="truncate">{prediction.model_version}</span>
            </p>
            <p className="mt-0.5 font-body text-body-sm text-ink-500">
              Generated {formatDistanceToNowStrict(parseISO(prediction.generated_at), { addSuffix: true })} · valid {validWindow(prediction.valid_from, prediction.valid_until)}
              {prediction.uncertainty_score !== undefined ? ` · uncertainty ${confidencePercent(prediction.uncertainty_score)}%` : ''}
            </p>
          </div>
          <div className="flex w-full flex-none items-center gap-2 md:w-44">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="Model confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidencePercent(prediction.confidence_score)}>
              <div className="h-full rounded-full" style={{ width: `${confidencePercent(prediction.confidence_score)}%`, background: probabilityToColor(prediction.confidence_score) }} />
            </div>
            <span className="w-10 text-end font-body text-body-sm font-semibold text-ink-900">{confidencePercent(prediction.confidence_score)}%</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
