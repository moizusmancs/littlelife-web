import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PROFILE_QUERY_KEY, updateProfile } from '@/api/profiling'
import { extractErrorMessage } from '@/api/errors'
import { OnboardingRegionScreen } from '@/features/onboarding/OnboardingRegionScreen'
import { useRegionChoice } from '@/features/regions/useRegionChoice'
import { roleLandingRoute, useAuthStore } from '@/store/auth'

/**
 * Container for /app/onboarding/region — the optional last step after the mandatory ones (verify
 * email, then name), reached from the name step and never enforced by a guard: `PATCH /profile`
 * accepts a `home_region_id` but the backend never requires one, so Skip goes straight to the app and
 * nothing remembers that it was skipped (the home region can be set later on Edit Profile). Owns the
 * region list and picker (via `useRegionChoice`) and the save; OnboardingRegionScreen is pure
 * presentation. A save writes the re-read profile into the shared profile cache, so the profile
 * sidebar shows the region without another request.
 */
export function OnboardingRegionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const choice = useRegionChoice(true)
  const [serverError, setServerError] = useState<string | null>(null)

  // Arriving here is what the name step's one-shot "next stop" was for; drop it so it never applies twice.
  const clearPostOnboardingRoute = useAuthStore((s) => s.clearPostOnboardingRoute)
  useEffect(() => clearPostOnboardingRoute(), [clearPostOnboardingRoute])

  const finish = () => navigate(roleLandingRoute('user'), { replace: true })

  const save = useMutation({
    mutationFn: (regionId: string) => updateProfile({ homeRegionId: regionId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated)
      finish()
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return (
    <OnboardingRegionScreen
      state={choice.state}
      error={choice.error}
      onRetry={choice.retry}
      picker={choice.pickerProps}
      hasSelection={choice.selected !== null}
      onContinue={() => {
        setServerError(null)
        if (choice.selected) save.mutate(choice.selected.id)
      }}
      onSkip={finish}
      isSubmitting={save.isPending}
      serverError={serverError}
    />
  )
}
