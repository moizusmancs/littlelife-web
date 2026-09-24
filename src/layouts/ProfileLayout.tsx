import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { getVolunteerInvitations, INVITATIONS_QUERY_KEY } from '@/api/identity'
import { getProfile, PROFILE_QUERY_KEY } from '@/api/profiling'
import { ProfileSidebar } from '@/features/profile/ProfileSidebar'

/**
 * Shared chrome for every `/app/profile/*` screen (Pattern W-Settings — pixel reference: Batch 2
 * §2g, see ProfileSidebar's own comment) — rendered inside CitizenLayout's `<Outlet>`, so it only
 * owns the sidebar + content split, not the top nav header (CitizenLayout already provides that).
 * Owns the two queries the sidebar itself needs — the account's `name` and the pending-invitation
 * count for the Invitations badge — under shared keys, so Edit Profile's form and the Invitations
 * screen read the very same cache entries instead of fetching independently, and a save/decline
 * elsewhere updates the sidebar immediately.
 */
export function ProfileLayout() {
  const { data } = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile() })
  const { data: invitations } = useQuery({ queryKey: INVITATIONS_QUERY_KEY, queryFn: getVolunteerInvitations })

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <ProfileSidebar name={data?.name ?? null} invitationCount={invitations?.length} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
