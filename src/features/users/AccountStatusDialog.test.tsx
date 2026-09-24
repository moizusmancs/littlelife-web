import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSummary } from '@/api/identity'
import { AccountStatusDialog, type StatusChangeTarget } from './AccountStatusDialog'
import { statusReasonSchema, type StatusReasonFormValues } from './schemas'

const base: AccountSummary = {
  id: 'a-1',
  email: 'aisha@example.com',
  role: 'user',
  status: 'active',
  email_verified: true,
  created_at: '2026-09-20T06:44:36Z',
  updated_at: '2026-09-20T06:44:36Z',
}

function Harness({
  target,
  onValid = vi.fn(),
  onClose = vi.fn(),
  serverError = null,
}: {
  target: StatusChangeTarget | null
  onValid?: (values: StatusReasonFormValues) => void
  onClose?: () => void
  serverError?: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StatusReasonFormValues>({ resolver: zodResolver(statusReasonSchema), defaultValues: { reason: '' } })
  return (
    <AccountStatusDialog
      target={target}
      onClose={onClose}
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onValid)}
      isSubmitting={false}
      serverError={serverError}
    />
  )
}

describe('AccountStatusDialog', () => {
  it('is closed with no target', () => {
    render(<Harness target={null} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('for a suspension: names the account, warns they are signed out everywhere, says the reason is saved', () => {
    render(<Harness target={{ account: base, action: 'suspend' }} />)

    expect(screen.getByRole('heading', { name: 'Suspend aisha@example.com?' })).toBeInTheDocument()
    expect(screen.getByText(/signed out everywhere immediately/)).toBeInTheDocument()
    expect(screen.getByText(/saved to their moderation history/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suspend account' })).toBeInTheDocument()
  })

  it('for a platform admin: adds that suspending removes their console access', () => {
    render(<Harness target={{ account: { ...base, role: 'super_admin' }, action: 'suspend' }} />)

    expect(screen.getByText(/platform admin account/)).toBeInTheDocument()
  })

  it('for a reactivation: says they can log in again, and warns when their email was never verified', () => {
    const { rerender } = render(<Harness target={{ account: { ...base, status: 'suspended' }, action: 'reactivate' }} />)
    expect(screen.getByRole('heading', { name: 'Reactivate aisha@example.com?' })).toBeInTheDocument()
    expect(screen.getByText(/able to log in again/)).toBeInTheDocument()
    expect(screen.queryByText(/still unverified/)).not.toBeInTheDocument()

    rerender(<Harness target={{ account: { ...base, status: 'suspended', email_verified: false }, action: 'reactivate' }} />)
    expect(screen.getByText(/still unverified/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate account' })).toBeInTheDocument()
  })

  it('needs a reason: blank or whitespace never submits, a real one does (trimmed)', async () => {
    const onValid = vi.fn()
    render(<Harness target={{ account: base, action: 'suspend' }} onValid={onValid} />)

    await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
    expect(await screen.findByText('Enter a reason')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Reason'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
    expect(onValid).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Reason'), ' Repeated false reports ')
    await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
    expect(onValid.mock.calls[0][0]).toEqual({ reason: 'Repeated false reports' })
  })

  it('renders a server error, and reports Cancel', async () => {
    const onClose = vi.fn()
    render(<Harness target={{ account: base, action: 'suspend' }} serverError="account not found" onClose={onClose} />)

    expect(screen.getByRole('alert')).toHaveTextContent('account not found')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
