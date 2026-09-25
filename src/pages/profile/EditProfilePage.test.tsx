import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { ProfileResponse } from '@/api/profiling'
import { useAuthStore } from '@/store/auth'
import { sampleRegions } from '@/features/regions/testRegion'
import { EditProfilePage } from './EditProfilePage'

function renderEditProfilePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <EditProfilePage />
    </QueryClientProvider>,
  )
}

describe('EditProfilePage', () => {
  it('shows a loading skeleton, then pre-fills the field with the real fetched name', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderEditProfilePage()

    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Your name')).toHaveValue('Hina Khan')
  })

  it('pre-fills an empty field for a freshly-registered account (real "not yet set" state)', async () => {
    server.use(
      http.get('*/profile', () => HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' })),
    )
    renderEditProfilePage()

    expect(await screen.findByLabelText('Your name')).toHaveValue('')
  })

  it('submits the real PATCH /profile call and shows Saved', async () => {
    server.use(
      http.get('*/profile', () => HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' })),
    )
    renderEditProfilePage()
    await screen.findByLabelText('Your name')

    let sentBody: unknown
    server.use(
      http.patch('*/profile', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' })
      }),
    )

    await userEvent.type(screen.getByLabelText('Your name'), 'Hina Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ name: 'Hina Khan' })
  })

  it('clears the Saved indicator once the field is edited again', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
      http.patch('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderEditProfilePage()
    await screen.findByDisplayValue('Hina Khan')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Your name'), ' Updated')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows the real backend error banner on a failed save', async () => {
    server.use(
      http.get('*/profile', () => HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' })),
      http.patch('*/profile', () => HttpResponse.json({ error: 'name is required' }, { status: 400 })),
    )
    renderEditProfilePage()
    await screen.findByLabelText('Your name')

    await userEvent.type(screen.getByLabelText('Your name'), 'Hina Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('EditProfilePage — home region', () => {
  const base: ProfileResponse = { id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }
  const withRegion: ProfileResponse = {
    ...base,
    home_region_id: 'sukkur-city',
    home_region_name: 'Sukkur City',
    home_region_level: 'tehsil',
    home_region_path: 'Sindh › Sukkur › Sukkur City',
  }

  function serve(initial: ProfileResponse = base) {
    let current = initial
    const calls = { regions: 0, patches: [] as unknown[] }
    server.use(
      http.get('*/profile', () => HttpResponse.json(current)),
      http.get('*/regions', () => {
        calls.regions += 1
        return HttpResponse.json(sampleRegions)
      }),
      http.patch('*/profile', async ({ request }) => {
        const body = (await request.json()) as { home_region_id?: string; name?: string }
        calls.patches.push(body)
        if (body.name) current = { ...current, name: body.name }
        if (body.home_region_id === '') {
          const { home_region_id: _a, home_region_name: _b, home_region_level: _c, home_region_path: _d, ...rest } = current
          void [_a, _b, _c, _d]
          current = rest
        } else if (body.home_region_id) {
          const region = sampleRegions.find((r) => r.id === body.home_region_id)
          if (!region) return HttpResponse.json({ error: 'region not found' }, { status: 404 })
          current = { ...current, home_region_id: region.id, home_region_name: region.name, home_region_level: region.level, home_region_path: region.name }
        }
        return HttpResponse.json(current)
      }),
    )
    return calls
  }

  it('says "Not set" for a citizen without one, and does not load the region list until asked', async () => {
    const calls = serve()
    renderEditProfilePage()
    expect(await screen.findByText('Not set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose region' })).toBeInTheDocument()
    expect(calls.regions).toBe(0)
  })

  it('shows the current home region from the profile response alone', async () => {
    const calls = serve(withRegion)
    renderEditProfilePage()
    expect(await screen.findByText('Sukkur City, Sukkur')).toBeInTheDocument()
    expect(screen.getByText('Tehsil · Sindh › Sukkur › Sukkur City')).toBeInTheDocument()
    expect(calls.regions).toBe(0)
  })

  it('chooses one by drilling down, saves only home_region_id, and shows it', async () => {
    const calls = serve()
    renderEditProfilePage()
    await userEvent.click(await screen.findByRole('button', { name: 'Choose region' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Choose your home region' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save home region' })).toBeDisabled()
    await userEvent.click(await within(dialog).findByRole('radio', { name: /Punjab/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save home region' }))

    expect(await screen.findByText('Punjab')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.patches).toEqual([{ home_region_id: 'punjab' }])
  })

  it('lists the current region in the picker but will not let it be picked again, and offers Change', async () => {
    serve(withRegion)
    renderEditProfilePage()
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Change your home region' })).toBeInTheDocument()
    await userEvent.type(await within(dialog).findByRole('searchbox', { name: 'Search regions' }), 'sukkur city')
    const current = await within(dialog).findByRole('radio', { name: /Sukkur City/ })
    expect(current).toBeDisabled()
    expect(current.closest('label')).toHaveTextContent('Current home region')
  })

  it('removes it with one click by sending an empty home_region_id, and goes back to "Not set"', async () => {
    const calls = serve(withRegion)
    renderEditProfilePage()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Not set')).toBeInTheDocument()
    expect(calls.patches).toEqual([{ home_region_id: '' }])
  })

  it('shows a failed removal in the card and keeps the region', async () => {
    serve(withRegion)
    server.use(http.patch('*/profile', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
    renderEditProfilePage()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByText('Sukkur City, Sukkur')).toBeInTheDocument()
  })

  it('keeps the dialog open with the server’s message when saving is refused (a region that is gone)', async () => {
    serve()
    server.use(http.patch('*/profile', () => HttpResponse.json({ error: 'region not found' }, { status: 404 })))
    renderEditProfilePage()
    await userEvent.click(await screen.findByRole('button', { name: 'Choose region' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('radio', { name: /Punjab/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save home region' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('region not found')
    expect(screen.getByText('Not set')).toBeInTheDocument()
  })

  it('a name save never sends the home region along (a stray one would change it)', async () => {
    const calls = serve(withRegion)
    renderEditProfilePage()
    const name = await screen.findByLabelText('Your name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Hina K')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    expect(calls.patches).toEqual([{ name: 'Hina K' }])
  })
})

describe('EditProfilePage — account details', () => {
  afterEach(() => useAuthStore.getState().clearAuth())

  it("shows the account's email, its verified state and when it was created — read-only, beside the two things that can be edited", async () => {
    useAuthStore.getState().setAuth('token', { id: 'a1', email: 'hina@example.com', role: 'user', emailVerified: true, profileComplete: true })
    server.use(http.get('*/profile', () => HttpResponse.json({ id: 'p', name: 'Hina Khan', created_at: '2026-09-20T06:44:36Z', updated_at: '2026-09-20T06:44:36Z' })))
    renderEditProfilePage()

    const card = within(await screen.findByRole('region', { name: 'Your account' }))
    expect(card.getByText('hina@example.com')).toBeInTheDocument()
    expect(card.getByText('Verified')).toBeInTheDocument()
    expect(await card.findByText('20 September 2026')).toBeInTheDocument()
    // Only the name is a field on this page; nothing in the account card is.
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it('is not drawn when nobody is signed in', async () => {
    server.use(http.get('*/profile', () => HttpResponse.json({ id: 'p', name: 'Hina Khan', created_at: '', updated_at: '' })))
    renderEditProfilePage()

    await screen.findByLabelText('Your name')
    expect(screen.queryByRole('region', { name: 'Your account' })).not.toBeInTheDocument()
  })
})
