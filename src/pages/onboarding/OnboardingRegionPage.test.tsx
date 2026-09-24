import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { PROFILE_QUERY_KEY, type ProfileResponse } from '@/api/profiling'
import { sampleRegions } from '@/features/regions/testRegion'
import { OnboardingRegionPage } from './OnboardingRegionPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/onboarding/region']}>
        <Routes>
          <Route path="/app/onboarding/region" element={<OnboardingRegionPage />} />
          <Route path="/app/home" element={<div>citizen home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

function serve() {
  const calls = { patches: [] as unknown[] }
  server.use(
    http.get('*/regions', () => HttpResponse.json(sampleRegions)),
    http.patch('*/profile', async ({ request }) => {
      const body = (await request.json()) as { home_region_id: string }
      calls.patches.push(body)
      const region = sampleRegions.find((r) => r.id === body.home_region_id)!
      const profile: ProfileResponse = {
        id: 'profile-1',
        name: 'Aisha Khan',
        home_region_id: region.id,
        home_region_name: region.name,
        home_region_level: region.level,
        home_region_path: region.name,
        created_at: '',
        updated_at: '',
      }
      return HttpResponse.json(profile)
    }),
  )
  return calls
}

describe('OnboardingRegionPage', () => {
  it('lists the regions, keeps Continue disabled until one is chosen, then saves it and goes to the app', async () => {
    const calls = serve()
    const queryClient = renderPage()
    expect(await screen.findByRole('radio', { name: /Punjab/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: /Punjab/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('citizen home')).toBeInTheDocument()
    expect(calls.patches).toEqual([{ home_region_id: 'punjab' }])
    // The re-read profile lands in the shared cache, so the profile sidebar shows it without another request.
    expect((queryClient.getQueryData(PROFILE_QUERY_KEY) as ProfileResponse).home_region_name).toBe('Punjab')
  })

  it('accepts a region at any level, by drilling down to a tehsil', async () => {
    const calls = serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show the 1 sub-region of Sukkur' }))
    await userEvent.click(screen.getByRole('radio', { name: /Sukkur City/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('citizen home')).toBeInTheDocument()
    expect(calls.patches).toEqual([{ home_region_id: 'sukkur-city' }])
  })

  it('Skip goes straight to the app without saving anything', async () => {
    const calls = serve()
    renderPage()
    await screen.findByRole('radio', { name: /Punjab/ })
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(await screen.findByText('citizen home')).toBeInTheDocument()
    expect(calls.patches).toEqual([])
  })

  it('shows the server’s message and stays put when the save is refused', async () => {
    serve()
    server.use(http.patch('*/profile', () => HttpResponse.json({ error: 'region not found' }, { status: 404 })))
    renderPage()
    await userEvent.click(await screen.findByRole('radio', { name: /Punjab/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('region not found')
    expect(screen.queryByText('citizen home')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled()
  })

  it('shows a failed region list with a retry that recovers, and Skip still works meanwhile', async () => {
    let failing = true
    server.use(http.get('*/regions', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(sampleRegions))))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled()

    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('radio', { name: /Punjab/ })).toBeInTheDocument()
  })

  it('searches across every level', async () => {
    serve()
    renderPage()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search regions' }), 'larkana')
    const results = within(screen.getByRole('list', { name: 'Matching regions' })).getAllByRole('radio')
    expect(results).toHaveLength(1)
  })
})
