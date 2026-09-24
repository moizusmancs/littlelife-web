import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import type { NgoStatus } from '@/api/identity'
import { OrganizationProfileCard } from './OrganizationProfileCard'
import { organizationSettingsSchema, type OrganizationSettingsFormValues } from './schemas'

function Harness({
  onSubmit,
  onDiscard = vi.fn(),
  status = 'active',
  serverError = null,
  showSaved = false,
}: {
  onSubmit: (values: OrganizationSettingsFormValues) => void
  onDiscard?: () => void
  status?: NgoStatus
  serverError?: string | null
  showSaved?: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<OrganizationSettingsFormValues>({
    resolver: zodResolver(organizationSettingsSchema),
    defaultValues: { name: 'Flood Relief Karachi', contactEmail: 'contact@floodrelief.example', contactPhone: '' },
  })

  return (
    <OrganizationProfileCard
      organization={{ name: 'Flood Relief Karachi', status, created_at: '2026-09-20T10:00:00Z' }}
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      onDiscard={onDiscard}
      isSubmitting={false}
      isDirty={isDirty}
      serverError={serverError}
      showSaved={showSaved}
    />
  )
}

describe('OrganizationProfileCard', () => {
  it('shows the organisation header: initials tile, name, status badge, and when it registered', () => {
    render(<Harness onSubmit={vi.fn()} />)

    expect(screen.getByText('FR')).toBeInTheDocument()
    expect(screen.getByText('Flood Relief Karachi', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Registered Sep 2026')).toBeInTheDocument()
  })

  it('renders a badge for a non-active status too', () => {
    render(<Harness onSubmit={vi.fn()} status="deactivated" />)
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })

  it('pre-fills the real values, and keeps Save and Discard disabled until something changes', async () => {
    render(<Harness onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Organisation name')).toHaveValue('Flood Relief Karachi')
    expect(screen.getByLabelText('Contact email')).toHaveValue('contact@floodrelief.example')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Contact phone'), '+92 300 1234567')

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled()
  })

  it('rejects a blank name and a malformed contact email, but allows the email to be cleared', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.clear(screen.getByLabelText('Organisation name'))
    await userEvent.clear(screen.getByLabelText('Contact email'))
    await userEvent.type(screen.getByLabelText('Contact email'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Organisation name is required')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Flood Relief Karachi')
    await userEvent.clear(screen.getByLabelText('Contact email'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSubmit).toHaveBeenCalledWith(
      { name: 'Flood Relief Karachi', contactEmail: '', contactPhone: '' },
      expect.anything(),
    )
  })

  it('reports Discard, shows Saved, and renders a server error', async () => {
    const onDiscard = vi.fn()
    const { rerender } = render(<Harness onSubmit={vi.fn()} onDiscard={onDiscard} />)
    await userEvent.type(screen.getByLabelText('Contact phone'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)

    rerender(<Harness onSubmit={vi.fn()} showSaved serverError="insufficient permissions" />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('insufficient permissions')
  })
})
