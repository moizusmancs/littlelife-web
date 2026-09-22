import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { BuildingsIcon, MapPinIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginForm } from '@/features/auth/LoginForm'
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas'
import { getMe, login, type LoginResponse } from '@/api/identity'
import { roleLandingRoute, useAuthStore } from '@/store/auth'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/** Container for /login — owns all form/mutation state, LoginForm is pure presentation. */
export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  const mutation = useMutation<LoginResponse, unknown, LoginFormValues>({
    mutationFn: ({ email, password }) => login(email, password),
    onSuccess: async (data) => {
      setServerError(null)
      // The login response has no `email_verified` field at all — fetch it rather than assume
      // a value (api/00-identity.md; see the comment on identity.login).
      const me = await getMe(data.access_token)
      setAuth(data.access_token, {
        id: data.id,
        email: data.email,
        role: data.role,
        emailVerified: me.email_verified,
      })
      navigate(roleLandingRoute(data.role), { replace: true })
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return (
    <AuthLayout
      heroHeadline="Flood safety, from your neighbours and the people who respond."
      heroContent={
        <>
          <p className="mt-4.5 max-w-110 font-body text-body-lg text-white/92">
            Community reports, verified alerts and safe routes for Pakistan — one account for
            citizens, NGOs and NDMA staff.
          </p>
          <div className="mt-11 flex gap-7 font-body text-label font-medium text-white/90">
            <span className="flex items-center gap-1.5">
              <UsersThreeIcon size={16} /> 212k citizens
            </span>
            <span className="flex items-center gap-1.5">
              <BuildingsIcon size={16} /> 48 NGOs
            </span>
            <span className="flex items-center gap-1.5">
              <MapPinIcon size={16} /> 134 districts
            </span>
          </div>
        </>
      }
      secondCircle
      cardWidth={440}
      title="Welcome back"
      subtitle="Log in to continue to LittleLife."
    >
      <LoginForm
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        isSubmitting={isSubmitting || mutation.isPending}
        serverError={serverError}
      />
    </AuthLayout>
  )
}
