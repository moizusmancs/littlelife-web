import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { AuthLayout } from '@/layouts/AuthLayout'
import { VerifyEmailForm } from '@/features/auth/VerifyEmailForm'
import { StepIndicator } from '@/features/onboarding/StepIndicator'
import { verifyEmail, resendVerification } from '@/api/identity'
import { getProfile } from '@/api/profiling'
import { nextAuthRoute, useAuthStore } from '@/store/auth'
import type { ApiErrorBody } from '@/api/types'

const RESEND_COOLDOWN_SECONDS = 60

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Container for /verify-email — mandatory onboarding step 1 of 2 (RequireUnverifiedSession
 * guards this route; see routes/guards.tsx). Owns all OTP/mutation/countdown state,
 * VerifyEmailForm is pure presentation.
 *
 * Adapted from Batch 3 Citizen.dc.html §3b for what's real: verification is email-only
 * (api/00-identity.md — the OTP is emailed, never texted), so this drops the mockup's SMS/
 * phone framing and "try a voice call" option entirely rather than build UI for a delivery
 * channel the backend doesn't have.
 */
export function VerifyEmailPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [code, setCode] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const verifyMutation = useMutation({
    mutationFn: () => verifyEmail(user!.email, code),
    onSuccess: async (data) => {
      setServerError(null)
      // A fresh token reflecting email_verified: true — the doc's explicit instruction is to
      // replace the stored token with this one, not keep the pre-verification one around.
      const profile = await getProfile(data.access_token)
      const updatedUser = { ...user!, emailVerified: true, profileComplete: profile.name !== '' }
      setAuth(data.access_token, updatedUser)
      navigate(nextAuthRoute(updatedUser), { replace: true })
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  const resendMutation = useMutation({
    mutationFn: () => resendVerification(user!.email),
    onSuccess: () => {
      setServerError(null)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    },
    onError: (error) => {
      // "account already verified" (409) is favorable news reaching us through an error
      // channel, not a real failure — most likely another tab completed verification first.
      // Move the user forward instead of showing a scary red banner for a good outcome.
      if (error instanceof AxiosError && error.response?.status === 409) {
        navigate(nextAuthRoute({ ...user!, emailVerified: true }), { replace: true })
        return
      }
      setServerError(extractErrorMessage(error))
    },
  })

  if (!user) return null

  return (
    <AuthLayout
      heroPreHeadline={<StepIndicator steps={['Details', 'Verify', 'Profile']} currentIndex={1} />}
      heroHeadline="One quick check so alerts reach the right account."
      heroContent={null}
      cardWidth={440}
    >
      <VerifyEmailForm
        email={user.email}
        code={code}
        onCodeChange={setCode}
        onSubmit={() => verifyMutation.mutate()}
        isSubmitting={verifyMutation.isPending}
        serverError={serverError}
        onResend={() => resendMutation.mutate()}
        isResending={resendMutation.isPending}
        resendCooldownSeconds={cooldown}
      />
    </AuthLayout>
  )
}
