import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeShelter } from '@/features/map/testMap'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'
import { EditShelterDrawer } from './EditShelterDrawer'
import { NgoShelterHeader } from './NgoShelterHeader'
import { NgoShelterOccupancyCard } from './NgoShelterOccupancyCard'
import { RegisterShelterDrawer, type RegisterShelterDrawerProps } from './RegisterShelterDrawer'
import { EMPTY_SHELTER_FORM, registerShelterSchema, type EditShelterFormValues, type RegisterShelterFormValues } from './shelterForm'

function RegisterHarness({
  onValid = vi.fn(),
  coverage = { status: 'none' } as RegionCoverage,
  ...rest
}: { onValid?: (values: RegisterShelterFormValues) => void; coverage?: RegionCoverage } & Partial<RegisterShelterDrawerProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterShelterFormValues>({ resolver: zodResolver(registerShelterSchema), defaultValues: EMPTY_SHELTER_FORM })
  return (
    <RegisterShelterDrawer
      onClose={vi.fn()}
      register={register}
      errors={errors}
      map={<div data-testid="picker" />}
      coverage={coverage}
      onUseMyLocation={vi.fn()}
      locationStatus="idle"
      onSubmit={handleSubmit(onValid)}
      isSubmitting={false}
      serverError={null}
      {...rest}
    />
  )
}

