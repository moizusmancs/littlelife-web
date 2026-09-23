import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm'
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/features/auth/schemas'
import { resetPassword } from '@/api/identity'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Container for /reset-password — owns all form/mutation state, ResetPasswordForm is pure
 * presentation. `email` and `token` are real fields the user can type/edit, not URL-only
 * params — see schemas.ts for why (the reset code has no fixed length, and there's no real
 * mailer in dev, so a click-a-link-only screen has nothing to click). If the URL carries
 * `?email=&token=` (a real emailed link, or one pasted from a server log in dev), those values
 * just pre-fill the form via `defaultValues` — a convenience, not a requirement.
 * No reference mockup exists for this screen; reuses Login's hero panel copy, same as
 * ForgotPasswordPage.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: searchParams.get('email') ?? '',
      token: searchParams.get('token') ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) => resetPassword(values.email, values.token, values.newPassword),
    onSuccess: () => {
      setServerError(null)
      // No tokens come back from this route — there's no session to carry forward
      // (api/00-identity.md) — route to login with a real new password.
      navigate('/login', {
        replace: true,
        state: { infoMessage: 'Your password has been reset. Log in with your new password.' },
      })
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  return (
    <AuthLayout
      heroHeadline="One quick step to get back in."
      heroContent={
        <p className="mt-4.5 max-w-110 font-body text-body-lg text-white/92">
          Choose a new password to keep your account and your safety group secure.
        </p>
      }
      cardWidth={440}
      title="Choose a new password"
      subtitle="Enter the code from your email and a new password for your account."
    >
      <ResetPasswordForm
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        isSubmitting={isSubmitting || mutation.isPending}
        serverError={serverError}
      />
    </AuthLayout>
  )
}
