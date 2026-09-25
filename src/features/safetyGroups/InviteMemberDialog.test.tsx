import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { AMNA } from './fixtures'
import { InviteMemberDialog } from './InviteMemberDialog'
import { inviteMemberSchema, type InviteMemberFormValues, type InviteMethod } from './schemas'

function Harness({
  onValid,
  serverError = null,
  isSubmitting = false,
  open = true,
}: {
  onValid: (values: InviteMemberFormValues) => void
  serverError?: string | null
  isSubmitting?: boolean
  open?: boolean
}) {
  const [method, setMethod] = useState<InviteMethod>('email')
  const {
    register,
    handleSubmit,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { method: 'email', recipient: '', connectionType: 'family' },
  })
  return (
    <InviteMemberDialog
      open={open}
      onOpenChange={vi.fn()}
      method={method}
      onMethodChange={(next) => {
        setMethod(next)
        setValue('method', next)
        setValue('recipient', '')
        clearErrors()
      }}
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onValid)}
      isSubmitting={isSubmitting}
      serverError={serverError}
    />
  )
}

describe('InviteMemberDialog', () => {
  it('renders nothing when closed', () => {
    render(<Harness onValid={vi.fn()} open={false} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('asks for their email by default, and says nothing happens until the other person accepts', () => {
    render(<Harness onValid={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Invite a member' })).toBeInTheDocument()
    expect(screen.getByLabelText('Their email')).toHaveAttribute('type', 'email')
    expect(screen.getByText(/the email they use for LittleLife/)).toBeInTheDocument()
    expect(screen.getByText(/only connected once they accept/)).toBeInTheDocument()
  })

  it('submits a trimmed, valid email with the kind — family by default', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText('Their email'), '  Amna@Example.com  ')
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(onValid).toHaveBeenCalledWith({ method: 'email', recipient: 'Amna@Example.com', connectionType: 'family' }, expect.anything())
  })

  it('lets them pick a safety group contact instead', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText('Their email'), 'amna@example.com')
    await userEvent.selectOptions(screen.getByLabelText('They are'), 'safety_group')
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(onValid).toHaveBeenCalledWith({ method: 'email', recipient: 'amna@example.com', connectionType: 'safety_group' }, expect.anything())
  })

  it('asks for the email when it is left empty, and does not submit', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Enter their email address')).toBeInTheDocument()
    expect(onValid).not.toHaveBeenCalled()
  })

  it('explains an email that is not one, and does not submit', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText('Their email'), 'amna@')
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Their email')).toHaveAttribute('aria-invalid', 'true')
    expect(onValid).not.toHaveBeenCalled()
  })

  describe('by Member ID', () => {
    async function switchToId() {
      await userEvent.click(screen.getByRole('button', { name: 'Use a Member ID instead' }))
    }

    it('switches to a Member ID field, with its own instructions and a way back', async () => {
      render(<Harness onValid={vi.fn()} />)

      await switchToId()

      expect(screen.getByLabelText('Their Member ID')).toBeInTheDocument()
      expect(screen.queryByLabelText('Their email')).not.toBeInTheDocument()
      expect(screen.getByText(/copy their Member ID/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Use their email instead' })).toBeInTheDocument()
    })

    it('submits a trimmed ID as method "id"', async () => {
      const onValid = vi.fn()
      render(<Harness onValid={onValid} />)
      await switchToId()

      await userEvent.type(screen.getByLabelText('Their Member ID'), `  ${AMNA}  `)
      await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

      expect(onValid).toHaveBeenCalledWith({ method: 'id', recipient: AMNA, connectionType: 'family' }, expect.anything())
    })

    it('asks for the ID when it is left empty, and explains one that is not a UUID', async () => {
      const onValid = vi.fn()
      render(<Harness onValid={onValid} />)
      await switchToId()

      await userEvent.click(screen.getByRole('button', { name: 'Send request' }))
      expect(await screen.findByText('Enter their Member ID')).toBeInTheDocument()

      await userEvent.type(screen.getByLabelText('Their Member ID'), 'hina@example.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send request' }))
      expect(await screen.findByText(/doesn't look like a Member ID/)).toBeInTheDocument()
      expect(onValid).not.toHaveBeenCalled()
    })

    it('never carries what was typed for one method into the other — switching clears the field and its error', async () => {
      render(<Harness onValid={vi.fn()} />)
      await userEvent.type(screen.getByLabelText('Their email'), 'amna@')
      await userEvent.click(screen.getByRole('button', { name: 'Send request' }))
      await screen.findByText('Enter a valid email address')

      await switchToId()
      expect(screen.getByLabelText('Their Member ID')).toHaveValue('')
      expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Use their email instead' }))
      expect(screen.getByLabelText('Their email')).toHaveValue('')
    })
  })

  it("shows the server's message and disables the buttons while submitting", () => {
    render(<Harness onValid={vi.fn()} serverError="you are already connected to this person" isSubmitting />)

    expect(screen.getByRole('alert')).toHaveTextContent('you are already connected to this person')
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
