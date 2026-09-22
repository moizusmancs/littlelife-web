import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { RegisterForm } from './RegisterForm'
import { registerSchema, type RegisterFormValues } from './schemas'

function Harness({
  onSubmit,
  isSubmitting = false,
  serverError = null,
}: {
  onSubmit: (values: RegisterFormValues) => void
  isSubmitting?: boolean
  serverError?: string | null
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema), defaultValues: { agreedToTerms: false } })

  return (
    <RegisterForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      serverError={serverError}
      passwordValue={watch('password') ?? ''}
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

describe('RegisterForm', () => {
  it('does not show name, phone, or language fields — the backend has no capability for them', () => {
    renderForm({ onSubmit: vi.fn() })

    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/mobile/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/preferred language/i)).not.toBeInTheDocument()
  })

  it('rejects an empty submission with real field errors, not a network call', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('You must agree to the Terms and Privacy Policy to continue')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different-password')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with valid matching values and an accepted terms checkbox', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'correct-password')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onSubmit).toHaveBeenCalledWith(
      {
        email: 'citizen@example.com',
        password: 'correct-password',
        confirmPassword: 'correct-password',
        agreedToTerms: true,
      },
      expect.anything(),
    )
  })

  it("shows a live password strength hint that isn't shown before 8 characters", async () => {
    renderForm({ onSubmit: vi.fn() })
    const passwordField = screen.getByLabelText('Password', { exact: true })

    await userEvent.type(passwordField, 'short')
    expect(screen.queryByText(/weak|fair|good|strong/i)).not.toBeInTheDocument()

    await userEvent.type(passwordField, '1234567890')
    expect(screen.getByText(/weak|fair|good|strong/i)).toBeInTheDocument()
  })

  it('renders a server error banner when given one', () => {
    renderForm({ onSubmit: vi.fn(), serverError: 'email already registered' })
    expect(screen.getByRole('alert')).toHaveTextContent('email already registered')
  })
})
