/** A report's page. The id is encoded so a strange one can't change the route. */
export const incidentPath = (reportId: string) => `/app/community/${encodeURIComponent(reportId)}`

/** What the feed hands a report's page: the feed's own address with its view, so Back returns to the same tab, filter and search. */
export interface IncidentLinkState {
  from: string
}

/** The feed address to go Back to — the one the feed passed, when it is a feed address, else the plain feed (a direct link has none). */
export function backToFeed(state: unknown): string {
  const from = (state as Partial<IncidentLinkState> | null)?.from
  return typeof from === 'string' && (from === '/app/community' || from.startsWith('/app/community?')) ? from : '/app/community'
}
