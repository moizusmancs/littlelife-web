import { http, HttpResponse } from 'msw'
import type { CommunityUpdate, IncidentMedia, IncidentReport, VoteType } from '@/api/community'
import type { Region } from '@/api/geo'
import { server } from '@/mocks/server'
import { makeRegion } from '@/features/regions/testRegion'
import { ME } from './fixtures'

/** Shared by the Community Feed and Incident Detail page tests: a stand-in for the backend's community routes. */

export const sindh = makeRegion('sindh', 'Sindh', 'province')
export const sukkurCity = makeRegion('sukkur-city', 'Sukkur City', 'tehsil', 'sindh')
export const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()

export interface CommunityServeOptions {
  reports?: IncidentReport[]
  updates?: Record<string, CommunityUpdate[]>
  media?: Record<string, IncidentMedia[]>
  regions?: Region[]
  homeRegionId?: string
  failReports?: boolean
  failUpdates?: boolean
  /** The viewer's votes the server starts with, report id → vote. */
  myVotes?: Record<string, VoteType>
  failMyVotes?: boolean
  failMedia?: boolean
  /** `GET /incident-reports/{id}` answers a 500 while set. */
  failOne?: boolean
}

/**
 * A stand-in for the backend's read routes and its two vote routes, in their real shapes and rules: the list needs a `bbox` (and answers
 * every status), media is per report and `[]` for one it doesn't know, a region's updates are that region's plus the platform-wide ones;
 * `POST …/votes` is an upsert that moves the report's counters (a repeat changes nothing), `DELETE` takes the vote back and is a `204`
 * whether or not there was one, and `my-votes` returns the caller's votes. Records every request; `state.gate` holds the first vote request until
 * released, `state.refuse` makes the next vote request fail with the backend's words.
 */
export function serveCommunity(options: CommunityServeOptions = {}) {
  const calls = { reports: [] as string[], media: [] as string[], updates: [] as string[], myVotes: 0, votes: [] as string[], one: [] as string[] }
  const reports = (options.reports ?? []).map((report) => ({ ...report }))
  const votes: Record<string, VoteType> = { ...(options.myVotes ?? {}) }
  const state = {
    failReports: options.failReports ?? false,
    failMyVotes: options.failMyVotes ?? false,
    failMedia: options.failMedia ?? false,
    failOne: options.failOne ?? false,
    gate: null as Promise<void> | null,
    refuse: null as { status: number; error: string } | null,
  }
  const setVote = (id: string, to: VoteType | null) => {
    const report = reports.find((r) => r.id === id)
    const from = votes[id] ?? null
    if (report && from !== to) {
      if (from === 'upvote') report.upvote_count -= 1
      if (from === 'downvote') report.downvote_count -= 1
      if (to === 'upvote') report.upvote_count += 1
      if (to === 'downvote') report.downvote_count += 1
    }
    if (to) votes[id] = to
    else delete votes[id]
  }
  server.use(
    http.get('*/incident-reports/my-votes', () => {
      calls.myVotes += 1
      if (state.failMyVotes) return HttpResponse.json({ error: 'database unavailable' }, { status: 500 })
      return HttpResponse.json(Object.entries(votes).map(([id, type]) => ({ incident_report_id: id, vote_type: type, created_at: '2026-09-26T12:00:00Z' })))
    }),
    // Registered after my-votes, so that static path is never read as an id (as in the backend's router).
    http.get('*/incident-reports/:id', ({ params }) => {
      const id = String(params.id)
      calls.one.push(id)
      if (state.failOne) return HttpResponse.json({ error: 'database unavailable' }, { status: 500 })
      if (!/^[0-9a-z-]+$/.test(id) || id === 'not-a-uuid') return HttpResponse.json({ error: 'id must be a valid uuid' }, { status: 400 })
      const report = reports.find((r) => r.id === id)
      return report ? HttpResponse.json(report) : HttpResponse.json({ error: 'incident report not found' }, { status: 404 })
    }),
    http.post('*/incident-reports/:id/votes', async ({ params, request }) => {
      const { vote_type } = (await request.json()) as { vote_type: VoteType }
      calls.votes.push(`POST ${params.id} ${vote_type}`)
      // Only the first vote request waits for the gate, so a second one sent without waiting would overtake it.
      if (state.gate && calls.votes.length === 1) await state.gate
      if (state.refuse) return HttpResponse.json({ error: state.refuse.error }, { status: state.refuse.status })
      if (!reports.some((r) => r.id === params.id)) return HttpResponse.json({ error: 'incident report not found' }, { status: 404 })
      setVote(String(params.id), vote_type)
      return HttpResponse.json({ id: 'v', incident_report_id: params.id, account_id: ME, vote_type, created_at: '2026-09-26T12:00:00Z' })
    }),
    http.delete('*/incident-reports/:id/votes', async ({ params }) => {
      calls.votes.push(`DELETE ${params.id}`)
      if (state.gate && calls.votes.length === 1) await state.gate
      if (state.refuse) return HttpResponse.json({ error: state.refuse.error }, { status: state.refuse.status })
      setVote(String(params.id), null)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/regions', () => HttpResponse.json(options.regions ?? [sindh, sukkurCity])),
    http.get('*/profile', () =>
      HttpResponse.json({ id: 'p', account_id: ME, name: 'Hina', ...(options.homeRegionId ? { home_region_id: options.homeRegionId } : {}), created_at: '', updated_at: '' }),
    ),
    http.get('*/incident-reports', ({ request }) => {
      calls.reports.push(new URL(request.url).search)
      if (state.failReports) return HttpResponse.json({ error: 'database unavailable' }, { status: 500 })
      return HttpResponse.json(reports)
    }),
    http.get('*/incident-reports/:id/media', ({ params }) => {
      calls.media.push(String(params.id))
      if (state.failMedia) return HttpResponse.json({ error: 'database unavailable' }, { status: 500 })
      return HttpResponse.json(options.media?.[String(params.id)] ?? [])
    }),
    http.get('*/community-updates', ({ request }) => {
      const regionId = new URL(request.url).searchParams.get('region_id') ?? ''
      calls.updates.push(regionId)
      if (options.failUpdates) return HttpResponse.json({ error: 'region_id must be a valid uuid' }, { status: 400 })
      return HttpResponse.json(options.updates?.[regionId] ?? [])
    }),
  )
  return { calls, state, reports, votes }
}
