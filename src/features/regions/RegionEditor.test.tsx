import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { Region } from '@/api/geo'
import { RegionEditor, type RegionEditorProps } from './RegionEditor'
import { SQUARE_BOUNDARY, makeRegion, sampleRegions } from './testRegion'

const squareJson = JSON.stringify(SQUARE_BOUNDARY)
const openRing = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })

function renderEditor(target: RegionEditorProps['target'], regions: Region[] = sampleRegions) {
  const props = { onClose: vi.fn(), onSaved: vi.fn() }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RegionEditor target={target} regions={regions} {...props} />
    </QueryClientProvider>,
  )
  return { ...props, queryClient }
}

const setBoundary = (text: string) => fireEvent.change(screen.getByLabelText('Boundary'), { target: { value: text } })

function captureWrites(response: (body: Record<string, unknown>) => Response | Promise<Response> = (body) => HttpResponse.json(makeRegion('new-1', String(body.name ?? 'X'), (body.level as 'province') ?? 'province', undefined), { status: 201 })) {
  const writes: Array<{ method: string; url: string; body: Record<string, unknown> }> = []
  server.use(
    http.post('*/admin/regions', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      writes.push({ method: 'POST', url: request.url, body })
      return response(body)
    }),
    http.patch('*/admin/regions/:id', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      writes.push({ method: 'PATCH', url: request.url, body })
      return response(body)
    }),
  )
  return writes
}

