import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { CitizenLayout } from './CitizenLayout'

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/home']}>
        <Routes>
          <Route element={<CitizenLayout />}>
            <Route path="/app/home" element={<div>page content</div>} />
          </Route>
          <Route path="/login" element={<div>login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CitizenLayout', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('renders the top nav with the primary links and page content', () => {
    renderLayout()

    expect(screen.getByText('LittleLife')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /map/i })).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('logs out through the account menu: calls the real endpoint, clears auth, redirects to /login', async () => {
    useAuthStore.getState().setAuth('fake-token', {
      id: '1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: true,
      profileComplete: true,
    })
    let logoutCalled = false
    server.use(
      http.post('*/auth/logout', () => {
        logoutCalled = true
        return HttpResponse.json({ message: 'logged out' })
      }),
    )

    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log Out' }))

    expect(await screen.findByText('login screen')).toBeInTheDocument()
    expect(logoutCalled).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
