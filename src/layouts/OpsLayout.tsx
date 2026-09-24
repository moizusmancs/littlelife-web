import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BellIcon, CaretUpDownIcon, LifebuoyIcon, ListIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { adminNavGroups, ngoNavGroups, type OpsNavGroup } from '@/components/nav/opsSidebarNav'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { useLogout } from '@/features/auth/useLogout'

/** Shared structural shell for NGO Web and Admin Web (WEB_DESIGN_PLAN.md §4.2) — same layout,
 *  different sidebar contents, selected by `role`.
 *
 *  From `md` (768px) up the sidebar is an in-flow rail that toggles between full width and
 *  icons-only, exactly as the mockup shows. Below `md` there's no room for a 240px rail beside the
 *  content (at 390px it left the page ~150px), so it becomes an off-canvas drawer: hidden by
 *  default, opened by the header's menu button, closed by the backdrop, Escape, or choosing a link.
 *  The two states are independent (`expanded` for the rail, `mobileOpen` for the drawer), and a
 *  collapsed rail never affects the drawer — labels are only hidden with `md:hidden`. */
export function OpsLayout({ role }: { role: 'ngo' | 'admin' }) {
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])
  const user = useAuthStore((s) => s.user)
  const { logout, isLoggingOut } = useLogout()
  const groups: OpsNavGroup[] = role === 'admin' ? adminNavGroups : ngoNavGroups
  const isNgoAdmin = user?.role === 'ngo_admin'

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??'
  const roleLabel = role === 'admin' ? 'Admin Console' : 'NGO Console'

  return (
    <div className="flex h-screen bg-surface-base">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        data-mobile-open={mobileOpen}
        className={cn(
          'flex h-full flex-none flex-col overflow-hidden border-e border-surface-border bg-surface-raised',
          // Below md: an off-canvas drawer (invisible when closed so it's out of the tab order too).
          'max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-40 max-md:w-60 max-md:transition-[transform,visibility] max-md:duration-200',
          mobileOpen ? 'max-md:shadow-lg' : 'max-md:invisible max-md:-translate-x-full',
          // From md: the in-flow rail.
          'md:transition-[width] md:duration-200',
          expanded ? 'md:w-60' : 'md:w-18',
        )}
      >
        <div className="flex h-16 flex-none items-center gap-2.5 border-b border-surface-border px-5">
          <div className="flex size-8 flex-none items-center justify-center rounded-md bg-primary-500">
            <LifebuoyIcon weight="fill" className="text-white" size={20} />
          </div>
          <div className={cn('flex flex-col leading-tight', !expanded && 'md:hidden')}>
            <span className="font-heading text-h3 font-bold text-ink-900">LittleLife</span>
            <span className="font-body text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
              {roleLabel}
            </span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto py-2">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isNgoAdmin)
            if (items.length === 0) return null
            return (
              <div key={group.label} className="flex flex-col gap-px">
                <div
                  className={cn(
                    'px-5 pb-1 font-body text-[10px] font-bold tracking-widest text-ink-300 uppercase',
                    !expanded && 'md:hidden',
                  )}
                >
                  {group.label}
                </div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'mx-2 flex h-8.5 items-center gap-2.5 rounded-sm border-s-4 border-transparent px-3 font-body text-label whitespace-nowrap text-ink-700 hover:bg-surface-sunken',
                        isActive && 'border-primary-500 bg-primary-50 text-primary-700',
                      )
                    }
                  >
                    <item.icon size={18} className="flex-none" />
                    <span className={cn('overflow-hidden text-ellipsis', !expanded && 'md:hidden')}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="flex-none border-t border-surface-border px-4 py-3">
          <AccountMenu
            email={user?.email ?? ''}
            roleLabel={user?.role ?? ''}
            onLogout={logout}
            isLoggingOut={isLoggingOut}
            trigger={
              <button type="button" className="flex w-full items-center gap-2.5 rounded-sm" aria-label="Account menu">
                <div className="flex size-9 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-label font-semibold text-primary-700">
                  {initials}
                </div>
                <div className={cn('flex min-w-0 flex-col text-left', !expanded && 'md:hidden')}>
                  <span className="overflow-hidden text-ellipsis font-body text-label text-ink-900">
                    {user?.email ?? '—'}
                  </span>
                  <span className="mt-0.5 self-start rounded-full bg-status-trust-tint px-2 py-px font-body text-[11px] font-medium text-status-trust">
                    {user?.role}
                  </span>
                </div>
                <CaretUpDownIcon size={16} className={cn('ms-auto flex-none text-ink-500', !expanded && 'md:hidden')} />
              </button>
            }
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-none items-center gap-4 border-b border-surface-border bg-surface-raised px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-sm text-ink-700 hover:bg-surface-sunken md:hidden"
            aria-label="Open menu"
          >
            <ListIcon size={20} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="hidden size-9 items-center justify-center rounded-sm text-ink-700 hover:bg-surface-sunken md:flex"
            aria-label="Toggle sidebar"
          >
            <ListIcon size={20} />
          </button>
          <div className="ms-auto flex items-center gap-3">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full text-ink-700 hover:bg-surface-sunken"
              aria-label="Notifications"
            >
              <BellIcon size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
