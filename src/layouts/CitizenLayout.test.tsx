import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CitizenLayout } from './CitizenLayout'

describe('CitizenLayout', () => {
  it('renders the top nav with the primary links and page content', () => {
    render(
      <MemoryRouter initialEntries={['/app/home']}>
        <Routes>
          <Route element={<CitizenLayout />}>
            <Route path="/app/home" element={<div>page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('LittleLife')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /map/i })).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })
})
