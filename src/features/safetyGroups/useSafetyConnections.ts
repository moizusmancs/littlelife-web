import { useQuery } from '@tanstack/react-query'
import { listSafetyConnections, SAFETY_CONNECTIONS_QUERY_KEY } from '@/api/trust'
import { withInviteHints } from './inviteHints'

/**
 * `GET /safety-connections` for the list and detail screens: the shared query (so the sidebar count, the
 * list and the detail page stay in step) with the emails you typed put back on the requests you sent — see
 * `withInviteHints`. The sidebar reads the same cache entry without the hints; it only counts.
 */
export function useSafetyConnections(me: string) {
  return useQuery({
    queryKey: SAFETY_CONNECTIONS_QUERY_KEY,
    queryFn: listSafetyConnections,
    select: (connections) => withInviteHints(connections, me),
  })
}
