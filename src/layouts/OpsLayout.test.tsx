import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { OpsLayout } from './OpsLayout'

function renderAt(role: 'ngo' | 'admin', path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<OpsLayout role={role} />}>
          <Route path={path} element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
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
})
