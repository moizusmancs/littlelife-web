import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { AuthLayout } from '@/layouts/AuthLayout'
import { OnboardingProfileForm } from '@/features/onboarding/OnboardingProfileForm'
import { onboardingProfileSchema, type OnboardingProfileFormValues } from '@/features/onboarding/schemas'
import { StepIndicator } from '@/features/onboarding/StepIndicator'
import { updateProfile } from '@/api/profiling'
import { ONBOARDING_REGION_ROUTE, roleLandingRoute, useAuthStore } from '@/store/auth'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Container for /app/onboarding/profile — mandatory onboarding step 2 of 2
 * (RequireIncompleteProfile guards this route; see routes/guards.tsx). A citizen continues to the
 * optional home-region step (/app/onboarding/region), which can be skipped. Owns all form/mutation
 * state, OnboardingProfileForm is pure presentation.
 *
 * The only field this collects is `name`, because it's the only field `PATCH /profile`
 * accepts (api/05-profiling.md) — see OnboardingProfileForm's own comment on why there's no
 * reference mockup this matches pixel-for-pixel.
 */
export function OnboardingProfilePage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const markProfileComplete = useAuthStore((s) => s.markProfileComplete)
  const setPostOnboardingRoute = useAuthStore((s) => s.setPostOnboardingRoute)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingProfileFormValues>({ resolver: zodResolver(onboardingProfileSchema) })

  const mutation = useMutation({
    mutationFn: (values: OnboardingProfileFormValues) => updateProfile({ name: values.name }),
    onSuccess: () => {
      setServerError(null)
      // A citizen gets the optional home-region step next; staff go straight to their console. The
      // route is also handed to the guard via the store, because marking the profile complete makes
      // RequireIncompleteProfile redirect in the same update and its redirect would win over `navigate`.
      const next = role === 'user' || role === undefined ? ONBOARDING_REGION_ROUTE : roleLandingRoute(role)
      if (next === ONBOARDING_REGION_ROUTE) setPostOnboardingRoute(next)
      markProfileComplete()
      navigate(next, { replace: true })
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return (
    <AuthLayout
      heroPreHeadline={<StepIndicator steps={['Details', 'Verify', 'Profile']} currentIndex={2} />}
      heroHeadline="Almost there — just one more thing."
      heroContent={
        <p className="mt-4.5 max-w-110 font-body text-body-lg text-white/92">
          Your name helps NGOs and the people in your safety group recognise your reports and
          check-ins as genuinely yours.
        </p>
      }
      cardWidth={440}
    >
      <OnboardingProfileForm
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        isSubmitting={isSubmitting || mutation.isPending}
        serverError={serverError}
      />
    </AuthLayout>
  )
}
