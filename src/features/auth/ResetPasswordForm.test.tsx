import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from './ResetPasswordForm'
import { resetPasswordSchema, type ResetPasswordFormValues } from './schemas'

function Harness({
  onSubmit,
  serverError = null,
}: {
  onSubmit: (values: ResetPasswordFormValues) => void
  serverError?: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) })

  return (
    <ResetPasswordForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      serverError={serverError}
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

describe('ResetPasswordForm', () => {
  it('always renders the email, code and password fields — there is no link-validity gate', () => {
    renderForm({ onSubmit: vi.fn() })

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Reset code')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
  })

  it('rejects an empty submission', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Enter the reset code from your email')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a short password and a mismatched confirmation', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Reset code'), '123456')
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords once both are 8+ characters', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Reset code'), '123456')
    await userEvent.type(screen.getByLabelText('New password'), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different-password')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the email, code and new password once everything is valid', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Reset code'), '123456')
    await userEvent.type(screen.getByLabelText('New password'), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'correct-password')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(onSubmit).toHaveBeenCalledWith(
      {
        email: 'citizen@example.com',
        token: '123456',
        newPassword: 'correct-password',
        confirmPassword: 'correct-password',
      },
      expect.anything(),
    )
  })

  it('renders a server error banner when given one', () => {
    renderForm({ onSubmit: vi.fn(), serverError: 'invalid or expired code' })
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or expired code')
  })
})