describe('RegisterShelterDrawer', () => {
  it('explains what registering does and — up front — that name, type, capacity and location cannot be changed afterwards', () => {
    render(<RegisterHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Register a shelter' })
    expect(within(dialog).getByText(/starts open, with nobody in it, and pending certification/)).toBeInTheDocument()
    expect(within(dialog).getByText(/can't be changed afterwards/)).toBeInTheDocument()
  })

  it('names every empty field when submitted empty, and sends nothing', async () => {
    const onValid = vi.fn()
    render(<RegisterHarness onValid={onValid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
    expect(await screen.findByText('Enter the name of the shelter.')).toBeInTheDocument()
    expect(screen.getByText('Enter how many people it can hold.')).toBeInTheDocument()
    expect(screen.getByText('Enter the latitude, or click the map.')).toBeInTheDocument()
    expect(screen.getByText('Enter the longitude, or click the map.')).toBeInTheDocument()
    expect(onValid).not.toHaveBeenCalled()
  })

  it('submits what was entered, with the kind chosen and the coordinates as typed', async () => {
    const onValid = vi.fn()
    render(<RegisterHarness onValid={onValid} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Community Center')
    await userEvent.click(screen.getByRole('radio', { name: /Relief center/ }))
    await userEvent.type(screen.getByLabelText('Capacity'), '200')
    await userEvent.type(screen.getByLabelText('Latitude'), '24.9')
    await userEvent.type(screen.getByLabelText('Longitude'), '67.1')
    await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
    expect(onValid).toHaveBeenCalledTimes(1)
    expect(onValid.mock.calls[0][0]).toEqual({ name: 'Community Center', type: 'relief_center', capacity: '200', latitude: '24.9', longitude: '67.1' })
  })

  it('opens with Shelter chosen, and the two kinds are one radio group', () => {
    render(<RegisterHarness />)
    expect(screen.getByRole('radio', { name: /^Shelter/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Relief center/ })).not.toBeChecked()
  })

  it('says, before saving, when the latitude looks like a longitude', async () => {
    render(<RegisterHarness />)
    await userEvent.type(screen.getByLabelText('Name'), 'X')
    await userEvent.type(screen.getByLabelText('Capacity'), '5')
    await userEvent.type(screen.getByLabelText('Latitude'), '120')
    await userEvent.type(screen.getByLabelText('Longitude'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
    expect(await screen.findByText('Latitude is between −90 and 90. The two may be the wrong way round.')).toBeInTheDocument()
  })

  it('shows the map it was given, the region note, and the server\'s refusal', () => {
    render(<RegisterHarness coverage={{ status: 'outside' }} serverError="account is not affiliated with an ngo" />)
    expect(screen.getByTestId('picker')).toBeInTheDocument()
    expect(screen.getByText(/outside the shaded areas, so it can't be saved/)).toHaveTextContent('ask an administrator to add that area')
    expect(screen.getByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
  })

  it('asks for the browser position only when "Use my location" is pressed, and says a refusal plainly', async () => {
    const onUseMyLocation = vi.fn()
    const { rerender } = render(<RegisterHarness onUseMyLocation={onUseMyLocation} />)
    expect(onUseMyLocation).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(onUseMyLocation).toHaveBeenCalledTimes(1)
    rerender(<RegisterHarness onUseMyLocation={onUseMyLocation} locationStatus="denied" />)
    expect(screen.getByText(/Location is blocked for this site/)).toBeInTheDocument()
    rerender(<RegisterHarness onUseMyLocation={onUseMyLocation} locationStatus="locating" />)
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeDisabled()
  })

  it('closes from Cancel, and cannot be dismissed by clicking outside (a half-filled form is not thrown away by a stray click)', async () => {
    const onClose = vi.fn()
    render(<RegisterHarness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('locks the buttons and shows the spinner while saving', () => {
    render(<RegisterHarness isSubmitting />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Register shelter/ })).toBeDisabled()
  })
})

describe('EditShelterDrawer', () => {
  const shelter = makeShelter('s1', 'GBHS Johi', { capacity_total: 400, location: { type: 'Point', coordinates: [68.858, 27.706] }, certification_status: 'pending' })

  function EditHarness(props: Partial<Parameters<typeof EditShelterDrawer>[0]>) {
    const { register } = useForm<EditShelterFormValues>({ defaultValues: { status: shelter.status, certification: shelter.certification_status } })
    return <EditShelterDrawer shelter={shelter} onClose={vi.fn()} register={register} changed onSubmit={(event) => event.preventDefault()} isSubmitting={false} serverError={null} {...props} />
  }

  it('offers exactly the two things the API can change — open/closed and certification — with the stored ones chosen', () => {
    render(<EditHarness />)
    expect(screen.getByRole('radio', { name: /^Open/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Closed/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pending certification' })).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Capacity')).not.toBeInTheDocument()
  })

  it('shows what cannot be changed, read-only, with the reason', () => {
    render(<EditHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Edit shelter' })
    expect(within(dialog).getByText('Shelter')).toBeInTheDocument()
    expect(within(dialog).getByText('400')).toBeInTheDocument()
    expect(within(dialog).getByText('27.7060° N, 68.8580° E')).toBeInTheDocument()
    expect(within(dialog).getByText(/can't be changed once it is registered/)).toBeInTheDocument()
  })

  it('says what closing does to citizens', () => {
    render(<EditHarness />)
    expect(screen.getByText(/Citizens see a closed shelter marked Closed/)).toBeInTheDocument()
  })

  it('keeps Save off until something differs, and shows the server\'s refusal', () => {
    const { rerender } = render(<EditHarness changed={false} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    rerender(<EditHarness changed serverError="this shelter is not managed by your ngo" />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent('this shelter is not managed by your ngo')
  })
})

describe('NgoShelterHeader', () => {
  const shelter = makeShelter('s1', 'GBHS Johi', { type: 'relief_center', status: 'closed', certification_status: 'uncertified' })
  const renderHeader = (props: Partial<Parameters<typeof NgoShelterHeader>[0]> = {}) =>
    render(
      <MemoryRouter>
        <NgoShelterHeader shelter={shelter} backTo="/ngo/shelters?show=closed" canEdit onEdit={vi.fn()} {...props} />
      </MemoryRouter>,
    )

  it('names the shelter with its kind, status and certification', () => {
    renderHeader()
    expect(screen.getByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
    expect(screen.getByText('Relief center')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('Not certified')).toBeInTheDocument()
  })

  it('goes back to the list at the view it was opened from', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Back to shelters' })).toHaveAttribute('href', '/ngo/shelters?show=closed')
  })

  it('offers Edit to those who can, and not to those who cannot', async () => {
    const onEdit = vi.fn()
    const { unmount } = renderHeader({ onEdit })
    await userEvent.click(screen.getByRole('button', { name: 'Edit shelter' }))
    expect(onEdit).toHaveBeenCalled()
    unmount()
    renderHeader({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Edit shelter' })).not.toBeInTheDocument()
  })
})

describe('NgoShelterOccupancyCard', () => {
  const shelter = makeShelter('s1', 'GBHS Johi', { capacity_total: 400, capacity_current: 265 })
  const base = { shelter, draft: null, canUpdate: true, onOpen: vi.fn(), onTextChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn() }

  it('shows the meter and, when closed, that citizens see it as closed', () => {
    const { rerender } = render(<NgoShelterOccupancyCard {...base} />)
    expect(screen.getByRole('region', { name: 'Occupancy' })).toHaveTextContent('Capacity 265 / 400')
    expect(screen.queryByText(/Closed — citizens see/)).not.toBeInTheDocument()
    rerender(<NgoShelterOccupancyCard {...base} shelter={{ ...shelter, status: 'closed' }} />)
    expect(screen.getByText(/Closed — citizens see this shelter as closed/)).toBeInTheDocument()
  })

  it('opens the editor from its button, and shows the editor in place of it once open', async () => {
    const onOpen = vi.fn()
    const { rerender } = render(<NgoShelterOccupancyCard {...base} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Update occupancy' }))
    expect(onOpen).toHaveBeenCalled()
    rerender(<NgoShelterOccupancyCard {...base} draft={{ shelterId: 's1', text: '270', isSaving: false, error: null }} />)
    expect(screen.getByRole('textbox', { name: 'People currently at GBHS Johi' })).toHaveValue('270')
    expect(screen.queryByRole('button', { name: 'Update occupancy' })).not.toBeInTheDocument()
  })

  it('offers no editor for a shelter the viewer cannot change', () => {
    render(<NgoShelterOccupancyCard {...base} canUpdate={false} />)
    expect(screen.queryByRole('button', { name: 'Update occupancy' })).not.toBeInTheDocument()
  })
})
