import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { getVolunteerInvitations, INVITATIONS_QUERY_KEY } from '@/api/identity'
import { getProfile, PROFILE_QUERY_KEY } from '@/api/profiling'
import { listSafetyConnections, SAFETY_CONNECTIONS_QUERY_KEY } from '@/api/trust'
import { homeRegionLabel } from '@/features/profile/homeRegion'
import { ProfileSidebar } from '@/features/profile/ProfileSidebar'
import { incomingCount } from '@/features/safetyGroups/connections'
import { useAuthStore } from '@/store/auth'

/**
 * Shared chrome for every `/app/profile/*` screen (Pattern W-Settings — pixel reference: Batch 2
 * §2g, see ProfileSidebar's own comment) — rendered inside CitizenLayout's `<Outlet>`, so it only
 * owns the sidebar + content split, not the top nav header (CitizenLayout already provides that).
 * Owns the queries the sidebar itself needs — the account's profile (`name` and home region), the
 * pending-invitation count for the Invitations badge, and the safety connections for the Safety Groups badge (requests
 * waiting on this account) — under shared keys, so Edit Profile's form, the Invitations screen and the Safety Groups
 * screens read the very same cache entries instead of fetching independently, and a save/decline/accept
 * elsewhere updates the sidebar immediately. Safety Groups renders in here too, though its URLs are
 * `/app/safety-groups*` rather than `/app/profile/*`. Also owns the phone menu's open/closed state (below `md`
 * the sub-nav collapses behind a button — see ProfileSidebar).
 */
export function ProfileLayout() {
  const { data } = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile() })
  const { data: invitations } = useQuery({ queryKey: INVITATIONS_QUERY_KEY, queryFn: getVolunteerInvitations })
  const me = useAuthStore((s) => s.user?.id) ?? ''
  const { data: connections } = useQuery({ queryKey: SAFETY_CONNECTIONS_QUERY_KEY, queryFn: listSafetyConnections })

  // The phone's collapsed menu is open for exactly the page it was opened on: remembering *where* it was
  // opened means following any link (or the back button) closes it, with no effect to reset it.
  const { pathname } = useLocation()
  const [openAt, setOpenAt] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <ProfileSidebar
        name={data?.name ?? null}
        homeRegion={data ? homeRegionLabel(data) : null}
        invitationCount={invitations?.length}
        safetyRequestCount={connections ? incomingCount(connections, me) : undefined}
        currentPath={pathname}
        menuOpen={openAt === pathname}
        onMenuOpenChange={(open) => setOpenAt(open ? pathname : null)}
      />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
