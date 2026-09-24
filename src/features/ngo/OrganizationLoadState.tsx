import { Button } from '@/components/ui/button'

export interface OrganizationLoadStateProps {
  /** `null` while `GET /ngo/me` is in flight (skeleton); a message once it has failed. */
  error: string | null
  onRetry: () => void
}

/** Loading skeleton / load-failure card for /ngo/settings/organization. Purely presentational. */
export function OrganizationLoadState({ error, onRetry }: OrganizationLoadStateProps) {
  if (error) {
    return (
      <div className="max-w-205 rounded-md border border-surface-border bg-surface-raised p-6">
        <h1 className="font-heading text-h2 font-bold text-ink-900">Organization Settings</h1>
        <div
          role="alert"
          className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        >
          {error}
        </div>
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div
      className="flex max-w-205 flex-col gap-5"
      aria-busy="true"
      aria-label="Loading your organisation"
    >
      <div aria-hidden="true">
        <div className="h-7 w-56 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
      </div>
      <div className="rounded-md border border-surface-border bg-surface-raised p-6" aria-hidden="true">
        <div className="flex items-center gap-4">
          <div className="size-16 flex-none animate-pulse rounded-lg bg-surface-sunken" />
          <div className="min-w-0 flex-1">
            <div className="h-5 w-48 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded-sm bg-surface-sunken" />
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="h-12 animate-pulse rounded-sm bg-surface-sunken sm:col-span-2" />
          <div className="h-12 animate-pulse rounded-sm bg-surface-sunken" />
          <div className="h-12 animate-pulse rounded-sm bg-surface-sunken" />
        </div>
      </div>
    </div>
  )
}
