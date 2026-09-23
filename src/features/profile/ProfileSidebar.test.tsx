import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProfileSidebar } from './ProfileSidebar'

function renderSidebar(name: string | null) {
  return render(
    <MemoryRouter initialEntries={['/app/profile/edit']}>
      <ProfileSidebar name={name} />
    </MemoryRouter>,
  )
}

describe('ProfileSidebar', () => {
  it('shows a loading skeleton, not a name, while the fetch is in flight', () => {
    renderSidebar(null)

    expect(screen.queryByText('Add your name')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('shows initials and the real name once loaded', () => {
    renderSidebar('Hina Khan')

    expect(screen.getByText('Hina Khan')).toBeInTheDocument()
    expect(screen.getByText('HK')).toBeInTheDocument()
  })

  it('falls back to a placeholder for a loaded-but-empty name — not the loading skeleton', () => {
    renderSidebar('')

    expect(screen.getByText('Add your name')).toBeInTheDocument()
  })

  it('links every sub-nav item to a real route', () => {
    renderSidebar('Hina Khan')

    expect(screen.getByRole('link', { name: /Edit Profile/ })).toHaveAttribute('href', '/app/profile/edit')
    expect(screen.getByRole('link', { name: /Account Settings/ })).toHaveAttribute(
      'href',
      '/app/profile/account-settings',
    )
    expect(screen.getByRole('link', { name: /Safety Groups/ })).toHaveAttribute('href', '/app/safety-groups')
  })

  it('highlights the current route as active', () => {
    renderSidebar('Hina Khan')

    expect(screen.getByRole('link', { name: /Edit Profile/ })).toHaveClass('bg-primary-50')
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveClass('bg-primary-50')
  })
})
