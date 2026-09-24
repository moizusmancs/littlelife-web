import { LifebuoyIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { RegionPicker, type RegionPickerProps } from '@/features/regions/RegionPicker'
import type { RegionChoiceState } from '@/features/regions/useRegionChoice'

export interface OnboardingRegionScreenProps {
  state: RegionChoiceState
  /** For `error`: the message. */
  error: string | null
  onRetry: () => void
  picker: RegionPickerProps
  /** Continue stays disabled until a region is chosen. */
  hasSelection: boolean
  onContinue: () => void
  onSkip: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Onboarding — Region Picker (`WEB_DESIGN_PLAN.md` §6.2, Pattern W-Auth's full-viewport variant): no
 * nav chrome, the brand mark and a de-emphasised "Skip for now" at the top, then a heading, the
 * shared region picker, and Continue. **Optional by design** — the backend has no notion of a
 * complete profile and never requires a home region, so skipping is a plain way forward, not a
 * failure. Unlike the spec's two-column province → district list this uses the shared one-level
 * drill-down (with search), and Continue accepts a region at any level, since the API does.
 * Purely presentational.
 */
export function OnboardingRegionScreen({ state, error, onRetry, picker, hasSelection, onContinue, onSkip, isSubmitting, serverError }: OnboardingRegionScreenProps) {
  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-peach-50 to-surface-base">
      <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-peach-400">
            <LifebuoyIcon weight="fill" className="text-white" size={20} />
          </div>
          <span className="font-heading text-h3 font-bold text-ink-900">LittleLife</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onSkip} disabled={isSubmitting}>
          Skip for now
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 pt-2 pb-10">
        <h1 className="font-heading text-h1 font-bold text-ink-900">Where do you live?</h1>
        <p className="mt-1.5 font-body text-body-md text-ink-500">
          Choose the province, district or tehsil you call home. It's optional, and you can change it any time from your profile.
        </p>

        <div className="mt-6 rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm">
          {state === 'loading' && (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading regions">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
              ))}
            </div>
          )}
          {state === 'error' && (
            <div>
              <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                {error}
              </div>
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
          {state === 'empty' && (
            <p className="font-body text-body-md text-ink-500">There are no regions to choose from yet. You can skip this and set it later.</p>
          )}
          {state === 'ready' && <RegionPicker {...picker} listClassName="max-h-80 md:max-h-96" />}
        </div>

        {serverError && (
          <div role="alert" className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {serverError}
          </div>
        )}

        <Button type="button" size="lg" className="mt-6 w-full" disabled={!hasSelection} isLoading={isSubmitting} onClick={onContinue}>
          Continue
        </Button>
      </main>
    </div>
  )
}
