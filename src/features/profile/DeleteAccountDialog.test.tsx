import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { deleteAccountSchema, type DeleteAccountFormValues } from './schemas'

function Harness({
  onSubmit,
  open = true,
  onOpenChange = vi.fn(),
  serverError = null,
}: {
  onSubmit: (values: DeleteAccountFormValues) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  serverError?: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteAccountFormValues>({ resolver: zodResolver(deleteAccountSchema) })

  return (
    <DeleteAccountDialog
      open={open}
      onOpenChange={onOpenChange}
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      serverError={serverError}
    />
  )
}

describe('DeleteAccountDialog', () => {
  it('renders nothing when closed', () => {
    render(<Harness onSubmit={vi.fn()} open={false} />)
    expect(screen.queryByRole('heading', { name: 'Delete your account?' })).not.toBeInTheDocument()
  })

  it('rejects an empty password', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the entered password', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Current password'), 'my-real-password')
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(onSubmit).toHaveBeenCalledWith({ currentPassword: 'my-real-password' }, expect.anything())
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    render(<Harness onSubmit={vi.fn()} onOpenChange={onOpenChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders a server error banner when given one', () => {
    render(<Harness onSubmit={vi.fn()} serverError="invalid email or password" />)
    expect(screen.getByRole('alert')).toHaveTextContent('invalid email or password')
  })
})
