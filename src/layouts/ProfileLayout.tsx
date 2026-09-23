import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { getProfile, PROFILE_QUERY_KEY } from '@/api/profiling'
import { ProfileSidebar } from '@/features/profile/ProfileSidebar'

/**
 * Shared chrome for every `/app/profile/*` screen (Pattern W-Settings — pixel reference: Batch 2
 * §2g, see ProfileSidebar's own comment) — rendered inside CitizenLayout's `<Outlet>`, so it only
 * owns the sidebar + content split, not the top nav header (CitizenLayout already provides that).
 * Owns the one query every nested screen needs (the account's `name`) so the sidebar header and
 * Edit Profile's form share a single cache entry instead of both fetching independently.
 */
export function ProfileLayout() {
  const { data } = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile() })

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <ProfileSidebar name={data?.name ?? null} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
