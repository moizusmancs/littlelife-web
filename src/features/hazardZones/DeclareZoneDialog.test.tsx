import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeclareZoneDialog, type DeclareZoneDialogProps } from './DeclareZoneDialog'

const square = JSON.stringify({ type: 'Polygon', coordinates: [[[70.1, 22.5], [70.4, 22.5], [70.4, 22.8], [70.1, 22.8], [70.1, 22.5]]] })
const bowTie = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] })

function renderDialog(overrides: Partial<DeclareZoneDialogProps> = {}) {
  const props: DeclareZoneDialogProps = { open: true, onClose: vi.fn(), onSubmit: vi.fn(), isSubmitting: false, serverError: null, ...overrides }
  const utils = render(<DeclareZoneDialog {...props} />)
  return { props, ...utils }
}

const paste = async (text: string) => {
  await userEvent.click(screen.getByLabelText('Boundary (GeoJSON Polygon)'))
  await userEvent.paste(text)
}

describe('DeclareZoneDialog', () => {
  it('is not there while closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with a risk level and a boundary to fill in, and says what declaring does', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Declare a hazard zone' })
    expect(dialog).toHaveTextContent('active straight away')
    expect(screen.getByLabelText('Risk level')).toHaveValue('')
    expect(screen.getByLabelText('Boundary (GeoJSON Polygon)')).toHaveValue('')
    expect(screen.queryByRole('button', { name: /current view/ })).not.toBeInTheDocument()
  })

  it('names every missing piece when submitted empty, and sends nothing', async () => {
    const { props } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Declare zone' }))
    expect(screen.getByText('Choose a risk level.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Paste a GeoJSON Polygon/)
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('checks the boundary as it is pasted — invalid JSON, a MultiPolygon (in a hazard zone’s words), a bow-tie — and sends nothing', async () => {
    const { props } = renderDialog()
    await paste('not json')
    expect(await screen.findByText(/isn't valid JSON/)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Boundary (GeoJSON Polygon)'))
    await paste(JSON.stringify({ type: 'MultiPolygon', coordinates: [] }))
    expect(await screen.findByText(/a hazard zone's boundary is stored as a single Polygon/)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Boundary (GeoJSON Polygon)'))
    await paste(bowTie)
    expect(await screen.findByText(/crosses or touches itself/)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Risk level'), 'high')
    await userEvent.click(screen.getByRole('button', { name: 'Declare zone' }))
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('draws the outline once the boundary is good, and submits the polygon with the level — never a source', async () => {
    const { props } = renderDialog()
    await paste(square)
    expect(await screen.findByRole('img', { name: "The zone's outline" })).toBeInTheDocument()
    expect(screen.getByText('A polygon of 5 points.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Risk level'), 'medium')
    await userEvent.click(screen.getByRole('button', { name: 'Declare zone' }))
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
    const sent = (props.onSubmit as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(sent).toEqual({ boundary: JSON.parse(square), risk_level: 'medium' })
    expect(Object.keys(sent).sort()).toEqual(['boundary', 'risk_level'])
  })

  it('unwraps a Feature, as most tools export', async () => {
    const { props } = renderDialog()
    await paste(JSON.stringify({ type: 'Feature', properties: {}, geometry: JSON.parse(square) }))
    await userEvent.selectOptions(screen.getByLabelText('Risk level'), 'low')
    await userEvent.click(screen.getByRole('button', { name: 'Declare zone' }))
    expect(props.onSubmit).toHaveBeenCalledWith({ boundary: JSON.parse(square), risk_level: 'low' })
  })

  it('fills the boundary from the map’s current view when offered', async () => {
    renderDialog({ suggestedBoundary: square })
    await userEvent.click(screen.getByRole('button', { name: "Use the map's current view" }))
    expect(screen.getByLabelText('Boundary (GeoJSON Polygon)')).toHaveValue(square)
    expect(await screen.findByRole('img', { name: "The zone's outline" })).toBeInTheDocument()
  })

  it('reads an uploaded .geojson file into the boundary, and refuses one that is too big', async () => {
    renderDialog()
    const input = screen.getByLabelText('Boundary file') as HTMLInputElement
    await userEvent.upload(input, new File([square], 'zone.geojson', { type: 'application/geo+json' }))
    await waitFor(() => expect(screen.getByLabelText('Boundary (GeoJSON Polygon)')).toHaveValue(square))

    const big = new File(['x'], 'huge.geojson')
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 })
    await userEvent.upload(input, big)
    expect(await screen.findByText(/the limit is 8 MB/)).toBeInTheDocument()
  })

  it('shows a server error and the busy state', () => {
    renderDialog({ serverError: 'risk_level must be one of: low, medium, high', isSubmitting: true })
    expect(screen.getAllByRole('alert').some((el) => el.textContent?.includes('risk_level must be one of'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('starts empty each time it is opened', async () => {
    const { rerender, props } = renderDialog()
    await paste(square)
    await userEvent.selectOptions(screen.getByLabelText('Risk level'), 'high')
    rerender(<DeclareZoneDialog {...props} open={false} />)
    rerender(<DeclareZoneDialog {...props} open />)
    expect(screen.getByLabelText('Boundary (GeoJSON Polygon)')).toHaveValue('')
    expect(screen.getByLabelText('Risk level')).toHaveValue('')
  })

  it('closes on Cancel', async () => {
    const { props } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})
