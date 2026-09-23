import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { BuildingsIcon, MapPinIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ForgotPasswordForm } from '@/features/auth/ForgotPasswordForm'
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/features/auth/schemas'
import { forgotPassword } from '@/api/identity'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Container for /forgot-password — owns all form/mutation state, ForgotPasswordForm is pure
 * presentation. No reference mockup exists for this screen (see ForgotPasswordForm's own
 * comment); reuses Login's exact hero panel content since it's the same brand context, not
 * invented copy.
 */
export function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) })

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordFormValues) => forgotPassword(values.email),
    onSuccess: (_data, values) => {
      setServerError(null)
      setSubmittedEmail(values.email)
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
      title={mutation.isSuccess ? undefined : 'Forgot your password?'}
      subtitle={mutation.isSuccess ? undefined : "Enter your email and we'll send you a code to reset it."}
    >
      <ForgotPasswordForm
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        isSubmitting={isSubmitting || mutation.isPending}
        serverError={serverError}
        isSubmitted={mutation.isSuccess}
        submittedEmail={submittedEmail}
      />
    </AuthLayout>
  )
}
