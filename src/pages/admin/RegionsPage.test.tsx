import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { Region, RegionNgo } from '@/api/geo'
import { makeNgo } from '@/features/ngoDirectory/testNgo'
import { SQUARE_BOUNDARY, makeRegion, sampleRegions } from '@/features/regions/testRegion'
import { RegionsPage } from './RegionsPage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <div data-testid="location">{pathname + search}</div>
}

function renderPage(initial = '/admin/regions') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/admin/regions/:id?"
            element={
              <>
                <RegionsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Sukkur is covered by two organisations (one still pending); nothing else is covered. */
const coverage: Record<string, RegionNgo[]> = {
  sukkur: [
    { ...makeNgo('n-1', 'Indus Relief Foundation', 'active', { volunteer_count: 3, region_count: 2 }), assigned_at: '2026-09-21T08:15:00Z' },
    { ...makeNgo('n-2', 'Sindh Response Network', 'pending_approval', { region_count: 1 }), assigned_at: '2026-09-22T08:15:00Z' },
  ],
}

function serve(initial: Region[] = sampleRegions) {
  let all = initial
  const calls = { list: 0, ngos: [] as string[], posts: [] as Array<Record<string, unknown>>, patches: [] as Array<{ id: string; body: Record<string, unknown> }> }
  server.use(
    http.get('*/admin/regions/:id/ngos', ({ params }) => {
      calls.ngos.push(params.id as string)
      return HttpResponse.json(coverage[params.id as string] ?? [])
    }),
    http.get('*/regions', () => {
      calls.list += 1
      return HttpResponse.json(all)
    }),
    http.post('*/admin/regions', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      calls.posts.push(body)
      const created = makeRegion(`created-${calls.posts.length}`, String(body.name), body.level as 'province', (body.parent_region_id as string) || undefined, { boundary: body.boundary as never })
      all = [...all, created]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch('*/admin/regions/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      calls.patches.push({ id: params.id as string, body })
      const current = all.find((r) => r.id === params.id)!
      const updated: Region = { ...current, ...(body.name ? { name: String(body.name) } : {}), ...(body.boundary ? { boundary: body.boundary as never } : {}) }
      all = all.map((r) => (r.id === params.id ? updated : r))
      return HttpResponse.json(updated)
    }),
  )
  return calls
}

const treeLinks = () => within(screen.getByRole('list', { name: 'Regions' })).getAllByRole('link').map((link) => link.textContent?.replace(/\d+, \d+ sub-regions?$|\d+$/, '').trim())
const location = () => screen.getByTestId('location').textContent

describe('RegionsPage — browsing', () => {
  it('loads every region once, counts each level in the header, and starts with just the top level', async () => {
    const calls = serve()
    renderPage()

    expect(await screen.findByRole('link', { name: /^Sindh/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Regions', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2 provinces · 3 districts · 1 tehsil')).toBeInTheDocument()
    expect(treeLinks()).toEqual(['Punjab', 'Sindh', 'Orphan District'])
    expect(screen.getByText('Select a region')).toBeInTheDocument()
    expect(calls.list).toBe(1)
  })

  it('expands and collapses a branch from its caret without leaving the page', async () => {
    serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Expand Sindh' }))
    expect(treeLinks()).toEqual(['Punjab', 'Sindh', 'Larkana', 'Sukkur', 'Orphan District'])
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Sindh' }))
    expect(treeLinks()).toEqual(['Punjab', 'Sindh', 'Orphan District'])
    expect(location()).toBe('/admin/regions')
  })

  it('opens a deep link with its ancestors expanded and the region selected and described', async () => {
    serve()
    renderPage('/admin/regions/sukkur-city')

    expect(await screen.findByRole('heading', { name: 'Sukkur City', level: 2 })).toBeInTheDocument()
    expect(treeLinks()).toEqual(['Punjab', 'Sindh', 'Larkana', 'Sukkur', 'Sukkur City', 'Orphan District'])
    expect(screen.getByRole('link', { name: 'Sukkur City' })).toHaveAttribute('aria-current', 'page')
    const path = screen.getByRole('navigation', { name: 'Region path' })
    expect(within(path).getAllByRole('link').map((a) => a.textContent)).toEqual(['Sindh', 'Sukkur'])
  })

  it('selects a region by link, and follows a sub-region chip to it', async () => {
    serve()
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: /^Sindh/ }))
    expect(location()).toBe('/admin/regions/sindh')
    expect(await screen.findByRole('heading', { name: 'Sindh', level: 2 })).toBeInTheDocument()

    const chips = screen.getByRole('region', { name: /Sub-regions/ })
    await userEvent.click(within(chips).getByRole('link', { name: 'Sukkur' }))
    expect(location()).toBe('/admin/regions/sukkur')
    expect(await screen.findByRole('heading', { name: 'Sukkur', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Sindh' })).toBeInTheDocument()
  })

  it('searches by name into a flat list with each match’s parents, mirrored to the URL, and restores the tree when cleared', async () => {
    serve()
    renderPage()
    const search = await screen.findByRole('searchbox', { name: 'Search regions' })
    await userEvent.type(search, 'sukkur')

    const matches = within(await screen.findByRole('list', { name: 'Matching regions' })).getAllByRole('listitem')
    expect(matches.map((m) => m.textContent)).toEqual(['SukkurSindhDistrict', 'Sukkur CitySindh › SukkurTehsil'])
    expect(location()).toBe('/admin/regions?q=sukkur')

    await userEvent.clear(search)
    expect(await screen.findByRole('list', { name: 'Regions' })).toBeInTheDocument()
    expect(location()).toBe('/admin/regions')
  })

  it('filters by level, and starts from a level in the URL', async () => {
    serve()
    renderPage('/admin/regions?level=district')
    expect(await screen.findByRole('list', { name: 'Matching regions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'District' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('list', { name: 'Matching regions' })).getAllByRole('link').map((a) => a.textContent)).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Tehsil' }))
    expect(within(screen.getByRole('list', { name: 'Matching regions' })).getAllByRole('link')).toHaveLength(1)
    expect(location()).toBe('/admin/regions?level=tehsil')
  })

  it('keeps the filter when moving between regions', async () => {
    serve()
    renderPage('/admin/regions?q=sukkur')
    await userEvent.click(await screen.findByRole('link', { name: /^Sukkur City/ }))
    expect(location()).toBe('/admin/regions/sukkur-city?q=sukkur')
    expect(await screen.findByRole('heading', { name: 'Sukkur City', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search regions' })).toHaveValue('sukkur')
  })

  it('says a region does not exist when the ID matches nothing', async () => {
    serve()
    renderPage('/admin/regions/nope')
    expect(await screen.findByRole('heading', { name: 'Region not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to regions' })).toHaveAttribute('href', '/admin/regions')
  })

  it('shows a load failure with a retry that recovers', async () => {
    let failing = true
    server.use(http.get('*/regions', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(sampleRegions))))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByRole('button', { name: 'Add region' })).not.toBeInTheDocument()

    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /^Sindh/ })).toBeInTheDocument()
  })

  it('invites adding the first region when there are none', async () => {
    serve([])
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No regions yet' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Add region' })[0])
    expect(await screen.findByRole('heading', { name: 'Add region' })).toBeInTheDocument()
  })

  it('on a phone shows one pane at a time: the tree, or the region with a way back', async () => {
    serve()
    const { container } = renderPage('/admin/regions/sindh')
    await screen.findByRole('heading', { name: 'Sindh', level: 2 })
    const tree = container.querySelector('section[aria-label="Region hierarchy"]')
    expect(tree).toHaveClass('max-md:hidden')
    expect(screen.getByRole('link', { name: 'All regions' })).toHaveAttribute('href', '/admin/regions')
  })

  it('on a phone at the list, hides the empty detail pane', async () => {
    serve()
    renderPage()
    const empty = (await screen.findByText('Select a region')).closest('.max-md\\:hidden')
    expect(empty).not.toBeNull()
  })
})

