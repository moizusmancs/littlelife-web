import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProfileSidebar } from './ProfileSidebar'

function renderSidebar(name: string | null, invitationCount?: number, homeRegion?: string | null) {
  return render(
    <MemoryRouter initialEntries={['/app/profile/edit']}>
      <ProfileSidebar name={name} invitationCount={invitationCount} homeRegion={homeRegion} />
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

  it('shows the home region under the name when one is set, and nothing when it is not', () => {
    const { unmount } = renderSidebar('Hina Khan', undefined, 'Sukkur City, Sukkur')
    expect(screen.getByText('Sukkur City, Sukkur')).toBeInTheDocument()
    unmount()

    renderSidebar('Hina Khan', undefined, null)
    expect(screen.queryByText(/Sukkur/)).not.toBeInTheDocument()
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

  it('shows the real pending-invitation count as a badge on the Invitations item', () => {
    renderSidebar('Hina Khan', 3)

    expect(screen.getByRole('link', { name: /Invitations/ })).toHaveTextContent('3')
  })

  it('shows no badge for zero, or while the count is still unknown', () => {
    const { unmount } = renderSidebar('Hina Khan', 0)
    expect(screen.getByRole('link', { name: /Invitations/ })).not.toHaveTextContent(/\d/)
    unmount()

    renderSidebar('Hina Khan')
    expect(screen.getByRole('link', { name: /Invitations/ })).not.toHaveTextContent(/\d/)
  })
})
