import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/otp-input'

export interface VerifyEmailFormProps {
  email: string
  code: string
  onCodeChange: (code: string) => void
  onSubmit: () => void
  isSubmitting: boolean
  serverError: string | null
  onResend: () => void
  isResending: boolean
  resendCooldownSeconds: number
}

/**
 * Matches Batch 3 Citizen.dc.html §3b's visual language, adapted for what's real: an email
 * icon and "sent to your email" copy instead of the mockup's SMS/phone framing (verification
 * is email-only, api/00-identity.md — see VerifyEmailPage's own comment), and a single
 * "Resend code" affordance instead of the mockup's separate (non-existent) voice-call option.
 *
 * Purely presentational — the OTP value, countdown, and all mutation state live in
 * VerifyEmailPage.
 */
export function VerifyEmailForm({
  email,
  code,
  onCodeChange,
  onSubmit,
  isSubmitting,
  serverError,
  onResend,
  isResending,
  resendCooldownSeconds,
}: VerifyEmailFormProps) {
  const isComplete = code.length === 6

  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-50">
        <EnvelopeSimpleIcon weight="fill" size={30} className="text-primary-500" />
      </div>
      <h1 className="mt-4.5 font-heading text-h1 font-bold text-ink-900">Enter the 6-digit code</h1>
      <p className="mt-1.5 font-body text-body-md text-ink-500">
        Sent to <span className="font-semibold text-ink-900">{email}</span>
      </p>

      {serverError && (
        <div
          role="alert"
          className="mt-5 w-full rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        >
          {serverError}
        </div>
      )}

      <div className="mt-7 w-full min-w-0">
        <OtpInput
          value={code}
          onChange={onCodeChange}
          hasError={!!serverError}
          disabled={isSubmitting}
          onComplete={onSubmit}
          aria-describedby={serverError ? undefined : 'resend-status'}
        />
      </div>

      <p id="resend-status" className="mt-5 font-body text-body-sm text-ink-500">
        {resendCooldownSeconds > 0 ? (
          <>
            Resend code in{' '}
            <span className="font-semibold tabular-nums text-ink-900">
              0:{resendCooldownSeconds.toString().padStart(2, '0')}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={isResending}
            className="font-semibold text-primary-700 hover:underline disabled:opacity-60"
          >
            {isResending ? 'Sending…' : 'Resend code'}
          </button>
        )}
      </p>

      <Button
        type="button"
        size="lg"
        onClick={onSubmit}
        disabled={!isComplete}
        isLoading={isSubmitting}
        className="mt-6 w-full"
      >
        Verify
      </Button>
    </div>
  )
}
