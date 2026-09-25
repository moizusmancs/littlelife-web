import { InfoIcon } from '@phosphor-icons/react'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { AlertPreferences, AlertPreferencesPatch, AlertSeverity } from '@/api/profiling'
import { CHANNELS, languageOptions, SEVERITIES, type SaveStatus } from './alertPreferences'
import { ChannelRow } from './ChannelRow'

export interface AlertPreferencesPanelProps {
  prefs: AlertPreferences
  /** Called with **only the field that changed** — the backend wants a partial patch. */
  onChange: (patch: AlertPreferencesPatch) => void
  status: SaveStatus
  /** Why the last change couldn't be saved (the screen has already put the value back). */
  error: string | null
  onDismissError: () => void
}

const STATUS_TEXT: Record<SaveStatus, string> = { idle: '', saving: 'Saving…', saved: 'All changes saved' }

/**
 * /app/profile/alert-preferences — channels, the minimum severity and the language of alerts, from
 * `GET`/`PATCH /profile/alert-preferences`. **Every change saves as soon as it's made** (no Save button — the design
 * plan's settings convention), sending only that one field; a live status beside the title says "Saving…" then "All
 * changes saved", and a change the server refused puts the old value back and says why. The mockup (Batch 3 §3g)
 * also has quiet hours and saved alert locations, which the API doesn't have, so they aren't drawn. SMS, WhatsApp and
 * voice calls go to a phone number and the account has none on file (the API stores no phone number), which the
 * screen says once under the channels rather than letting a switch imply a delivery that can't happen.
 * Purely presentational.
 */
export function AlertPreferencesPanel({ prefs, onChange, status, error, onDismissError }: AlertPreferencesPanelProps) {
  return (
    <div className="flex max-w-140 flex-col gap-5">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-heading text-h2 font-bold text-ink-900">Alert preferences</h1>
          <p role="status" aria-live="polite" className="flex-none font-body text-body-sm text-ink-500">
            {STATUS_TEXT[status]}
          </p>
        </div>
        <p className="mt-1 font-body text-body-md text-ink-500">Choose how alerts reach you, how serious one has to be, and in which language. Changes save as you make them.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={onDismissError} className="flex-none rounded-sm font-semibold text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500">
            Dismiss
          </button>
        </div>
      )}

      <section className="rounded-md border border-surface-border bg-surface-raised px-6 py-5 shadow-sm" aria-labelledby="channels-heading">
        <h2 id="channels-heading" className="font-heading text-h3 font-bold text-ink-900">
          Channels
        </h2>
        <ul className="mt-1 divide-y divide-surface-border">
          {CHANNELS.map((channel) => (
            <ChannelRow key={channel.key} channel={channel} checked={prefs[channel.key]} onCheckedChange={(checked) => onChange({ [channel.key]: checked })} />
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-sunken px-3 py-2.5 font-body text-body-sm text-ink-700">
          <InfoIcon size={16} className="mt-px flex-none text-ink-500" aria-hidden="true" />
          SMS, WhatsApp and voice calls go to a phone number, and your account doesn't have one on file yet.
        </p>
      </section>

      <section className="rounded-md border border-surface-border bg-surface-raised px-6 py-5 shadow-sm" aria-labelledby="severity-heading">
        <h2 id="severity-heading" className="font-heading text-h3 font-bold text-ink-900">
          Minimum severity
        </h2>
        <p className="mt-1 font-body text-body-sm text-ink-500">Alerts below this are held back. Critical emergencies always reach you.</p>
        <fieldset className="mt-4">
          <legend className="sr-only">Minimum severity</legend>
          <div className="flex flex-col gap-2">
            {SEVERITIES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-surface-border bg-surface-raised px-3.5 py-3 has-checked:border-2 has-checked:border-primary-500 has-checked:bg-primary-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-500"
              >
                <input
                  type="radio"
                  name="minimum-severity"
                  value={option.value}
                  checked={prefs.minimum_severity === option.value}
                  onChange={() => onChange({ minimum_severity: option.value as AlertSeverity })}
                  className="sr-only"
                />
                <span className="block">
                  <span className="block font-body text-body-md font-semibold text-ink-900">{option.label}</span>
                  <span className="block font-body text-body-sm text-ink-500">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-md border border-surface-border bg-surface-raised px-6 py-5 shadow-sm" aria-labelledby="language-heading">
        <h2 id="language-heading" className="font-heading text-h3 font-bold text-ink-900">
          Language
        </h2>
        <p className="mt-1 font-body text-body-sm text-ink-500">The language alerts are sent in.</p>
        <div className="mt-4 max-w-xs">
          <Label htmlFor="alert-language" className="sr-only">
            Alert language
          </Label>
          <Select id="alert-language" value={prefs.language} onChange={(event) => onChange({ language: event.target.value })}>
            {languageOptions(prefs.language).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </section>
    </div>
  )
}
