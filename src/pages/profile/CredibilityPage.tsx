import { useQuery } from '@tanstack/react-query'
import { getMyTrustScore, MY_TRUST_SCORE_QUERY_KEY } from '@/api/trust'
import { extractErrorMessage } from '@/api/errors'
import { CredibilityPanel } from '@/features/trust/CredibilityPanel'

/**
 * Container for /app/profile/credibility — owns the `GET /trust-score` query; CredibilityPanel is pure presentation.
 * It's the caller's own score only (the route takes no id), so there is nothing to look up and no way to see anyone else's
 * here. A failed load shows the server's message with a retry rather than an empty score, which would read as "never scored".
 */
export function CredibilityPage() {
  const query = useQuery({ queryKey: MY_TRUST_SCORE_QUERY_KEY, queryFn: getMyTrustScore })

  return (
    <CredibilityPanel
      score={query.data}
      isLoading={query.isPending}
      error={query.isError ? extractErrorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
    />
  )
}
