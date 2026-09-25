import { useRef, type KeyboardEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { CaretDownIcon, MapPinIcon, UserCircleIcon } from '@phosphor-icons/react'
import { cn, getInitials } from '@/lib/utils'
import { currentProfileNavItem, INVITATIONS_PATH, PROFILE_NAV_ITEMS, SAFETY_GROUPS_PATH } from './profileNav'

export interface ProfileSidebarProps {
  /** The account's real `name` (Profiling's only built field) once loaded — `null` specifically
   *  means "the fetch hasn't resolved yet" (renders a skeleton), which must be checked with
   *  `!== null`, not truthiness: a freshly-registered, not-yet-onboarded-past-this-screen
   *  account's real `name` is `""` (api/05-profiling.md's documented "not yet set" state), and
   *  that's a loaded value, not a loading one — collapsing the two would leave the sidebar
   *  stuck on its skeleton forever for exactly the account most likely to be looking at this
   *  screen. No verified-badge/level chip here (unlike the Profile › Invitations pixel reference,
   *  Batch 2 §2g) — that comes from Trust (Phase 4), not built yet; showing it now would mean
   *  fabricating data. */
  name: string | null
  /** The home region as a short line ("Sukkur City, Sukkur"), or `null`/`undefined` when none is set
   *  (it's optional) — nothing is drawn in that case. */
  homeRegion?: string | null
  /** Real count of pending volunteer invitations (`GET /volunteer-invitations`), shown as the
   *  pink pill on the Invitations item exactly as in the mockup. `undefined` while it's loading
   *  or if the fetch failed, `0` when there are none — neither shows a badge. */
  invitationCount?: number
  /** Connection requests waiting on *this* account's answer (`GET /safety-connections`, pending and
   *  sent to them), shown as the same pink pill on Safety Groups — there's no notification for a new
   *  request, so this is how it gets noticed. `undefined`/`0` shows nothing. */
  safetyRequestCount?: number
  /** The current URL's path — what the collapsed (phone) menu names as the current section. */
  currentPath: string
  /** Whether the phone menu is open. Has no effect from `md` up, where the links are always shown. */
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
}

/**
 * Pixel reference: Batch 2 (`LittleLife Web Mockups.dc.html`) §2g "Profile › Invitations" is
 * the only mockup that shows this shared W-Settings sub-nav shell — reused here verbatim (same
 * `profNav` item set/icons/layout) even though Edit Profile itself isn't separately pictured.
 * Every listed destination already exists as a real route (PlaceholderPage or the real screen) —
 * see router.tsx — so nothing here links to a dead route. The mockup's "Invitations" item carries
 * a pending-count badge, now backed by the real `GET /volunteer-invitations` count, and its header
 * shows the account's home region (the mockup's "Johi, Dadu") when one is set.
 * From `md` up it is a sidebar with every link showing. Below it (a phone) nine stacked links would push
 * the page's own content a screen down, so they collapse behind one button that names the current section
 * (with its count, and a pill for what's waiting in the *other* sections, so a pending request isn't hidden
 * by the menu being shut). The phone's open/closed state belongs to ProfileLayout (`menuOpen`); which links
 * are current is `NavLink`'s own route matching. Escape closes the menu and returns focus to the button.
 * The links are hidden with CSS (`hidden md:flex`), not unmounted, so the wide layout can't lose them.
 */
export function ProfileSidebar({
  name,
  homeRegion,
  invitationCount,
  safetyRequestCount,
  currentPath,
  menuOpen,
  onMenuOpenChange,
}: ProfileSidebarProps) {
  const isLoaded = name !== null
  const initials = getInitials(name ?? '')
  const badges: Record<string, number | undefined> = {
    [INVITATIONS_PATH]: invitationCount,
    [SAFETY_GROUPS_PATH]: safetyRequestCount,
  }
  const current = currentProfileNavItem(currentPath) ?? PROFILE_NAV_ITEMS[0]
  const waitingElsewhere = PROFILE_NAV_ITEMS.reduce((sum, item) => (item.to === current.to ? sum : sum + (badges[item.to] ?? 0)), 0)
  const toggle = useRef<HTMLButtonElement>(null)

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !menuOpen) return
    onMenuOpenChange(false)
    toggle.current?.focus()
  }

  return (
    <div className="flex w-full flex-col gap-1 md:w-65 md:flex-none">
      <div className="flex items-center gap-3 px-3 pt-2 pb-3 md:pb-5">
        {isLoaded ? (
          <div className="flex size-13 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-body-lg font-bold text-primary-700">
            {initials || <UserCircleIcon size={26} />}
          </div>
        ) : (
          <div className="size-13 flex-none animate-pulse rounded-full bg-surface-sunken" aria-hidden="true" />
        )}
        <div className="min-w-0">
          {isLoaded ? (
            <p className="truncate font-heading text-body-lg font-bold text-ink-900">{name || 'Add your name'}</p>
          ) : (
            <div className="h-5 w-32 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          )}
          {homeRegion && (
            <p className="mt-0.5 flex items-center gap-1 font-body text-body-sm text-ink-500">
              <MapPinIcon size={14} className="flex-none" aria-hidden="true" />
              <span className="truncate">{homeRegion}</span>
            </p>
          )}
        </div>
      </div>

      <nav className="flex flex-col gap-1" onKeyDown={closeOnEscape}>
        <button
          ref={toggle}
          type="button"
          className="flex h-11 items-center gap-3 rounded-md border border-surface-border bg-surface-raised px-3.5 font-body text-body-md text-ink-900 md:hidden"
          aria-expanded={menuOpen}
          aria-controls="profile-nav-links"
          onClick={() => onMenuOpenChange(!menuOpen)}
        >
          <current.icon size={20} className="flex-none text-primary-700" aria-hidden="true" />
          <span className="flex-1 truncate text-left font-semibold">{current.label}</span>
          {!!badges[current.to] && (
            <span className="flex-none rounded-full bg-primary-500 px-1.75 py-0.5 font-body text-[11px] font-semibold text-white">
              {badges[current.to]}
            </span>
          )}
          {waitingElsewhere > 0 && (
            <span className="flex-none rounded-full border border-primary-500 px-1.75 py-0.5 font-body text-[11px] font-semibold text-primary-700">
              {waitingElsewhere}
              <span className="sr-only"> waiting in other sections</span>
            </span>
          )}
          <CaretDownIcon size={16} className={cn('flex-none text-ink-500 transition-transform', menuOpen && 'rotate-180')} aria-hidden="true" />
        </button>

        <div id="profile-nav-links" className={cn('flex-col gap-1 md:flex', menuOpen ? 'flex' : 'hidden')}>
          {PROFILE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-md px-3.5 font-body text-body-md text-ink-700 hover:bg-surface-sunken',
                  isActive && 'bg-primary-50 text-primary-700',
                )
              }
            >
              <item.icon size={20} className="flex-none" />
              <span className="flex-1 truncate">{item.label}</span>
              {!!badges[item.to] && (
                <span className="flex-none rounded-full bg-primary-500 px-1.75 py-0.5 font-body text-[11px] font-semibold text-white">
                  {badges[item.to]}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
