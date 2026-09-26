import { describe, expect, it } from 'vitest'
import {
  buildFeed,
  categoryCounts,
  isConfirmed,
  isMine,
  mediaPreview,
  nextVote,
  platformWideOnly,
  readCategory,
  readTab,
  rejectedCount,
  reportLatLng,
  reportMatches,
  reporterLabel,
  statusBadge,
  updateAudience,
  updateMatches,
  votesById,
  votesLabel,
  withVoteChange,
  type FeedInput,
} from './feedModel'
import { ME, OTHER, makeMedia, makeReport, makeUpdate } from './fixtures'

const base = (overrides: Partial<FeedInput> = {}): FeedInput => ({ reports: [], updates: [], tab: 'latest', category: 'all', query: '', position: null, ...overrides })
const keys = (input: FeedInput) => buildFeed(input).map((item) => item.key)

describe('reading the URL', () => {
  it('knows the four tabs and falls back to Latest', () => {
    expect(readTab('verified')).toBe('verified')
    expect(readTab('qa')).toBe('qa')
    expect(readTab(null)).toBe('latest')
    expect(readTab('rejected')).toBe('latest')
  })

  it('knows the three real categories and falls back to all', () => {
    expect(readCategory('blocked_road')).toBe('blocked_road')
    expect(readCategory('fire')).toBe('all')
    expect(readCategory(null)).toBe('all')
  })
})

describe('labels', () => {
  it('says who reported it without a name the API does not give', () => {
    expect(isMine(makeReport({ reporter_account_id: ME }), ME)).toBe(true)
    expect(isMine(makeReport({ reporter_account_id: OTHER }), ME)).toBe(false)
    expect(isMine(makeReport(), null)).toBe(false)
    expect(reporterLabel(true)).toBe('You')
    expect(reporterLabel(false)).toBe('A community member')
  })

  it('names each status, and says when a classifier verified it rather than a person', () => {
    expect(statusBadge(makeReport({ status: 'reported' })).text).toBe('Not verified yet')
    expect(statusBadge(makeReport({ status: 'verified' })).text).toBe('Verified')
    expect(statusBadge(makeReport({ status: 'verified', auto_verified: true }))).toEqual({ tone: 'safe', text: 'Verified automatically' })
    // auto_verified only reads as such while the status is still the one it set
    expect(statusBadge(makeReport({ status: 'resolved', auto_verified: true })).text).toBe('Resolved')
    expect(statusBadge(makeReport({ status: 'in_progress' })).text).toBe('Being handled')
  })

  it('reads vote counts as words, with singulars', () => {
    expect(votesLabel(3, 1)).toBe('3 upvotes, 1 downvote')
    expect(votesLabel(1, 0)).toBe('1 upvote, 0 downvotes')
  })

  it('names who an update is for', () => {
    expect(updateAudience(makeUpdate({ region_id: undefined }), 'Sukkur City')).toBe('Everyone')
    expect(updateAudience(makeUpdate(), 'Sukkur City')).toBe('Sukkur City')
    expect(updateAudience(makeUpdate(), null)).toBe('Your area')
  })
})

describe('reportLatLng', () => {
  it('turns GeoJSON [lng, lat] into [lat, lng]', () => {
    expect(reportLatLng(makeReport({ location: { type: 'Point', coordinates: [67.02, 24.85] } }))).toEqual([24.85, 67.02])
  })

  it('refuses a point off the globe or unreadable (the server accepts lat 95 / lng 200)', () => {
    expect(reportLatLng(makeReport({ location: { type: 'Point', coordinates: [200, 24] } }))).toBeNull()
    expect(reportLatLng(makeReport({ location: { type: 'Point', coordinates: [67, 95] } }))).toBeNull()
    expect(reportLatLng({ location: { type: 'Point', coordinates: [67] as unknown as [number, number] } })).toBeNull()
    expect(reportLatLng({ location: undefined as never })).toBeNull()
  })
})

