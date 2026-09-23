import { NavLink } from 'react-router-dom'
import {
  BellRingingIcon,
  BuildingsIcon,
  ClockCounterClockwiseIcon,
  EnvelopeOpenIcon,
  GearIcon,
  PencilSimpleIcon,
  SealCheckIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Overview', to: '/app/profile', icon: UserCircleIcon, end: true },
  { label: 'Edit Profile', to: '/app/profile/edit', icon: PencilSimpleIcon },
  { label: 'Alert Preferences', to: '/app/profile/alert-preferences', icon: BellRingingIcon },
  { label: 'Account Settings', to: '/app/profile/account-settings', icon: GearIcon },
  { label: 'Credibility', to: '/app/profile/credibility', icon: SealCheckIcon },
  { label: 'Activity', to: '/app/profile/activity', icon: ClockCounterClockwiseIcon },
  { label: 'Safety Groups', to: '/app/safety-groups', icon: UsersThreeIcon },
  { label: 'My NGO', to: '/app/profile/ngo', icon: BuildingsIcon },
  { label: 'Invitations', to: '/app/profile/invitations', icon: EnvelopeOpenIcon },
]

export interface ProfileSidebarProps {
  /** The account's real `name` (Profiling's only built field) once loaded — `null` specifically
   *  means "the fetch hasn't resolved yet" (renders a skeleton), which must be checked with
   *  `!== null`, not truthiness: a freshly-registered, not-yet-onboarded-past-this-screen
   *  account's real `name` is `""` (api/05-profiling.md's documented "not yet set" state), and
   *  that's a loaded value, not a loading one — collapsing the two would leave the sidebar
   *  stuck on its skeleton forever for exactly the account most likely to be looking at this
   *  screen. No location/verified-badge/level chip here (unlike the Profile › Invitations pixel
   *  reference, Batch 2 §2g) — those come from Geo/Trust (Phases 2/4), not built yet; showing
   *  them now would mean fabricating data. */
  name: string | null
}

/**
 * Pixel reference: Batch 2 (`LittleLife Web Mockups.dc.html`) §2g "Profile › Invitations" is
 * the only mockup that shows this shared W-Settings sub-nav shell — reused here verbatim (same
 * `profNav` item set/icons/layout) even though Edit Profile itself isn't separately pictured.
 * Every listed destination already exists as a real route (PlaceholderPage or, for Edit
 * Profile, the real screen) — see router.tsx — so nothing here links to a dead route. The
 * mockup's "Invitations" item carries a pending-count badge; omitted here since Invitations
 * isn't built yet and there's no real count to show.
 * Purely presentational: `NavLink`'s own active-route detection is the only "state" here, same
 * precedent as `CitizenLayout`'s top nav.
 */
export function ProfileSidebar({ name }: ProfileSidebarProps) {
  const isLoaded = name !== null
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')
    : ''

  return (
    <div className="flex w-full flex-col gap-1 md:w-65 md:flex-none">
      <div className="flex items-center gap-3 px-3 pt-2 pb-5">
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
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
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
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
