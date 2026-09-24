import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { LogModerationDialog } from './LogModerationDialog'
import { moderationActionSchema, type ModerationActionFormValues } from './schemas'

function Harness({ onValid = vi.fn(), open = true, serverError = null }: { onValid?: (v: ModerationActionFormValues) => void; open?: boolean; serverError?: string | null }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ModerationActionFormValues>({
    resolver: zodResolver(moderationActionSchema),
    defaultValues: { actionType: 'warn', reason: '' },
  })
  return (
    <LogModerationDialog
      open={open}
      onOpenChange={vi.fn()}
      accountEmail="aisha@example.com"
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onValid)}
      isSubmitting={false}
      serverError={serverError}
    />
  )
}

describe('LogModerationDialog', () => {
  it('is closed when not open', () => {
    render(<Harness open={false} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it("says plainly that logging does not change the account's status", () => {
    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'Log a moderation action' })).toBeInTheDocument()
    expect(screen.getByText(/only records the decision/)).toBeInTheDocument()
    expect(screen.getByText(/doesn't change the account's status/)).toBeInTheDocument()
  })

  it('offers the four action types, defaulting to Warn', () => {
    render(<Harness />)

    expect(screen.getByLabelText('Action')).toHaveDisplayValue('Warn')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Warn', 'Suspend', 'Block', 'Unblock'])
  })

  it('needs a reason, then submits the chosen type and the trimmed reason', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.click(screen.getByRole('button', { name: 'Log action' }))
    expect(await screen.findByText('Enter a reason')).toBeInTheDocument()
    expect(onValid).not.toHaveBeenCalled()

    await userEvent.selectOptions(screen.getByLabelText('Action'), 'Block')
    await userEvent.type(screen.getByLabelText('Reason'), '  Scam reports  ')
    await userEvent.click(screen.getByRole('button', { name: 'Log action' }))

    expect(onValid.mock.calls[0][0]).toEqual({ actionType: 'block', reason: 'Scam reports' })
  })

  it('renders a server error', () => {
    render(<Harness serverError="target account not found" />)
    expect(screen.getByRole('alert')).toHaveTextContent('target account not found')
  })
})