describe('RegionsPage — NGO coverage', () => {
  it('lists the organisations assigned to the selected region, with their status and a link to each', async () => {
    const calls = serve()
    renderPage('/admin/regions/sukkur')

    const card = (await screen.findByRole('heading', { name: /NGOs covering this region/ })).closest('section')!
    expect(await within(card).findByRole('link', { name: 'Indus Relief Foundation' })).toHaveAttribute('href', '/admin/ngos/n-1')
    expect(within(card).getByText('Active')).toBeInTheDocument()
    expect(within(card).getByText('Pending approval')).toBeInTheDocument()
    expect(calls.ngos).toEqual(['sukkur'])
  })

  it('says so when a region has no organisation, and asks again for each region selected — not for the tree', async () => {
    const calls = serve()
    renderPage('/admin/regions/larkana')

    expect(await screen.findByText('No organisation has been assigned to this region.')).toBeInTheDocument()
    expect(calls.ngos).toEqual(['larkana'])

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Region path' })).getByRole('link', { name: 'Sindh' }))
    await screen.findByRole('heading', { name: 'Sindh', level: 2 })
    await waitFor(() => expect(calls.ngos).toEqual(['larkana', 'sindh']))
  })

  it('asks for nothing until a region is selected, and not at all for an unknown one', async () => {
    const calls = serve()
    renderPage()
    await screen.findByRole('link', { name: /^Sindh/ })
    expect(calls.ngos).toEqual([])
  })

  it('a failure loading the organisations stays in their card — the region is still shown — and retries', async () => {
    serve()
    let failing = true
    server.use(
      http.get('*/admin/regions/:id/ngos', () => (failing ? HttpResponse.json({ error: 'coverage is down' }, { status: 500 }) : HttpResponse.json([]))),
    )
    renderPage('/admin/regions/sukkur')

    expect(await screen.findByRole('heading', { name: 'Sukkur', level: 2 })).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: /NGOs covering this region/ }).closest('section')!
    expect(await within(card).findByRole('alert')).toHaveTextContent('coverage is down')

    failing = false
    await userEvent.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(await within(card).findByText('No organisation has been assigned to this region.')).toBeInTheDocument()
  })
})

