import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it, vi } from 'vitest'
import { editProfileSchema, type EditProfileFormValues } from '@/features/profile/schemas'
import { AccountProfileCard, type AccountProfileCardProps } from './AccountProfileCard'

function Harness({
  onSubmit = vi.fn(),
  ...overrides
}: { onSubmit?: (v: EditProfileFormValues) => void } & Partial<AccountProfileCardProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EditProfileFormValues>({ resolver: zodResolver(editProfileSchema), defaultValues: { name: 'Ayesha Siddiqui' } })

  return (
    <AccountProfileCard
      email="ayesha@alkhidmat.org"
      roleLabel="NGO admin"
      organizationName="Al-Khidmat Foundation"
      name="Ayesha Siddiqui"
      register={register}
      errors={errors}
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={false}
      isDirty={isDirty}
      serverError={null}
      showSaved={false}
      isLoaded
      loadError={null}
      onRetry={vi.fn()}
      {...overrides}
    />
  )
}

describe('AccountProfileCard', () => {
  it('shows initials, name, role and organisation chips, and the email read-only', () => {
    render(<Harness />)

    expect(screen.getByText('AS')).toBeInTheDocument()
    expect(screen.getByText('Ayesha Siddiqui', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('NGO admin')).toBeInTheDocument()
    expect(screen.getByText('Al-Khidmat Foundation')).toBeInTheDocument()
    const email = screen.getByLabelText('Email')
    expect(email).toHaveValue('ayesha@alkhidmat.org')
    expect(email).toHaveAttribute('readonly')
  })

  it('omits the organisation chip for a platform admin', () => {
    render(<Harness roleLabel="Admin" organizationName={undefined} />)

    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByText('Al-Khidmat Foundation')).not.toBeInTheDocument()
  })

  it('falls back to email initials and an "Add your name" prompt while the name is empty', () => {
    render(<Harness name="" />)

    expect(screen.getByText('AY')).toBeInTheDocument()
    expect(screen.getByText('Add your name')).toBeInTheDocument()
  })

  it('keeps Save disabled until the name changes, then submits it', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Full name'), ' Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ayesha Siddiqui Khan' }, expect.anything())
  })

  it('rejects a blank name', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.clear(screen.getByLabelText('Full name'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Please enter your name')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a skeleton in place of the name field until it loads', () => {
    render(<Harness isLoaded={false} name={null} />)

    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('shows a load failure with a retry while the rest of the card stays visible', async () => {
    const onRetry = vi.fn()
    render(<Harness loadError="profile not found" onRetry={onRetry} name={null} />)

    expect(screen.getByRole('alert')).toHaveTextContent('profile not found')
    expect(screen.queryByText('Add your name')).not.toBeInTheDocument() // it failed to load; it isn't known to be empty
    expect(screen.getByLabelText('Email')).toHaveValue('ayesha@alkhidmat.org')
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows Saved and a server error when told to', () => {
    render(<Harness showSaved serverError="Something went wrong" />)

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })
})
