import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { OpsLayout } from './OpsLayout'

function renderAt(role: 'ngo' | 'admin', path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<OpsLayout role={role} />}>
            <Route path="*" element={<div>page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OpsLayout', () => {
  it('renders the admin sidebar with admin-only nav groups', () => {
    renderAt('admin', '/admin/dashboard')
    expect(screen.getByText('Users & Accounts')).toBeInTheDocument()
    expect(screen.getByText('Hazard Zones & Predictions')).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('renders the NGO sidebar with NGO-only nav groups', () => {
    renderAt('ngo', '/ngo/dashboard')
    expect(screen.getByText('Volunteers')).toBeInTheDocument()
    expect(screen.getByText('Field Observations')).toBeInTheDocument()
    expect(screen.queryByText('Users & Accounts')).not.toBeInTheDocument()
  })

  describe('responsive sidebar', () => {
    const drawer = () => document.querySelector('aside') as HTMLElement

    it('keeps the sidebar as a closed drawer by default below md, out of the tab order', () => {
      renderAt('ngo', '/ngo/dashboard')

      expect(drawer()).toHaveAttribute('data-mobile-open', 'false')
      expect(drawer()).toHaveClass('max-md:invisible', 'max-md:-translate-x-full')
    })

    it('opens from the menu button and closes via the backdrop', async () => {
      renderAt('ngo', '/ngo/dashboard')

      await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
      expect(drawer()).toHaveAttribute('data-mobile-open', 'true')
      expect(drawer()).not.toHaveClass('max-md:invisible')

      await userEvent.click(document.querySelector('[aria-hidden="true"].fixed') as HTMLElement)
      expect(drawer()).toHaveAttribute('data-mobile-open', 'false')
    })

    it('closes on Escape', async () => {
      renderAt('ngo', '/ngo/dashboard')
      await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

      await userEvent.keyboard('{Escape}')

      expect(drawer()).toHaveAttribute('data-mobile-open', 'false')
    })

    it('closes after choosing a link, so the page you navigated to is what you see', async () => {
      renderAt('ngo', '/ngo/dashboard')
      await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

      await userEvent.click(screen.getByRole('link', { name: /Incidents/ }))

      expect(drawer()).toHaveAttribute('data-mobile-open', 'false')
    })

    it('leaves the desktop rail toggle working, hiding labels only from md up (never in the drawer)', async () => {
      renderAt('ngo', '/ngo/dashboard')
      const label = screen.getByText('Incidents')
      expect(label).not.toHaveClass('md:hidden')

      await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))

      expect(label).toHaveClass('md:hidden')
      expect(drawer()).toHaveClass('md:w-18')
    })
  })
})
