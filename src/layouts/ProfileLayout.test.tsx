import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
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
})