describe('RegionEditor — adding a region', () => {
  it('adds a province: name, a valid pasted boundary, and no parent sent', async () => {
    const writes = captureWrites()
    const { onSaved } = renderEditor({ mode: 'create' })

    expect(screen.getByRole('heading', { name: 'Add region' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name'), '  Balochistan ')
    setBoundary(squareJson)
    expect(await screen.findByText(/Valid polygon: 1 ring, 5 points/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Outline of the boundary you entered' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(writes).toHaveLength(1)
    expect(writes[0].body).toEqual({ name: 'Balochistan', level: 'province', parent_region_id: '', boundary: SQUARE_BOUNDARY })
    expect(onSaved.mock.calls[0][1]).toBe('created')
  })

  it('adds a district under a province, offering only provinces and clearing the choice when the level changes', async () => {
    const writes = captureWrites()
    renderEditor({ mode: 'create' })

    await userEvent.selectOptions(screen.getByLabelText('Level'), 'district')
    const parent = screen.getByLabelText('Parent province')
    expect([...(parent as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Choose a province…', 'Punjab', 'Sindh'])

    await userEvent.selectOptions(parent, 'sindh')
    await userEvent.selectOptions(screen.getByLabelText('Level'), 'tehsil')
    const districtParent = screen.getByLabelText('Parent district') as HTMLSelectElement
    expect(districtParent.value).toBe('')
    expect([...districtParent.options].map((o) => o.textContent)).toEqual(['Choose a district…', 'Orphan District', 'Sindh › Larkana', 'Sindh › Sukkur'])

    await userEvent.selectOptions(districtParent, 'sukkur')
    await userEvent.type(screen.getByLabelText('Name'), 'Rohri')
    setBoundary(squareJson)
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ name: 'Rohri', level: 'tehsil', parent_region_id: 'sukkur' })
  })

  it('starts from a preset level and parent when adding a sub-region from a detail page', () => {
    renderEditor({ mode: 'create', preset: { level: 'district', parentRegionId: 'sindh' } })
    expect(screen.getByLabelText('Level')).toHaveValue('district')
    expect(screen.getByLabelText('Parent province')).toHaveValue('sindh')
  })

  it('disables the parent for a province, since provinces are top level', () => {
    renderEditor({ mode: 'create' })
    expect(screen.getByLabelText('Parent')).toBeDisabled()
  })

  it('will not send a district without a parent, a blank name, or a missing boundary — none of which the API checks', async () => {
    const writes = captureWrites()
    renderEditor({ mode: 'create' })
    await userEvent.selectOptions(screen.getByLabelText('Level'), 'district')
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))

    expect(await screen.findByText('Enter the name of the region.')).toBeInTheDocument()
    expect(screen.getByText('Choose the province this district belongs to.')).toBeInTheDocument()
    expect(screen.getByText('Add the region’s boundary as a GeoJSON polygon.')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('says when there is nothing to be a parent of', async () => {
    renderEditor({ mode: 'create' }, [])
    await userEvent.selectOptions(screen.getByLabelText('Level'), 'district')
    expect(screen.getByText('There are no provinces yet. Add one first.')).toBeInTheDocument()
  })

  it('lists every boundary problem as it is typed, and blocks the save', async () => {
    const writes = captureWrites()
    renderEditor({ mode: 'create' })
    await userEvent.type(screen.getByLabelText('Name'), 'Test')

    setBoundary(openRing)
    expect(await screen.findByRole('alert')).toHaveTextContent("The outer ring isn't closed")
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    setBoundary(JSON.stringify({ type: 'MultiPolygon', coordinates: [] }))
    expect(await screen.findByText(/A MultiPolygon can't be saved/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(writes).toHaveLength(0)
  })

  it('accepts a Feature and says it used the polygon inside', async () => {
    renderEditor({ mode: 'create' })
    setBoundary(JSON.stringify({ type: 'Feature', properties: {}, geometry: SQUARE_BOUNDARY }))
    expect(await screen.findByText('Using the polygon inside the Feature.')).toBeInTheDocument()
  })

  it('reads an uploaded .geojson file into the boundary field', async () => {
    renderEditor({ mode: 'create' })
    const file = new File([squareJson], 'sindh.geojson', { type: 'application/geo+json' })
    await userEvent.upload(screen.getByLabelText('Upload a GeoJSON file'), file)

    await waitFor(() => expect(screen.getByLabelText('Boundary')).toHaveValue(squareJson))
    expect(await screen.findByText(/Valid polygon/)).toBeInTheDocument()
  })

  it('refuses an oversized file rather than loading it into the page', async () => {
    renderEditor({ mode: 'create' })
    const big = new File(['x'], 'huge.geojson')
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 })
    await userEvent.upload(screen.getByLabelText('Upload a GeoJSON file'), big)
    expect(await screen.findByText(/over 8 MB/)).toBeInTheDocument()
    expect(screen.getByLabelText('Boundary')).toHaveValue('')
  })

  it('turns a bare 500 into an explanation about the boundary, and keeps the drawer open for another try', async () => {
    captureWrites(() => HttpResponse.json({ error: 'internal server error' }, { status: 500 }))
    const { onSaved } = renderEditor({ mode: 'create' })
    await userEvent.type(screen.getByLabelText('Name'), 'Test')
    setBoundary(squareJson)
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("The server couldn't store that boundary")
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('Test')
  })

  it("shows the server's own message for an ordinary failure", async () => {
    captureWrites(() => HttpResponse.json({ error: 'parent region not found' }, { status: 400 }))
    renderEditor({ mode: 'create' })
    await userEvent.type(screen.getByLabelText('Name'), 'Test')
    setBoundary(squareJson)
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('parent region not found')
  })

  it('writes the new region into the list cache so the page can open it at once', async () => {
    captureWrites()
    const { queryClient, onSaved } = renderEditor({ mode: 'create' })
    queryClient.setQueryData(['regions'], sampleRegions)
    await userEvent.type(screen.getByLabelText('Name'), 'Balochistan')
    setBoundary(squareJson)
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((queryClient.getQueryData(['regions']) as Region[]).map((r) => r.id)).toContain('new-1')
  })

  it('closes from Cancel, and does not close when the backdrop is clicked (a half-pasted boundary is not thrown away)', async () => {
    const { onClose } = renderEditor({ mode: 'create' })
    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('RegionEditor — editing a region', () => {
  const sukkur = sampleRegions.find((r) => r.id === 'sukkur')!
  const larkana = sampleRegions.find((r) => r.id === 'larkana')!

  it('opens with the stored values and the current boundary described, leaving the boundary blank', () => {
    renderEditor({ mode: 'edit', region: larkana })
    expect(screen.getByRole('heading', { name: 'Edit region' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Larkana')
    expect(screen.getByLabelText('Level')).toHaveValue('district')
    expect(screen.getByLabelText('Parent province')).toHaveValue('sindh')
    expect(screen.getByLabelText('Boundary')).toHaveValue('')
    expect(screen.getByText(/Currently 1 ring, 5 points. Leave this blank to keep it/)).toBeInTheDocument()
  })

  it('sends only the name when only the name changed — never a stray parent or boundary', async () => {
    const writes = captureWrites((body) => HttpResponse.json({ ...larkana, ...body }))
    const { onSaved } = renderEditor({ mode: 'edit', region: larkana })
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Larkana District')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(writes).toHaveLength(1)
    expect(writes[0].method).toBe('PATCH')
    expect(writes[0].url).toMatch(/\/admin\/regions\/larkana$/)
    expect(writes[0].body).toEqual({ name: 'Larkana District' })
    expect(onSaved.mock.calls[0][1]).toBe('updated')
  })

  it('replaces the boundary only when a new one is given', async () => {
    const writes = captureWrites((body) => HttpResponse.json({ ...larkana, ...body }))
    renderEditor({ mode: 'edit', region: larkana })
    setBoundary(JSON.stringify({ type: 'Polygon', coordinates: [[[10, 10], [11, 10], [11, 11], [10, 10]]] }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(Object.keys(writes[0].body)).toEqual(['boundary'])
  })

  it('moves a district to another province', async () => {
    const writes = captureWrites((body) => HttpResponse.json({ ...larkana, ...body }))
    renderEditor({ mode: 'edit', region: larkana })
    await userEvent.selectOptions(screen.getByLabelText('Parent province'), 'punjab')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toEqual({ parent_region_id: 'punjab' })
  })

  it('does not send an empty PATCH, which the API would answer with a 400', async () => {
    const writes = captureWrites()
    renderEditor({ mode: 'edit', region: larkana })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing has changed yet.')
    expect(writes).toHaveLength(0)
  })

  it("locks the level of a region that has sub-regions, since changing it would break their hierarchy", () => {
    renderEditor({ mode: 'edit', region: sukkur })
    expect(screen.getByLabelText('Level')).toBeDisabled()
    expect(screen.getByText("Sukkur has sub-regions, so its level can't change.")).toBeInTheDocument()
    expect(screen.getByLabelText('Level')).toHaveValue('district')
  })

  it('lets a region without sub-regions change level', () => {
    renderEditor({ mode: 'edit', region: larkana })
    expect(screen.getByLabelText('Level')).toBeEnabled()
  })

  it('never offers the region itself or anything below it as its own parent', () => {
    // Sindh is a province; make it a district candidate to see the exclusion: its children (Sukkur…) can't be its parent.
    renderEditor({ mode: 'edit', region: makeRegion('sindh', 'Sindh', 'province') })
    expect(screen.getByLabelText('Level')).toBeDisabled()
    expect(screen.getByLabelText('Parent')).toBeDisabled()
  })

  it('explains a parent-loop refusal (another admin re-parented regions meanwhile) and refreshes the list', async () => {
    const loop = 'parent_region_id would create a loop: that region is a descendant of this one'
    captureWrites(() => HttpResponse.json({ error: loop }, { status: 400 }))
    const { queryClient } = renderEditor({ mode: 'edit', region: larkana })
    queryClient.setQueryData(['regions'], sampleRegions)
    await userEvent.selectOptions(screen.getByLabelText('Parent province'), 'punjab')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(loop)
    expect(alert).toHaveTextContent('Someone may have changed the regions since this list loaded')
    expect(queryClient.getQueryState(['regions'])?.isInvalidated).toBe(true)
    // The refused parent is dropped, so the form asks for a new one instead of resending the same loop.
    expect(screen.getByLabelText('Parent province')).toHaveValue('')
  })

  it('lets a district that already has no parent keep having none, but no other district', async () => {
    const orphan = sampleRegions.find((r) => r.id === 'orphan')!
    const writes = captureWrites((body) => HttpResponse.json({ ...orphan, ...body }))
    renderEditor({ mode: 'edit', region: orphan })
    const parent = screen.getByLabelText('Parent province') as HTMLSelectElement
    expect(parent.options[0].textContent).toBe('No parent')
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toEqual({ name: 'Renamed' })
  })

  it("shows the server's own words for a 500 when no boundary was sent, not the boundary explanation", async () => {
    captureWrites(() => HttpResponse.json({ error: 'internal server error' }, { status: 500 }))
    renderEditor({ mode: 'edit', region: larkana })
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Larkana 2')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('internal server error')
  })
})
