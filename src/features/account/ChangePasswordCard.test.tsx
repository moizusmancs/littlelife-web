import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { ChangePasswordCard } from './ChangePasswordCard'
import { changePasswordSchema, type ChangePasswordFormValues } from './schemas'

function Harness({ onSubmit, serverError = null }: { onSubmit: (v: ChangePasswordFormValues) => void; serverError?: string | null }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) })

  return (
    <ChangePasswordCard
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      serverError={serverError}
    />
  )
}

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(screen.getByLabelText('Current password'), current)
  if (next) await userEvent.type(screen.getByLabelText('New password'), next)
  if (confirm) await userEvent.type(screen.getByLabelText('Confirm new password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('ChangePasswordCard', () => {
  it('warns up front that it signs the user out everywhere', () => {
    render(<Harness onSubmit={vi.fn()} />)
    expect(screen.getByText(/signs you out everywhere/)).toBeInTheDocument()
  })

  it('rejects an empty submission', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a new password under 8 characters and a mismatched confirmation', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await fill('old-password', 'short', 'short')
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('New password'))
    await userEvent.clear(screen.getByLabelText('Confirm new password'))
    await userEvent.type(screen.getByLabelText('New password'), 'long-enough-1')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different-1')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits current and new password once valid (confirmation is client-only)', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await fill('old-password', 'brand-new-pass', 'brand-new-pass')

    expect(onSubmit).toHaveBeenCalledWith(
      { currentPassword: 'old-password', newPassword: 'brand-new-pass', confirmPassword: 'brand-new-pass' },
      expect.anything(),
    )
  })

  it('renders a server error banner', () => {
    render(<Harness onSubmit={vi.fn()} serverError="invalid email or password" />)
    expect(screen.getByRole('alert')).toHaveTextContent('invalid email or password')
  })
})