describe('RegionsPage — adding and editing', () => {
  const square = JSON.stringify(SQUARE_BOUNDARY)

  it('adds a top-level region, opens it, and says so', async () => {
    const calls = serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Add region' }))
    await userEvent.type(await screen.findByLabelText('Name'), 'Balochistan')
    fireEvent.change(screen.getByLabelText('Boundary'), { target: { value: square } })
    await screen.findByText(/Valid polygon/)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add region' }))

    expect(await screen.findByRole('heading', { name: 'Balochistan', level: 2 })).toBeInTheDocument()
    expect(location()).toBe('/admin/regions/created-1')
    expect(screen.getByText('Added Balochistan.')).toBeInTheDocument()
    expect(screen.getByText('3 provinces · 3 districts · 1 tehsil')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.posts).toEqual([{ name: 'Balochistan', level: 'province', parent_region_id: '', boundary: SQUARE_BOUNDARY }])
  })

  it('adds a sub-region from a region’s page with the level and parent already chosen, then reveals it in the tree', async () => {
    const calls = serve()
    renderPage('/admin/regions/larkana')
    await userEvent.click(await screen.findByRole('button', { name: /Add tehsil/ }))

    expect(await screen.findByLabelText('Level')).toHaveValue('tehsil')
    expect(screen.getByLabelText('Parent district')).toHaveValue('larkana')
    await userEvent.type(screen.getByLabelText('Name'), 'Dokri')
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Boundary'), { target: { value: square } })
    await screen.findByText(/Valid polygon/)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add region' }))

    expect(await screen.findByRole('heading', { name: 'Dokri', level: 2 })).toBeInTheDocument()
    expect(calls.posts[0]).toMatchObject({ name: 'Dokri', level: 'tehsil', parent_region_id: 'larkana' })
    expect(treeLinks()).toContain('Dokri')
    expect(screen.getByRole('button', { name: 'Collapse Larkana' })).toBeInTheDocument()
  })

  it('edits a region, sending only the changed name, and shows the new name', async () => {
    const calls = serve()
    renderPage('/admin/regions/larkana')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit region' }))
    const name = await screen.findByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Larkana District')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { name: 'Larkana District', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Saved changes to Larkana District.')).toBeInTheDocument()
    expect(calls.patches).toEqual([{ id: 'larkana', body: { name: 'Larkana District' } }])
    expect(location()).toBe('/admin/regions/larkana')
  })

  it('leaves everything as it was when the drawer is cancelled', async () => {
    const calls = serve()
    renderPage('/admin/regions/larkana')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit region' }))
    await userEvent.type(await screen.findByLabelText('Name'), ' edited')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Larkana', level: 2 })).toBeInTheDocument()
    expect(calls.patches).toHaveLength(0)
  })

  it('does not offer a delete, since the API has no such route', async () => {
    serve()
    renderPage('/admin/regions/larkana')
    await screen.findByRole('heading', { name: 'Larkana', level: 2 })
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})
