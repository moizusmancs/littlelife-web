import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { forgotPasswordSchema, type ForgotPasswordFormValues } from './schemas'

function Harness({
  onSubmit,
  isSubmitted = false,
  submittedEmail = '',
  serverError = null,
}: {
  onSubmit: (values: ForgotPasswordFormValues) => void
  isSubmitted?: boolean
  submittedEmail?: string
  serverError?: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) })

  return (
    <ForgotPasswordForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      serverError={serverError}
      isSubmitted={isSubmitted}
      submittedEmail={submittedEmail}
    />
  )
}

function renderForm(props: Parameters<typeof Harness>[0]) {
  return render(
    <MemoryRouter>
      <Harness {...props} />
    </MemoryRouter>,
  )
}

describe('ForgotPasswordForm', () => {
  it('rejects an empty submission', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Code' }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the entered email once valid', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Code' }))

    expect(onSubmit).toHaveBeenCalledWith({ email: 'citizen@example.com' }, expect.anything())
  })

  it('shows the confirmation panel instead of the form once submitted — the only outcome, never an error state for an unknown email', () => {
    renderForm({ onSubmit: vi.fn(), isSubmitted: true, submittedEmail: 'citizen@example.com' })

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('citizen@example.com')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Log In' })).toBeInTheDocument()
  })

  it('links the confirmation panel forward to Reset Password with the submitted email prefilled', () => {
    renderForm({ onSubmit: vi.fn(), isSubmitted: true, submittedEmail: 'citizen@example.com' })

    const continueLink = screen.getByRole('link', { name: 'I have a code — Reset password' })
    expect(continueLink).toHaveAttribute('href', '/reset-password?email=citizen%40example.com')
  })
})
