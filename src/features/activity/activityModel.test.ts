import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from '@/api/profiling'
import { ACTIVITY_FILTERS, dayHeading, describeActivity, filterLabel, groupByDay, mergePages, readFilter, timeOfDay } from './activityModel'

const event = (type: string, detail: Record<string, unknown> = {}, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: `${type}:1`,
  type,
  occurred_at: '2026-09-20T06:00:00Z',
  subject_id: 'subject-1',
  detail,
  ...extra,
})

describe('describeActivity — the sentence for each kind', () => {
  it.each([
    ['flooding', 'You reported flooding'],
    ['blocked_road', 'You reported a blocked road'],
    ['other_hazard', 'You reported another hazard'],
  ])('an incident report of %s', (category, title) => {
    expect(describeActivity(event('incident_report', { category, status: 'verified' }))?.title).toBe(title)
  })

  it('carries an incident report\'s status as a badge — Verified is safe, Rejected critical', () => {
    expect(describeActivity(event('incident_report', { category: 'flooding', status: 'verified' }))?.badges).toEqual([{ tone: 'safe', text: 'Verified' }])
    expect(describeActivity(event('incident_report', { category: 'flooding', status: 'rejected' }))?.badges).toEqual([{ tone: 'critical', text: 'Rejected' }])
  })

  it('an up vote and a down vote', () => {
    expect(describeActivity(event('incident_vote', { vote_type: 'upvote' }))?.title).toBe('You upvoted an incident report')
    expect(describeActivity(event('incident_vote', { vote_type: 'downvote' }))?.title).toBe('You downvoted an incident report')
  })

  it('an aid request by what was asked for, with its severity and status', () => {
    const view = describeActivity(event('aid_request', { category: 'medical', severity: 'high', status: 'pending' }))
    expect(view?.title).toBe('You requested medical help')
    expect(view?.badges.map((b) => b.text)).toEqual(['High', 'Pending'])
    expect(describeActivity(event('aid_request', { category: 'other', severity: 'low', status: 'fulfilled' }))?.title).toBe('You made an aid request')
  })

  it('a donation by amount, with thousands separated, and its stage', () => {
    const view = describeActivity(event('donation', { amount: 5000, status: 'delivered' }))
    expect(view?.title).toBe('You donated 5,000')
    expect(view?.badges).toEqual([{ tone: 'safe', text: 'Delivered' }])
  })

  it('says only "a donation" when the amount is missing or not a number', () => {
    expect(describeActivity(event('donation', { status: 'collected' }))?.title).toBe('You made a donation')
    expect(describeActivity(event('donation', { amount: '5000' }))?.title).toBe('You made a donation')
  })

  it('a status report on a shelter and on another place, open and closed', () => {
    expect(describeActivity(event('status_report', { status: 'open', place_type: 'shelter' }))?.title).toBe('You reported a shelter as open')
    expect(describeActivity(event('status_report', { status: 'closed', place_type: 'essential_location' }))?.title).toBe('You reported a place as closed')
  })

  it('a missing-person report with its outcome, and a sighting', () => {
    const report = describeActivity(event('missing_person_report', { status: 'found' }))
    expect(report?.title).toBe('You reported a missing person')
    expect(report?.badges).toEqual([{ tone: 'safe', text: 'Found' }])
    expect(describeActivity(event('missing_person_sighting', {}))?.title).toBe('You reported a sighting of a missing person')
  })

  it('shows a status it has no wording for as plain words, rather than dropping it or crashing', () => {
    expect(describeActivity(event('incident_report', { category: 'flooding', status: 'under_review' }))?.badges).toEqual([{ tone: 'info', text: 'under review' }])
    expect(describeActivity(event('incident_report', { category: 'landslide', status: 'reported' }))?.title).toBe('You filed an incident report')
  })

  it('copes with a detail that is missing or empty', () => {
    expect(describeActivity({ ...event('incident_report'), detail: undefined as never })?.title).toBe('You filed an incident report')
    expect(describeActivity(event('incident_vote'))?.title).toBe('You upvoted an incident report')
  })

  it('returns null for a type it does not know — the backend may add kinds, and a client ignores them', () => {
    expect(describeActivity(event('message', { text: 'hi' }))).toBeNull()
  })
})

