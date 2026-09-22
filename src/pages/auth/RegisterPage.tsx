import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { AuthLayout } from '@/layouts/AuthLayout'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { registerSchema, type RegisterFormValues } from '@/features/auth/schemas'
import { getMe, login, register as registerAccount } from '@/api/identity'
import { nextAuthRoute, useAuthStore } from '@/store/auth'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

const HERO_POINTS = [
  'Alerts for your exact location',
  'Report hazards and see verified community reports',
  'Family check-ins and safe routes to shelters',
]

/**
 * Container for /register — owns all form/mutation state, RegisterForm is pure presentation.
 *
 * Scoped deliberately to exactly what `POST /auth/register` accepts (`{email, password}`) —
 * per the product decision, name/phone/language are NOT collected here. A newly-registered
 * account is unverified and profile-incomplete; it goes through a mandatory onboarding chain
 * it cannot skip (email OTP verification first, then profile completion via PATCH routes,
 * built in the phases right after this one) before it can use the app.
 *
 * Handles a real backend asymmetry: unlike login/refresh, `POST /auth/register` never sets the
 * web session cookie (it always returns `refresh_token` as a plain body field instead, even for
 * web clients — api/00-identity.md). Rather than special-case the auth store around a
 * non-cookie-backed session, this immediately calls the real `login` with the same credentials
 * right after registering succeeds, exactly as the doc itself recommends — establishing a
 * normal, cookie-backed session the same way every other screen expects.
 */
export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register: registerField,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { agreedToTerms: false },
  })

  const mutation = useMutation({
    mutationFn: async ({ email, password }: RegisterFormValues) => {
      await registerAccount(email, password)
      // Establish the real cookie-backed session rather than relying on register's own
      // (cookie-less) token pair — see the class doc comment above.
      const loginResult = await login(email, password)
      const me = await getMe(loginResult.access_token)
      return { loginResult, me }
    },
    onSuccess: ({ loginResult, me }) => {
      setServerError(null)
      // No need to fetch GET /profile here: a freshly-registered account's profile is
      // documented to always start with name: "" (api/05-profiling.md), created atomically
      // with the account itself — profileComplete is knowably false without an extra round trip.
      const user = {
        id: loginResult.id,
        email: loginResult.email,
        role: loginResult.role,
        emailVerified: me.email_verified,
        profileComplete: false,
      }
      setAuth(loginResult.access_token, user)
      navigate(nextAuthRoute(user), { replace: true })
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return (
    <AuthLayout
      heroHeadline="Join 212,000 neighbours keeping each other safe."
      heroContent={
        <div className="mt-7 flex flex-col gap-3.5 font-body text-body-lg font-medium">
          {HERO_POINTS.map((point) => (
            <span key={point} className="flex items-center gap-2.5">
              <CheckCircleIcon weight="fill" size={20} />
              {point}
            </span>
          ))}
        </div>
      }
      cardWidth={460}
      title="Create your account"
      subtitle="Citizen accounts only. NGO staff are invited by their organisation."
    >
      <RegisterForm
        register={registerField}
        errors={errors}
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        isSubmitting={isSubmitting || mutation.isPending}
        serverError={serverError}
        passwordValue={watch('password') ?? ''}
      />
    </AuthLayout>
  )
}