describe('search', () => {
  it('matches the description, the category and the status wording, ignoring case', () => {
    const report = makeReport({ category: 'blocked_road', description: 'Fallen TREE on Bunder Road' })
    expect(reportMatches(report, 'tree')).toBe(true)
    expect(reportMatches(report, 'blocked')).toBe(true)
    expect(reportMatches(report, 'not verified')).toBe(true)
    expect(reportMatches(report, 'flood')).toBe(false)
    expect(reportMatches(report, '   ')).toBe(true)
  })

  it('matches a report with no description by its category', () => {
    expect(reportMatches(makeReport({ description: undefined }), 'flooding')).toBe(true)
  })

  it('matches an update by title, content or the words "official update"', () => {
    const update = makeUpdate({ title: undefined, content: 'Tankers at Main Bazaar' })
    expect(updateMatches(update, 'bazaar')).toBe(true)
    expect(updateMatches(update, 'official')).toBe(true)
    expect(updateMatches(update, 'shelter')).toBe(false)
  })
})

describe('buildFeed', () => {
  const older = makeReport({ id: 'old', created_at: '2026-09-25T09:00:00Z' })
  const newer = makeReport({ id: 'new', created_at: '2026-09-26T10:00:00Z', status: 'verified' })
  const rejected = makeReport({ id: 'rej', created_at: '2026-09-26T11:00:00Z', status: 'rejected' })
  const update = makeUpdate({ id: 'upd', created_at: '2026-09-26T08:00:00Z' })

  it('Latest: every report but the rejected ones, with the updates, newest first', () => {
    expect(keys(base({ reports: [older, newer, rejected], updates: [update] }))).toEqual(['report:new', 'update:upd', 'report:old'])
  })

  it('Latest with a category: no updates (they have no category)', () => {
    expect(keys(base({ reports: [older, newer], updates: [update], category: 'flooding' }))).toEqual(['report:new', 'report:old'])
  })

  it('Latest with a search: reports and updates that match', () => {
    const tree = makeReport({ id: 'tree', description: 'Fallen tree' })
    expect(keys(base({ reports: [tree, older], updates: [update, makeUpdate({ id: 'u2', content: 'Tree removal crews' })], query: 'tree' }))).toEqual(['report:tree', 'update:u2'])
  })

  it('Verified: verified, being handled and resolved — never reported or rejected, never updates', () => {
    const handled = makeReport({ id: 'handled', status: 'in_progress', created_at: '2026-09-26T07:00:00Z' })
    const resolved = makeReport({ id: 'resolved', status: 'resolved', created_at: '2026-09-24T07:00:00Z' })
    expect(keys(base({ tab: 'verified', reports: [older, newer, rejected, handled, resolved], updates: [update] }))).toEqual(['report:new', 'report:handled', 'report:resolved'])
    expect(isConfirmed(older)).toBe(false)
  })

  it('Nearby: nothing until the viewer is located', () => {
    expect(keys(base({ tab: 'nearby', reports: [older, newer] }))).toEqual([])
  })

  it('Nearby: nearest first with each distance, newest first among equals, unreadable points left out', () => {
    const here = makeReport({ id: 'here', location: { type: 'Point', coordinates: [68.0, 27.0] }, created_at: '2026-09-20T00:00:00Z' })
    const far = makeReport({ id: 'far', location: { type: 'Point', coordinates: [70.0, 27.0] }, created_at: '2026-09-26T00:00:00Z' })
    const twinOld = makeReport({ id: 'twin-old', location: { type: 'Point', coordinates: [68.5, 27.0] }, created_at: '2026-09-21T00:00:00Z' })
    const twinNew = makeReport({ id: 'twin-new', location: { type: 'Point', coordinates: [68.5, 27.0] }, created_at: '2026-09-22T00:00:00Z' })
    const broken = makeReport({ id: 'broken', location: { type: 'Point', coordinates: [200, 27] } })
    const feed = buildFeed(base({ tab: 'nearby', position: [27.0, 68.0], reports: [far, twinOld, broken, here, twinNew, rejected], updates: [update] }))
    expect(feed.map((item) => item.key)).toEqual(['report:here', 'report:twin-new', 'report:twin-old', 'report:far'])
    const [first, , , last] = feed
    expect(first.kind === 'report' && first.distance).toBe(0)
    expect(last.kind === 'report' && Math.round((last.distance ?? 0) / 1000)).toBe(198)
  })

  it('Q&A: nothing', () => {
    expect(keys(base({ tab: 'qa', reports: [older], updates: [update] }))).toEqual([])
  })

  it('never reorders its input', () => {
    const reports = [older, newer]
    buildFeed(base({ reports }))
    expect(reports.map((report) => report.id)).toEqual(['old', 'new'])
  })
})

