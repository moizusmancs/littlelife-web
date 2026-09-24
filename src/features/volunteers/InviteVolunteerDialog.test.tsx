import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { InviteVolunteerDialog } from './InviteVolunteerDialog'
import { inviteVolunteerSchema, type InviteVolunteerFormValues } from './schemas'

function Harness({
  onValid,
  serverError = null,
  isSubmitting = false,
  open = true,
}: {
  onValid: (values: InviteVolunteerFormValues) => void
  serverError?: string | null
  isSubmitting?: boolean
  open?: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteVolunteerFormValues>({
    resolver: zodResolver(inviteVolunteerSchema),
    defaultValues: { email: '' },
  })
  return (
    <InviteVolunteerDialog
      open={open}
      onOpenChange={vi.fn()}
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onValid)}
      isSubmitting={isSubmitting}
      serverError={serverError}
    />
  )
}

describe('InviteVolunteerDialog', () => {
  it('renders nothing when closed', () => {
    render(<Harness onValid={vi.fn()} open={false} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('says the person must already have a citizen account, and that nothing changes until they accept', () => {
    render(<Harness onValid={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Invite a volunteer' })).toBeInTheDocument()
    expect(screen.getByText(/already has a LittleLife account as a citizen/)).toBeInTheDocument()
    expect(screen.getByText(/until they accept/)).toBeInTheDocument()
  })

  it('submits a trimmed, valid email', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText("Volunteer's email"), '  aisha@example.com  ')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect(onValid).toHaveBeenCalledTimes(1)
    expect(onValid.mock.calls[0][0]).toEqual({ email: 'aisha@example.com' })
  })

  it('rejects an empty and a malformed email without submitting', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Enter their email address')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText("Volunteer's email"), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(onValid).not.toHaveBeenCalled()
  })

  it('renders a server error', () => {
    render(<Harness onValid={vi.fn()} serverError="account not found" />)
    expect(screen.getByRole('alert')).toHaveTextContent('account not found')
  })

  it('disables Send while submitting so it cannot be double-fired', () => {
    render(<Harness onValid={vi.fn()} isSubmitting />)
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled()
  })
})
