import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { INCIDENT_REPORTS_QUERY_KEY, MY_VOTES_QUERY_KEY, castVote, listMyVotes, removeVote, type IncidentReport, type MyVote, type VoteType } from '@/api/community'
import { extractErrorMessage } from '@/api/errors'
import { nextVote, votesById, withVoteChange } from './feedModel'

const VOTE_KEY = ['incident-reports', 'vote'] as const
/** The report lists (`['incident-reports', 'bbox', …]`) — not the media or the votes, which share the prefix. */
const isReportList = (query: Query) => query.queryKey[1] === 'bbox'

interface VoteChange {
  reportId: string
  to: VoteType | null
}

/**
 * The viewer's votes and a way to press a vote button. The votes come from `GET /incident-reports/my-votes` (every vote the account
 * has cast, one request, cached — the cache is cleared when the account changes). A press is applied to the screen **at once** — the
 * pressed state and the report's totals, in every cached list — and then sent (`POST` to cast or switch, `DELETE` to take back);
 * presses are sent one at a time, in order (`scope`), so a quick second press can't arrive before the first. When the
 * last queued press has landed the lists and the votes are read again, so what stays on screen is the server's truth. A refused press
 * (e.g. `404` — the report has gone) reads the truth back at once and keeps the server's words for the page to show.
 */
export function useVotes() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({ queryKey: MY_VOTES_QUERY_KEY, queryFn: () => listMyVotes() })
  const mine = useMemo(() => (query.data ? votesById(query.data) : null), [query.data])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: MY_VOTES_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: INCIDENT_REPORTS_QUERY_KEY, predicate: isReportList })
  }

  const mutation = useMutation({
    mutationKey: VOTE_KEY,
    // One queue for every vote (a scope is fixed per mutation, not per call): presses land in the order they were made.
    scope: { id: 'incident-votes' },
    mutationFn: ({ reportId, to }: VoteChange) => (to ? castVote(reportId, to) : removeVote(reportId)),
    onSuccess: () => {
      if (queryClient.isMutating({ mutationKey: VOTE_KEY }) <= 1) refresh()
    },
    onError: (e) => {
      const gone = isAxiosError(e) && e.response?.status === 404
      setError(gone ? 'That report is no longer available, so your vote wasn’t counted. The feed has been refreshed.' : `Your vote wasn’t saved: ${extractErrorMessage(e)}`)
      refresh()
    },
  })

  /** Applies the press to every cached copy (so it shows at once), then queues the request behind any earlier press on the same report. */
  const press = (report: IncidentReport, pressed: VoteType) => {
    if (!mine) return
    const from = mine[report.id] ?? null
    const to = nextVote(from, pressed)
    setError(null)
    void queryClient.cancelQueries({ queryKey: MY_VOTES_QUERY_KEY })
    void queryClient.cancelQueries({ queryKey: INCIDENT_REPORTS_QUERY_KEY, predicate: isReportList })
    queryClient.setQueryData<MyVote[]>(MY_VOTES_QUERY_KEY, (votes = []) => {
      const others = votes.filter((vote) => vote.incident_report_id !== report.id)
      return to ? [{ incident_report_id: report.id, vote_type: to, created_at: new Date().toISOString() }, ...others] : others
    })
    queryClient.setQueriesData<IncidentReport[]>({ queryKey: INCIDENT_REPORTS_QUERY_KEY, predicate: isReportList }, (reports) =>
      reports?.map((item) => (item.id === report.id ? withVoteChange(item, from, to) : item)),
    )
    mutation.mutate({ reportId: report.id, to })
  }

  return {
    /** Report id → the viewer's vote; `null` until the votes have loaded (or when they couldn't be), when the buttons stay off. */
    mine,
    isLoading: query.isPending,
    loadError: query.isError ? extractErrorMessage(query.error) : null,
    retry: () => void query.refetch(),
    press,
    error,
    dismissError: () => setError(null),
  }
}
