import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProfileSidebar } from './ProfileSidebar'

function renderSidebar(
  name: string | null,
  invitationCount?: number,
  homeRegion?: string | null,
  safetyRequestCount?: number,
  menu: { currentPath?: string; menuOpen?: boolean; onMenuOpenChange?: (open: boolean) => void } = {},
) {
  const currentPath = menu.currentPath ?? '/app/profile/edit'
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <ProfileSidebar
        name={name}
        invitationCount={invitationCount}
        homeRegion={homeRegion}
        safetyRequestCount={safetyRequestCount}
        currentPath={currentPath}
        menuOpen={menu.menuOpen ?? false}
        onMenuOpenChange={menu.onMenuOpenChange ?? vi.fn()}
      />
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

  it('shows the number of safety-group requests waiting on you as a badge on Safety Groups — and keeps it apart from the invitation count', () => {
    renderSidebar('Hina Khan', 1, null, 4)

    expect(screen.getByRole('link', { name: /Safety Groups/ })).toHaveTextContent('4')
    expect(screen.getByRole('link', { name: /Invitations/ })).toHaveTextContent('1')
  })

  it('shows no Safety Groups badge for zero or while unknown', () => {
    const { unmount } = renderSidebar('Hina Khan', 0, null, 0)
    expect(screen.getByRole('link', { name: /Safety Groups/ })).not.toHaveTextContent(/\d/)
    unmount()

    renderSidebar('Hina Khan')
    expect(screen.getByRole('link', { name: /Safety Groups/ })).not.toHaveTextContent(/\d/)
  })

  describe('the phone menu (below md)', () => {
    // jsdom applies no CSS, so `hidden` / `md:hidden` can't be seen as hidden here; the tests assert the
    // state the classes hang off (aria-expanded, the class itself) and the browser check confirms the look.
    const toggle = () => screen.getByRole('button', { name: /Edit Profile/ })

    it('names the current section on a button that says whether the links are showing', () => {
      renderSidebar('Hina Khan', undefined, null, undefined, { currentPath: '/app/safety-groups/abc' })

      expect(screen.getByRole('button', { name: /Safety Groups/ })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByRole('button', { name: /Safety Groups/ })).toHaveAttribute('aria-controls', 'profile-nav-links')
    })

    it('hides the links while closed and shows them while open — the links stay in the page for the wide layout either way', () => {
      const { unmount } = renderSidebar('Hina Khan')
      expect(document.getElementById('profile-nav-links')).toHaveClass('hidden', 'md:flex')
      expect(screen.getAllByRole('link')).toHaveLength(9)
      unmount()

      renderSidebar('Hina Khan', undefined, null, undefined, { menuOpen: true })
      expect(toggle()).toHaveAttribute('aria-expanded', 'true')
      expect(document.getElementById('profile-nav-links')).toHaveClass('flex')
      expect(document.getElementById('profile-nav-links')).not.toHaveClass('hidden')
    })

    it('reports a click as the opposite of the current state', async () => {
      const onMenuOpenChange = vi.fn()
      const { unmount } = renderSidebar('Hina Khan', undefined, null, undefined, { onMenuOpenChange })
      await userEvent.click(toggle())
      expect(onMenuOpenChange).toHaveBeenLastCalledWith(true)
      unmount()

      renderSidebar('Hina Khan', undefined, null, undefined, { menuOpen: true, onMenuOpenChange })
      await userEvent.click(toggle())
      expect(onMenuOpenChange).toHaveBeenLastCalledWith(false)
    })

    it('closes on Escape and puts focus back on the button', async () => {
      const onMenuOpenChange = vi.fn()
      renderSidebar('Hina Khan', undefined, null, undefined, { menuOpen: true, onMenuOpenChange })

      screen.getByRole('link', { name: /Account Settings/ }).focus()
      await userEvent.keyboard('{Escape}')

      expect(onMenuOpenChange).toHaveBeenCalledWith(false)
      expect(toggle()).toHaveFocus()
    })

    it('ignores Escape while it is already closed', async () => {
      const onMenuOpenChange = vi.fn()
      renderSidebar('Hina Khan', undefined, null, undefined, { onMenuOpenChange })

      screen.getByRole('link', { name: /Account Settings/ }).focus()
      await userEvent.keyboard('{Escape}')

      expect(onMenuOpenChange).not.toHaveBeenCalled()
    })

    it('shows the current section\'s own count on the button, and what is waiting in the other sections as a separate pill', () => {
      renderSidebar('Hina Khan', 1, null, 4, { currentPath: '/app/safety-groups' })

      const button = screen.getByRole('button', { name: /Safety Groups/ })
      expect(button).toHaveTextContent('Safety Groups4')
      expect(button).toHaveTextContent('1 waiting in other sections')
    })

    it('shows no pill when nothing is waiting anywhere else', () => {
      renderSidebar('Hina Khan', 0, null, 2, { currentPath: '/app/safety-groups' })
      expect(screen.getByRole('button', { name: /Safety Groups/ })).not.toHaveTextContent(/waiting in other sections/)
    })

    it('falls back to Overview for a path outside the sub-nav rather than showing an empty button', () => {
      renderSidebar('Hina Khan', undefined, null, undefined, { currentPath: '/app/somewhere-else' })
      expect(screen.getByRole('button', { name: /Overview/ })).toBeInTheDocument()
    })
  })
})
