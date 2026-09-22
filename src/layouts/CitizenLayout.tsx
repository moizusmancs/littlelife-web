import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BellIcon,
  ChatCircleDotsIcon,
  FirstAidKitIcon,
  HouseIcon,
  LifebuoyIcon,
  ListIcon,
  MapTrifoldIcon,
  UsersThreeIcon,
  XIcon,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { useLogout } from '@/features/auth/useLogout'

const NAV_LINKS = [
  { label: 'Home', to: '/app/home', icon: HouseIcon },
  { label: 'Map', to: '/app/map', icon: MapTrifoldIcon },
  { label: 'Community', to: '/app/community', icon: UsersThreeIcon },
  { label: 'Resources', to: '/app/resources', icon: FirstAidKitIcon },
]

/** Citizen Web's shell mirrors mobile's flatter IA as a top nav, not a sidebar — it should feel
 *  like the mobile app's tab bar translated up into a header (WEB_DESIGN_PLAN.md §4.1). Below
 *  768px (Tailwind's default `md`) the center links collapse into a hamburger menu. */
export function CitizenLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { logout, isLoggingOut } = useLogout()
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??'

  return (
    <div className="flex min-h-screen flex-col bg-surface-base">
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-raised">
        <div className="mx-auto flex h-16 max-w-360 items-center gap-4 px-4 md:px-6">
          <NavLink to="/app/home" className="flex flex-none items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-peach-400">
              <LifebuoyIcon weight="fill" className="text-white" size={20} />
            </div>
            <span className="font-heading text-h3 font-bold text-ink-900">LittleLife</span>
          </NavLink>

          <nav className="ms-6 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-full px-4 py-2 font-body text-label text-ink-700 hover:bg-surface-sunken',
                    isActive && 'bg-primary-50 text-primary-700',
                  )
                }
              >
                <link.icon size={18} />
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full text-ink-700 hover:bg-surface-sunken"
              aria-label="Notifications"
            >
              <BellIcon size={20} />
            </button>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full text-ink-700 hover:bg-surface-sunken"
              aria-label="AI Chatbot"
            >
              <ChatCircleDotsIcon size={20} />
            </button>
            <AccountMenu
              email={user?.email ?? ''}
              roleLabel="Citizen"
              onLogout={logout}
              isLoggingOut={isLoggingOut}
              trigger={
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full bg-primary-100 font-heading text-label font-semibold text-primary-700"
                  aria-label="Account menu"
                >
                  {initials}
                </button>
              }
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex size-10 items-center justify-center rounded-full text-ink-700 hover:bg-surface-sunken md:hidden"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <XIcon size={20} /> : <ListIcon size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="flex flex-col gap-1 border-t border-surface-border px-4 py-2 md:hidden">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-sm px-3 py-2.5 font-body text-body-md text-ink-700',
                    isActive && 'bg-primary-50 text-primary-700',
                  )
                }
              >
                <link.icon size={20} />
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-360 flex-1 px-4 py-6 md:px-6">
        <Outlet />
      </main>
    </div>
  )
}
