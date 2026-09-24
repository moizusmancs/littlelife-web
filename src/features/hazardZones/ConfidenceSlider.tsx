import { confidencePercent } from '@/features/map/floodColor'

export interface ConfidenceSliderProps {
  /** 0–1. */
  value: number
  onChange: (value: number) => void
}

/**
 * "Show model zones with at least N% confidence" — the admin overlay's `min_confidence`. Zones an admin or NGO declared by hand have no
 * confidence and always stay. 0 shows everything, which is what the citizen map never does (it never shows a model zone under 34%).
 * Purely presentational.
 */
export function ConfidenceSlider({ value, onChange }: ConfidenceSliderProps) {
  const percent = confidencePercent(value)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="min-confidence" className="flex items-center justify-between font-body text-body-sm font-medium text-ink-700">
        <span>Minimum model confidence</span>
        <span className="font-semibold text-ink-900">{percent === 0 ? 'Everything' : `${percent}%`}</span>
      </label>
      <input
        id="min-confidence"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={percent === 0 ? 'Show every model zone' : `At least ${percent}% confidence`}
        className="w-full accent-primary-500"
      />
      <p className="font-body text-body-sm text-ink-500">Zones an admin or NGO declared always show.</p>
    </div>
  )
}