describe('links', () => {
  it("links only a shelter's status report — the one subject whose screen exists", () => {
    expect(describeActivity(event('status_report', { status: 'open', place_type: 'shelter' }, { subject_id: 'abc' }))?.link).toBe('/app/map/shelters/abc')
  })

  it('leaves everything else as plain text: another place, reports, requests, campaigns, missing persons', () => {
    for (const e of [
      event('status_report', { status: 'open', place_type: 'essential_location' }),
      event('incident_report', { category: 'flooding' }),
      event('incident_vote', { vote_type: 'upvote' }),
      event('aid_request', { category: 'food' }),
      event('donation', { amount: 10 }),
      event('missing_person_report', { status: 'missing' }),
      event('missing_person_sighting'),
    ]) {
      expect(describeActivity(e)?.link).toBeNull()
    }
  })
})

describe('mergePages', () => {
  it('joins the pages in order and keeps each id once', () => {
    const a = event('incident_report', {}, { id: 'incident_report:a' })
    const b = event('incident_vote', {}, { id: 'incident_vote:b' })
    const c = event('donation', {}, { id: 'donation:c' })

    // An event arrived between the two presses, so the second page starts with the last line of the first.
    expect(mergePages([[a, b], [b, c]]).map((e) => e.id)).toEqual(['incident_report:a', 'incident_vote:b', 'donation:c'])
    expect(mergePages([])).toEqual([])
  })
})

describe('day grouping', () => {
  const now = new Date(2026, 8, 25, 15, 0) // 25 Sep 2026, 15:00 local

  it('names today and yesterday, and dates the rest', () => {
    expect(dayHeading(new Date(2026, 8, 25, 1, 0), now)).toBe('Today')
    expect(dayHeading(new Date(2026, 8, 24, 23, 59), now)).toBe('Yesterday')
    expect(dayHeading(new Date(2026, 8, 20, 12, 0), now)).toBe('20 September 2026')
  })

  it("groups consecutive events under one heading per day in the viewer's zone, keeping the order", () => {
    const at = (d: Date, id: string) => event('incident_vote', { vote_type: 'upvote' }, { id, occurred_at: d.toISOString() })
    const days = groupByDay(
      [at(new Date(2026, 8, 25, 14, 0), 'v:1'), at(new Date(2026, 8, 25, 9, 0), 'v:2'), at(new Date(2026, 8, 24, 20, 0), 'v:3'), at(new Date(2026, 8, 20, 8, 0), 'v:4')],
      now,
    )

    expect(days.map((d) => [d.heading, d.items.map((i) => i.id)])).toEqual([
      ['Today', ['v:1', 'v:2']],
      ['Yesterday', ['v:3']],
      ['20 September 2026', ['v:4']],
    ])
  })

  it('skips events of a type it does not know, without leaving an empty day', () => {
    const days = groupByDay([event('message', {}, { id: 'm:1', occurred_at: new Date(2026, 8, 25, 10).toISOString() })], now)
    expect(days).toEqual([])
  })

  it('formats the time of day', () => {
    expect(timeOfDay(new Date(2026, 8, 25, 7, 5).toISOString())).toBe('07:05')
  })
})

describe('the filters', () => {
  it('is All plus the seven kinds, each with a label', () => {
    expect(ACTIVITY_FILTERS).toHaveLength(8)
    expect(filterLabel('all')).toBe('All')
    expect(filterLabel('status_report')).toBe('Place updates')
  })

  it('reads the URL value, and treats anything unknown as All', () => {
    expect(readFilter('donation')).toBe('donation')
    expect(readFilter('nope')).toBe('all')
    expect(readFilter('Donation')).toBe('all')
    expect(readFilter(null)).toBe('all')
  })
})
