import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
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
  // The sidebar also reads the pending-invitation count and the safety connections; default to none unless a test says otherwise.
  beforeEach(() => {
    server.use(
      http.get('*/volunteer-invitations', () => HttpResponse.json([])),
      http.get('*/safety-connections', () => HttpResponse.json([])),
    )
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

  it('shows the home region from the profile response, split from its path, with no region request', async () => {
    let regionRequests = 0
    server.use(
      http.get('*/regions', () => ((regionRequests += 1), HttpResponse.json([]))),
      http.get('*/profile', () =>
        HttpResponse.json({
          id: 'profile-1',
          name: 'Hina Khan',
          home_region_id: 'r-1',
          home_region_name: 'Sukkur City',
          home_region_level: 'tehsil',
          home_region_path: 'Sindh › Sukkur › Sukkur City',
          created_at: '',
          updated_at: '',
        }),
      ),
    )
    renderProfileLayout()

    expect(await screen.findByText('Sukkur City, Sukkur')).toBeInTheDocument()
    expect(regionRequests).toBe(0)
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

  describe('the Safety Groups badge', () => {
    const me = '3165dfbc-a40e-415b-8e50-0062a0c94471'
    const other = '8d0d395c-fb51-4e7c-945b-62f6b52e5e49'
    const row = (id: string, requester: string, recipient: string, status: string) => ({
      id,
      requester_account_id: requester,
      recipient_account_id: recipient,
      connection_type: 'family',
      status,
      created_at: '2026-09-20T06:00:00Z',
      updated_at: '2026-09-20T06:00:00Z',
    })

    beforeEach(() => {
      useAuthStore.getState().setAuth('token', { id: me, email: 'me@example.com', role: 'user', emailVerified: true, profileComplete: true })
      server.use(http.get('*/profile', () => HttpResponse.json({ id: 'p', name: 'Hina Khan', created_at: '', updated_at: '' })))
    })
    afterEach(() => useAuthStore.getState().clearAuth())

    it('counts only the pending requests sent to this account — not the ones it sent, nor answered ones', async () => {
      server.use(
        http.get('*/safety-connections', () =>
          HttpResponse.json([
            row('1', other, me, 'pending'),
            row('2', other, me, 'pending'),
            row('3', me, other, 'pending'),
            row('4', other, me, 'accepted'),
          ]),
        ),
      )
      renderProfileLayout()

      expect(await screen.findByRole('link', { name: /Safety Groups\s*2/ })).toBeInTheDocument()
    })

    it('shows no badge when the connections fetch fails — the sidebar still renders', async () => {
      server.use(http.get('*/safety-connections', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
      renderProfileLayout()

      expect(await screen.findByText('Hina Khan')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Safety Groups/ })).not.toHaveTextContent(/\d/)
    })
  })

  describe('the phone menu', () => {
    beforeEach(() => {
      server.use(http.get('*/profile', () => HttpResponse.json({ id: 'p', name: 'Hina Khan', created_at: '', updated_at: '' })))
    })

    it('starts closed, naming the current section, and opens and closes from its button', async () => {
      renderProfileLayout('/app/profile/edit')
      const toggle = await screen.findByRole('button', { name: /Edit Profile/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')

      await userEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')

      await userEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    it('closes when a link is followed, and now names the page it landed on', async () => {
      renderProfileLayout('/app/profile/edit')
      await userEvent.click(await screen.findByRole('button', { name: /Edit Profile/ }))

      await userEvent.click(screen.getByRole('link', { name: /Account Settings/ }))

      expect(await screen.findByText('account settings content')).toBeInTheDocument()
      const toggle = screen.getByRole('button', { name: /Account Settings/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    it('stays closed on the next page even if it was left open on the last', async () => {
      renderProfileLayout('/app/profile/edit')
      await userEvent.click(await screen.findByRole('button', { name: /Edit Profile/ }))
      await userEvent.click(screen.getByRole('link', { name: /Account Settings/ }))
      await screen.findByText('account settings content')

      // Back to the first page: the menu opened there is not still "open" for it.
      await userEvent.click(screen.getByRole('button', { name: /Account Settings/ }))
      await userEvent.click(screen.getByRole('link', { name: /Edit Profile/ }))
      expect(await screen.findByRole('button', { name: /Edit Profile/ })).toHaveAttribute('aria-expanded', 'false')
    })
  })
})
