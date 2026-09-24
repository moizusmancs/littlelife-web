import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { MyNgoForm } from './MyNgoForm'
import { registerNgoSchema, type RegisterNgoFormValues } from './schemas'

function Harness({
  onSubmit,
  serverError = null,
  titleAs,
}: {
  onSubmit: (values: RegisterNgoFormValues) => void
  serverError?: string | null
  titleAs?: 'h1' | 'h2'
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterNgoFormValues>({
    resolver: zodResolver(registerNgoSchema),
    defaultValues: { name: '', contactEmail: '', contactPhone: '' },
  })

  return (
    <MyNgoForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      serverError={serverError}
      title="My NGO"
      description="Register your organisation."
      titleAs={titleAs}
    />
  )
}

describe('MyNgoForm', () => {
  it('rejects an empty organisation name', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(await screen.findByText('NGO name is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects an invalid contact email but allows it blank', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Flood Relief Karachi')
    await userEvent.type(screen.getByLabelText('Contact email (optional)'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with only the required name filled in', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Flood Relief Karachi')
    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(onSubmit).toHaveBeenCalledWith(
      { name: 'Flood Relief Karachi', contactEmail: '', contactPhone: '' },
      expect.anything(),
    )
  })

  it('submits with all fields filled in', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Flood Relief Karachi')
    await userEvent.type(screen.getByLabelText('Contact email (optional)'), 'contact@floodrelief.example')
    await userEvent.type(screen.getByLabelText('Contact phone (optional)'), '+92 300 1234567')
    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: 'Flood Relief Karachi',
        contactEmail: 'contact@floodrelief.example',
        contactPhone: '+92 300 1234567',
      },
      expect.anything(),
    )
  })

  it('renders a server error banner when given one', () => {
    render(<Harness onSubmit={vi.fn()} serverError="you already have a pending or active ngo registration" />)
    expect(screen.getByRole('alert')).toHaveTextContent('you already have a pending or active ngo registration')
  })

  it('renders its title as an h1 by default and as an h2 when a status card sits above it', () => {
    const { rerender } = render(<Harness onSubmit={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'My NGO' })).toBeInTheDocument()

    rerender(<Harness onSubmit={vi.fn()} titleAs="h2" />)
    expect(screen.getByRole('heading', { level: 2, name: 'My NGO' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