describe('categoryCounts', () => {
  const reports = [
    makeReport({ id: 'a', category: 'flooding', description: 'river' }),
    makeReport({ id: 'b', category: 'flooding', status: 'verified', description: 'river bank' }),
    makeReport({ id: 'c', category: 'blocked_road', description: 'tree' }),
    makeReport({ id: 'd', category: 'other_hazard', status: 'rejected', description: 'river' }),
  ]

  it('counts the shown reports per category', () => {
    expect(categoryCounts(reports, 'latest', '', null)).toEqual({ all: 3, flooding: 2, blocked_road: 1, other_hazard: 0 })
  })

  it('counts within the tab and the search', () => {
    expect(categoryCounts(reports, 'verified', '', null)).toEqual({ all: 1, flooding: 1, blocked_road: 0, other_hazard: 0 })
    expect(categoryCounts(reports, 'latest', 'river', null)).toEqual({ all: 2, flooding: 2, blocked_road: 0, other_hazard: 0 })
    expect(categoryCounts(reports, 'nearby', '', null).all).toBe(0)
  })

  it('counts what was hidden as rejected', () => {
    expect(rejectedCount(reports)).toBe(1)
  })
})

describe('votes', () => {
  it('pressing the chosen side takes the vote back; anything else casts the pressed side', () => {
    expect(nextVote(null, 'upvote')).toBe('upvote')
    expect(nextVote('upvote', 'upvote')).toBeNull()
    expect(nextVote('upvote', 'downvote')).toBe('downvote')
    expect(nextVote('downvote', 'upvote')).toBe('upvote')
    expect(nextVote('downvote', 'downvote')).toBeNull()
  })

  it('moves the totals the way the server’s counters will', () => {
    const report = makeReport({ upvote_count: 3, downvote_count: 1 })
    const totals = (from: 'upvote' | 'downvote' | null, to: 'upvote' | 'downvote' | null) => {
      const next = withVoteChange(report, from, to)
      return [next.upvote_count, next.downvote_count]
    }
    expect(totals(null, 'upvote')).toEqual([4, 1])
    expect(totals(null, 'downvote')).toEqual([3, 2])
    expect(totals('upvote', 'downvote')).toEqual([2, 2])
    expect(totals('downvote', 'upvote')).toEqual([4, 0])
    expect(totals('upvote', null)).toEqual([2, 1])
    expect(totals('upvote', 'upvote')).toEqual([3, 1])
    expect(withVoteChange(report, 'upvote', 'upvote')).toBe(report)
  })

  it('never takes a total below zero (a stale count and a vote taken back)', () => {
    expect(withVoteChange(makeReport({ upvote_count: 0 }), 'upvote', null).upvote_count).toBe(0)
  })

  it('indexes the caller’s votes by report', () => {
    expect(votesById([{ incident_report_id: 'a', vote_type: 'upvote', created_at: '' }, { incident_report_id: 'b', vote_type: 'downvote', created_at: '' }])).toEqual({ a: 'upvote', b: 'downvote' })
  })
})

describe('updates and media', () => {
  it('keeps only the platform-wide updates', () => {
    expect(platformWideOnly([makeUpdate({ id: 'a' }), makeUpdate({ id: 'b', region_id: undefined })]).map((u) => u.id)).toEqual(['b'])
  })

  it('previews the newest photo, else a video, and counts them all', () => {
    expect(mediaPreview(undefined)).toEqual({ preview: null, count: 0 })
    expect(mediaPreview([])).toEqual({ preview: null, count: 0 })
    const video = makeMedia({ id: 'v', media_type: 'video' })
    const photo = makeMedia({ id: 'p' })
    expect(mediaPreview([video, photo])).toEqual({ preview: photo, count: 2 })
    expect(mediaPreview([video]).preview?.id).toBe('v')
  })
})
