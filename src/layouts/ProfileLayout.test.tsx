import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { ProfileLayout } from './ProfileLayout'

function renderProfileLayout(initialPath = '/app/profile/edit') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ProfileLayout />}>
            <Route path="/app/profile/edit" element={<div>edit profile content</div>} />
            <Route path="/app/profile/account-settings" element={<div>account settings content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileLayout', () => {
  // The sidebar also reads the pending-invitation count; default to none unless a test says otherwise.
  beforeEach(() => {
    server.use(http.get('*/volunteer-invitations', () => HttpResponse.json([])))
  })

  it('fetches the real name and renders it in the sidebar alongside the nested route content', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderProfileLayout()

    expect(await screen.findByText('Hina Khan')).toBeInTheDocument()
    expect(screen.getByText('edit profile content')).toBeInTheDocument()
  })

  it('renders whichever nested profile route is active', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderProfileLayout('/app/profile/account-settings')

    expect(await screen.findByText('account settings content')).toBeInTheDocument()
    expect(screen.queryByText('edit profile content')).not.toBeInTheDocument()
  })

  it('shows the real pending-invitation count as a badge on the Invitations item', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
      http.get('*/volunteer-invitations', () =>
        HttpResponse.json([
          { id: 'a', ngo_id: 'n1', ngo_name: 'Sindh Relief Collective', status: 'pending', created_at: '2026-09-20T10:00:00Z' },
          { id: 'b', ngo_id: 'n2', ngo_name: 'Al-Khidmat Foundation', status: 'pending', created_at: '2026-09-21T10:00:00Z' },
        ]),
      ),
    )
    renderProfileLayout()

    expect(await screen.findByRole('link', { name: /Invitations\s*2/ })).toBeInTheDocument()
  })

  it('shows no badge when the invitation fetch fails — the sidebar still renders', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
      http.get('*/volunteer-invitations', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    )
    renderProfileLayout()

    expect(await screen.findByText('Hina Khan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Invitations/ })).not.toHaveTextContent(/\d/)
  })
})
