import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BellIcon, CaretUpDownIcon, LifebuoyIcon, ListIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { adminNavGroups, ngoNavGroups, type OpsNavGroup } from '@/components/nav/opsSidebarNav'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { useLogout } from '@/features/auth/useLogout'

/** Shared structural shell for NGO Web and Admin Web (WEB_DESIGN_PLAN.md §4.2) — same layout,
 *  different sidebar contents, selected by `role`. */
export function OpsLayout({ role }: { role: 'ngo' | 'admin' }) {
  const [expanded, setExpanded] = useState(true)
  const user = useAuthStore((s) => s.user)
  const { logout, isLoggingOut } = useLogout()
  const groups: OpsNavGroup[] = role === 'admin' ? adminNavGroups : ngoNavGroups
  const isNgoAdmin = user?.role === 'ngo_admin'

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??'
  const roleLabel = role === 'admin' ? 'Admin Console' : 'NGO Console'

  return (
    <div className="flex h-screen bg-surface-base">
      <aside
        className={cn(
          'flex h-full flex-none flex-col overflow-hidden border-e border-surface-border bg-surface-raised transition-[width] duration-200',
          expanded ? 'w-60' : 'w-18',
        )}
      >
        <div className="flex h-16 flex-none items-center gap-2.5 border-b border-surface-border px-5">
          <div className="flex size-8 flex-none items-center justify-center rounded-md bg-primary-500">
            <LifebuoyIcon weight="fill" className="text-white" size={20} />
          </div>
          {expanded && (
            <div className="flex flex-col leading-tight">
              <span className="font-heading text-h3 font-bold text-ink-900">LittleLife</span>
              <span className="font-body text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
                {roleLabel}
              </span>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto py-2">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isNgoAdmin)
            if (items.length === 0) return null
            return (
              <div key={group.label} className="flex flex-col gap-px">
                {expanded && (
                  <div className="px-5 pb-1 font-body text-[10px] font-bold tracking-widest text-ink-300 uppercase">
                    {group.label}
                  </div>
                )}
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'mx-2 flex h-8.5 items-center gap-2.5 rounded-sm border-s-4 border-transparent px-3 font-body text-label whitespace-nowrap text-ink-700 hover:bg-surface-sunken',
                        isActive && 'border-primary-500 bg-primary-50 text-primary-700',
                      )
                    }
                  >
                    <item.icon size={18} className="flex-none" />
                    {expanded && <span className="overflow-hidden text-ellipsis">{item.label}</span>}
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
                {expanded && (
                  <>
                    <div className="flex min-w-0 flex-col text-left">
                      <span className="overflow-hidden text-ellipsis font-body text-label text-ink-900">
                        {user?.email ?? '—'}
                      </span>
                      <span className="mt-0.5 self-start rounded-full bg-status-trust-tint px-2 py-px font-body text-[11px] font-medium text-status-trust">
                        {user?.role}
                      </span>
                    </div>
                    <CaretUpDownIcon size={16} className="ms-auto flex-none text-ink-500" />
                  </>
                )}
              </button>
            }
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-none items-center gap-4 border-b border-surface-border bg-surface-raised px-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex size-9 items-center justify-center rounded-sm text-ink-700 hover:bg-surface-sunken"
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

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
