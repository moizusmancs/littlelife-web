import { AlertPreferencesLoadState } from '@/features/alertPreferences/AlertPreferencesLoadState'
import { AlertPreferencesPanel } from '@/features/alertPreferences/AlertPreferencesPanel'
import { useAlertPreferences } from '@/features/alertPreferences/useAlertPreferences'

/**
 * Container for /app/profile/alert-preferences — the query and the auto-saving change live in `useAlertPreferences`;
 * AlertPreferencesPanel and its parts are pure presentation. Settings are the caller's own and always exist (created at
 * registration), so there's no empty state: it's loading, failed, or the form.
 */
export function AlertPreferencesPage() {
  const preferences = useAlertPreferences()

  if (preferences.isLoading) return <AlertPreferencesLoadState error={null} onRetry={preferences.retry} />
  if (preferences.loadError || !preferences.prefs) {
    return <AlertPreferencesLoadState error={preferences.loadError ?? 'Something went wrong. Please try again.'} onRetry={preferences.retry} />
  }

  return (
    <AlertPreferencesPanel
      prefs={preferences.prefs}
      onChange={preferences.change}
      status={preferences.status}
      error={preferences.error}
      onDismissError={preferences.dismissError}
    />
  )
}
