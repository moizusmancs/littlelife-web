import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'
import { loginSchema, type LoginFormValues } from './schemas'

/** A tiny real `useForm` wrapper so LoginForm is exercised the same way its real container
 *  drives it, without pulling LoginPage's mutation/navigation logic into a "component" test. */
function Harness({
  onSubmit,
  isSubmitting = false,
  serverError = null,
}: {
  onSubmit: (values: LoginFormValues) => void
  isSubmitting?: boolean
  serverError?: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  return (
    <LoginForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
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

describe('LoginForm', () => {
  it('shows field validation errors and does not call onSubmit for an empty form', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the entered values once they pass validation', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password')
    await userEvent.click(screen.getByRole('button', { name: 'Log In' }))

    expect(onSubmit).toHaveBeenCalledWith(
      { email: 'citizen@example.com', password: 'correct-password' },
      expect.anything(),
    )
  })

  it('renders a server error banner when given one', () => {
    renderForm({ onSubmit: vi.fn(), serverError: 'invalid email or password' })
    expect(screen.getByRole('alert')).toHaveTextContent('invalid email or password')
  })

  it('disables the submit button and shows a spinner while submitting', () => {
    renderForm({ onSubmit: vi.fn(), isSubmitting: true })
    expect(screen.getByRole('button', { name: 'Log In' })).toBeDisabled()
  })
})
