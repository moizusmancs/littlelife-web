import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { Region } from '@/api/geo'
import type { NgoRegistration } from '@/api/identity'
import { makeRegion, sampleRegions } from '@/features/regions/testRegion'
import { OrganizationSettingsPage } from './OrganizationSettingsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationSettingsPage />
    </QueryClientProvider>,
  )
}

function ngo(overrides: Partial<NgoRegistration> = {}): NgoRegistration {
  return {
    id: 'ngo-1',
    name: 'Flood Relief Karachi',
    status: 'active',
    contact_email: 'contact@floodrelief.example',
    contact_phone: '+92 300 1234567',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
    ...overrides,
  }
}

describe('OrganizationSettingsPage', () => {
  // The page also reads the organisation's regions; individual tests that care override this.
  beforeEach(() => {
    server.use(http.get('*/ngo/me/regions', () => HttpResponse.json([])))
  })

  it('loads the real organisation and pre-fills the form; contact fields the server omitted are empty', async () => {
    server.use(
      http.get('*/ngo/me', () =>
        HttpResponse.json({ ...ngo(), contact_email: undefined, contact_phone: undefined }),
      ),
    )
    renderPage()

    expect(await screen.findByLabelText('Organisation name')).toHaveValue('Flood Relief Karachi')
    expect(screen.getByLabelText('Contact email')).toHaveValue('')
    expect(screen.getByLabelText('Contact phone')).toHaveValue('')
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('saves ONLY the field that changed (a real partial patch), then shows Saved and the new name', async () => {
    let sentBody: unknown
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json(ngo({ name: 'Flood Relief Sindh' }))
      }),
    )
    renderPage()

    const name = await screen.findByLabelText('Organisation name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Flood Relief Sindh')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ name: 'Flood Relief Sindh' })
    expect(screen.getByText('Flood Relief Sindh', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('clears a contact field by sending an empty string for just that field', async () => {
    let sentBody: unknown
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ ...ngo(), contact_email: undefined })
      }),
    )
    renderPage()

    await userEvent.clear(await screen.findByLabelText('Contact email'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ contact_email: '' })
    expect(screen.getByLabelText('Contact email')).toHaveValue('')
  })

  it('makes no request at all when trimming leaves nothing actually changed', async () => {
    let patchCalled = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', () => {
        patchCalled = true
        return HttpResponse.json(ngo())
      }),
    )
    renderPage()

    await userEvent.type(await screen.findByLabelText('Organisation name'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('Discard puts the server\'s values back and disables Save again', async () => {
    server.use(http.get('*/ngo/me', () => HttpResponse.json(ngo())))
    renderPage()

    const name = await screen.findByLabelText('Organisation name')
    await userEvent.type(name, ' extra')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(name).toHaveValue('Flood Relief Karachi')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('validates before calling the network', async () => {
    let patchCalled = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', () => {
        patchCalled = true
        return HttpResponse.json(ngo())
      }),
    )
    renderPage()

    await userEvent.clear(await screen.findByLabelText('Organisation name'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Organisation name is required')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('shows the real server error when a save is rejected', async () => {
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', () => HttpResponse.json({ error: 'insufficient permissions' }, { status: 403 })),
    )
    renderPage()

    await userEvent.type(await screen.findByLabelText('Contact phone'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('insufficient permissions')
  })

  it('deactivates for real after confirming, then refetches so the badge and danger zone show the server\'s truth', async () => {
    let deactivated = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo({ status: deactivated ? 'deactivated' : 'active' }))),
      http.post('*/ngo/me/deactivate', () => {
        deactivated = true
        return HttpResponse.json({ message: 'ngo deactivated' })
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate…' }))
    expect(screen.getByRole('heading', { name: 'Deactivate Flood Relief Karachi?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate organisation' }))

    expect(await screen.findByText('Deactivated')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This organisation is no longer active' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Deactivate Flood Relief/ })).not.toBeInTheDocument()
  })

  it('cancelling the dialog does not deactivate anything', async () => {
    let called = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.post('*/ngo/me/deactivate', () => {
        called = true
        return HttpResponse.json({ message: 'ngo deactivated' })
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(called).toBe(false)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows the real 409 in the dialog and refetches when it was already deactivated elsewhere', async () => {
    let status: NgoRegistration['status'] = 'active'
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo({ status }))),
      http.post('*/ngo/me/deactivate', () => {
        status = 'deactivated'
        return HttpResponse.json({ error: 'ngo is not active' }, { status: 409 })
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate organisation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ngo is not active')
    expect(await screen.findByText('Deactivated')).toBeInTheDocument()
  })

  it('shows a load failure with a retry that recovers', async () => {
    let calls = 0
    server.use(
      http.get('*/ngo/me', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ error: 'account is not affiliated with an ngo' }, { status: 403 })
          : HttpResponse.json(ngo())
      }),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Organisation name')).toHaveValue('Flood Relief Karachi')
  })
})

describe('OrganizationSettingsPage — operational regions', () => {
  const sindh = sampleRegions.find((r) => r.id === 'sindh')!
  const sukkur = sampleRegions.find((r) => r.id === 'sukkur')!

  // `listAll` answers `GET /regions`. Note that a bare star-slash-regions glob also matches
  // `/ngo/me/regions`, so the organisation's own handler is registered before it in the same `server.use`.
  function serveRegions(initial: Region[] = [sindh], listAll: () => Response = () => HttpResponse.json(sampleRegions)) {
    let mine = initial
    const calls = { all: 0, mine: 0, posts: [] as unknown[], deletes: [] as string[] }
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.get('*/ngo/me/regions', () => {
        calls.mine += 1
        return HttpResponse.json(mine)
      }),
      http.get('*/regions', () => {
        calls.all += 1
        return listAll()
      }),
      http.post('*/ngo/me/regions', async ({ request }) => {
        const body = (await request.json()) as { region_id: string }
        calls.posts.push(body)
        const region = sampleRegions.find((r) => r.id === body.region_id)
        if (!region) return HttpResponse.json({ error: 'region not found' }, { status: 404 })
        if (mine.some((r) => r.id === region.id)) return HttpResponse.json({ error: 'region already assigned to this ngo' }, { status: 409 })
        mine = [...mine, region]
        return HttpResponse.json(region, { status: 201 })
      }),
      http.delete('*/ngo/me/regions/:id', ({ params }) => {
        calls.deletes.push(params.id as string)
        if (!mine.some((r) => r.id === params.id)) return HttpResponse.json({ error: 'region is not assigned to this ngo' }, { status: 404 })
        mine = mine.filter((r) => r.id !== params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    return { calls, setMine: (next: Region[]) => (mine = next) }
  }

  it('shows the organisation’s covered regions as chips with their level', async () => {
    serveRegions([sindh, sukkur])
    renderPage()
    const card = (await screen.findByRole('heading', { name: 'Operational regions' })).closest('section')!
    expect(await within(card).findByText('Sindh')).toBeInTheDocument()
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['SindhProvince', 'SukkurDistrict'])
  })

  it('says so when no regions are covered yet', async () => {
    serveRegions([])
    renderPage()
    expect(await screen.findByText(/No regions yet/)).toBeInTheDocument()
  })

  it('does not fetch the full region list until the picker is opened, then adds a district found by drilling down', async () => {
    const { calls } = serveRegions([sindh])
    renderPage()
    await screen.findByRole('button', { name: 'Remove Sindh' })
    expect(calls.all).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Add an operational region' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add region' })).toBeDisabled()

    await userEvent.click(await within(dialog).findByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: /Sukkur/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add region' }))

    expect(await screen.findByText('Sukkur was added to your regions.')).toBeInTheDocument()
    expect(calls.posts).toEqual([{ region_id: 'sukkur' }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remove Sukkur' })).toBeInTheDocument()
    expect(calls.all).toBe(1)
  })

  it('lists a region that is already covered but will not let it be chosen again', async () => {
    serveRegions([sindh])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Add region' }))
    const dialog = await screen.findByRole('dialog')
    const covered = await within(dialog).findByRole('radio', { name: /Sindh/ })
    expect(covered).toBeDisabled()
    expect(covered.closest('label')).toHaveTextContent('Province · Already added')
    expect(within(dialog).getByRole('radio', { name: /Punjab/ })).toBeEnabled()
  })

  it('reports a 409 from a teammate’s add in the dialog and brings the chip into view', async () => {
    const { setMine } = serveRegions([])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Add region' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('radio', { name: /Punjab/ }))
    setMine([makeRegion('punjab', 'Punjab', 'province')]) // someone else added it meanwhile
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add region' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('region already assigned to this ngo')
    // The dialog stays open, so the page behind it is hidden from the accessibility tree.
    expect(await screen.findByRole('button', { name: 'Remove Punjab', hidden: true })).toBeInTheDocument()
  })

  it('shows a failed region list inside the dialog, with a retry that recovers', async () => {
    let failing = true
    serveRegions([], () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(sampleRegions)))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Add region' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('boom')

    failing = false
    await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByRole('radio', { name: /Punjab/ })).toBeInTheDocument()
  })

  it('starts each opening of the picker at the top with nothing chosen', async () => {
    serveRegions([])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Add region' }))
    let dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: /Larkana/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('radio', { name: /Punjab/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add region' })).toBeDisabled()
  })

  it('removes a region after a confirmation that says it can be added again', async () => {
    const { calls } = serveRegions([sindh, sukkur])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sukkur' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Remove Sukkur?' })).toBeInTheDocument()
    expect(calls.deletes).toEqual([])

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove region' }))
    expect(await screen.findByText('Sukkur was removed from your regions.')).toBeInTheDocument()
    expect(calls.deletes).toEqual(['sukkur'])
    expect(screen.queryByRole('button', { name: 'Remove Sukkur' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Sindh' })).toBeInTheDocument()
  })

  it('cancelling a removal changes nothing', async () => {
    const { calls } = serveRegions([sindh])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sindh' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.deletes).toEqual([])
    expect(screen.getByRole('button', { name: 'Remove Sindh' })).toBeInTheDocument()
  })

  it('reports a removal that finds the region already gone, and refreshes', async () => {
    const { setMine } = serveRegions([sindh, sukkur])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sukkur' }))
    setMine([sindh]) // removed elsewhere meanwhile
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove region' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('region is not assigned to this ngo')
    // The dialog stays open, so the chips behind it are hidden from the accessibility tree.
    expect(await screen.findByRole('button', { name: 'Remove Sindh', hidden: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Sukkur', hidden: true })).not.toBeInTheDocument()
  })

  it('a failure loading the regions stays in their card — the profile form still works — and retries', async () => {
    let failing = true
    serveRegions([sindh])
    server.use(http.get('*/ngo/me/regions', () => (failing ? HttpResponse.json({ error: 'regions are down' }, { status: 500 }) : HttpResponse.json([sindh]))))
    renderPage()


    expect(await screen.findByLabelText('Organisation name')).toHaveValue('Flood Relief Karachi')
    const card = screen.getByRole('heading', { name: 'Operational regions' }).closest('section')!
    expect(await within(card).findByRole('alert')).toHaveTextContent('regions are down')

    failing = false
    await userEvent.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(await within(card).findByText('Sindh')).toBeInTheDocument()
  })
})
