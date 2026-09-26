import type { CommunityUpdate, IncidentMedia, IncidentReport } from '@/api/community'

/** Test data in the backend's real shape — optional keys **omitted**, not `null`. */

export const ME = '2debec3b-73fa-4303-ac7f-72dea779db6a'
export const OTHER = '113245cb-c24f-9e11-fefc-2fe776041aa6'
export const HOME_ID = '3e443566-4451-2093-992b-354ffb64e14c'

export function makeReport(overrides: Partial<IncidentReport> = {}): IncidentReport {
  return {
    id: 'r-1',
    reporter_account_id: OTHER,
    category: 'flooding',
    description: 'Water rising fast on Indus Road, knee-deep in places.',
    location: { type: 'Point', coordinates: [68.86, 27.7] },
    status: 'reported',
    auto_verified: false,
    upvote_count: 3,
    downvote_count: 1,
    created_at: '2026-09-26T09:00:00Z',
    updated_at: '2026-09-26T09:00:00Z',
    ...overrides,
  }
}

export function makeUpdate(overrides: Partial<CommunityUpdate> = {}): CommunityUpdate {
  return {
    id: 'u-1',
    author_account_id: 'author-1',
    region_id: HOME_ID,
    title: 'Clean drinking water distribution',
    content: 'Water tankers will visit Main Bazaar between 8 AM and 6 PM daily.',
    created_at: '2026-09-26T08:00:00Z',
    ...overrides,
  }
}

export function makeMedia(overrides: Partial<IncidentMedia> = {}): IncidentMedia {
  return {
    id: 'm-1',
    incident_report_id: 'r-1',
    media_type: 'photo',
    media_url: 'https://placehold.co/800x600/png?text=Flooded+street',
    created_at: '2026-09-26T09:00:00Z',
    ...overrides,
  }
}
