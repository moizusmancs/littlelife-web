import { matchPath } from 'react-router-dom'
import type { Icon } from '@phosphor-icons/react'
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

export const INVITATIONS_PATH = '/app/profile/invitations'
export const SAFETY_GROUPS_PATH = '/app/safety-groups'

export interface ProfileNavItem {
  label: string
  to: string
  icon: Icon
  /** Match the path exactly (Overview), instead of it and everything under it. */
  end?: boolean
}

/** The Profile sub-nav (Batch 2 §2g), in the mockup's order. Safety Groups lives at its own `/app/safety-groups` URLs but is listed here. */
export const PROFILE_NAV_ITEMS: ProfileNavItem[] = [
  { label: 'Overview', to: '/app/profile', icon: UserCircleIcon, end: true },
  { label: 'Edit Profile', to: '/app/profile/edit', icon: PencilSimpleIcon },
  { label: 'Alert Preferences', to: '/app/profile/alert-preferences', icon: BellRingingIcon },
  { label: 'Account Settings', to: '/app/profile/account-settings', icon: GearIcon },
  { label: 'Credibility', to: '/app/profile/credibility', icon: SealCheckIcon },
  { label: 'Activity', to: '/app/profile/activity', icon: ClockCounterClockwiseIcon },
  { label: 'Safety Groups', to: SAFETY_GROUPS_PATH, icon: UsersThreeIcon },
  { label: 'My NGO', to: '/app/profile/ngo', icon: BuildingsIcon },
  { label: 'Invitations', to: INVITATIONS_PATH, icon: EnvelopeOpenIcon },
]

/**
 * The item the current URL belongs to — what a phone's collapsed menu names — using the same rule as
 * `NavLink` (a path and everything under it; `end` for Overview), so the two never disagree.
 * `undefined` for a path that isn't in the sub-nav at all.
 */
export function currentProfileNavItem(pathname: string): ProfileNavItem | undefined {
  return PROFILE_NAV_ITEMS.find((item) => matchPath({ path: item.to, end: item.end ?? false }, pathname))
}
