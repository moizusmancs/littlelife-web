import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { EditProfileForm } from './EditProfileForm'
import { editProfileSchema, type EditProfileFormValues } from './schemas'

function Harness({
  onSubmit,
  isLoaded = true,
  showSaved = false,
  serverError = null,
  defaultName = '',
}: {
  onSubmit: (values: EditProfileFormValues) => void
  isLoaded?: boolean
  showSaved?: boolean
  serverError?: string | null
  defaultName?: string
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { name: defaultName },
  })

  return (
    <EditProfileForm
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      serverError={serverError}
      isLoaded={isLoaded}
      showSaved={showSaved}
    />
  )
}

describe('EditProfileForm', () => {
  it('renders a loading skeleton instead of the field while the profile is still loading', () => {
    render(<Harness onSubmit={vi.fn()} isLoaded={false} />)

    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('rejects an empty name', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Please enter your name')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the entered name once valid', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Your name'), 'Hina Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Hina Khan' }, expect.anything())
  })

  it('pre-fills the field from the loaded name', () => {
    render(<Harness onSubmit={vi.fn()} defaultName="Hina Khan" />)

    expect(screen.getByLabelText('Your name')).toHaveValue('Hina Khan')
  })

  it('shows the Saved indicator only when told to', () => {
    const { rerender } = render(<Harness onSubmit={vi.fn()} showSaved={false} />)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    rerender(<Harness onSubmit={vi.fn()} showSaved />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('renders a server error banner when given one', () => {
    render(<Harness onSubmit={vi.fn()} serverError="Something went wrong" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })
})
