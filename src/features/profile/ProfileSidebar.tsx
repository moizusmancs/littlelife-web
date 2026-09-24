import { NavLink } from 'react-router-dom'
import {
  BellRingingIcon,
  BuildingsIcon,
  ClockCounterClockwiseIcon,
  EnvelopeOpenIcon,
  GearIcon,
  MapPinIcon,
  PencilSimpleIcon,
  SealCheckIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { cn, getInitials } from '@/lib/utils'

const INVITATIONS_PATH = '/app/profile/invitations'

const NAV_ITEMS = [
  { label: 'Overview', to: '/app/profile', icon: UserCircleIcon, end: true },
  { label: 'Edit Profile', to: '/app/profile/edit', icon: PencilSimpleIcon },
  { label: 'Alert Preferences', to: '/app/profile/alert-preferences', icon: BellRingingIcon },
  { label: 'Account Settings', to: '/app/profile/account-settings', icon: GearIcon },
  { label: 'Credibility', to: '/app/profile/credibility', icon: SealCheckIcon },
  { label: 'Activity', to: '/app/profile/activity', icon: ClockCounterClockwiseIcon },
  { label: 'Safety Groups', to: '/app/safety-groups', icon: UsersThreeIcon },
  { label: 'My NGO', to: '/app/profile/ngo', icon: BuildingsIcon },
  { label: 'Invitations', to: INVITATIONS_PATH, icon: EnvelopeOpenIcon },
]

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
}

/**
 * Pixel reference: Batch 2 (`LittleLife Web Mockups.dc.html`) §2g "Profile › Invitations" is
 * the only mockup that shows this shared W-Settings sub-nav shell — reused here verbatim (same
 * `profNav` item set/icons/layout) even though Edit Profile itself isn't separately pictured.
 * Every listed destination already exists as a real route (PlaceholderPage or the real screen) —
 * see router.tsx — so nothing here links to a dead route. The mockup's "Invitations" item carries
 * a pending-count badge, now backed by the real `GET /volunteer-invitations` count, and its header
 * shows the account's home region (the mockup's "Johi, Dadu") when one is set.
 * Purely presentational: `NavLink`'s own active-route detection is the only "state" here, same
 * precedent as `CitizenLayout`'s top nav.
 */
export function ProfileSidebar({ name, homeRegion, invitationCount }: ProfileSidebarProps) {
  const isLoaded = name !== null
  const initials = getInitials(name ?? '')

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
          {homeRegion && (
            <p className="mt-0.5 flex items-center gap-1 font-body text-body-sm text-ink-500">
              <MapPinIcon size={14} className="flex-none" aria-hidden="true" />
              <span className="truncate">{homeRegion}</span>
            </p>
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
            <span className="flex-1 truncate">{item.label}</span>
            {item.to === INVITATIONS_PATH && !!invitationCount && (
              <span className="flex-none rounded-full bg-primary-500 px-1.75 py-0.5 font-body text-[11px] font-semibold text-white">
                {invitationCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
