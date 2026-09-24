import type { AdminNgo, NgoStatus } from '@/api/identity'

/** A test organisation with sensible defaults; override what the test cares about. */
export function makeNgo(id: string, name: string, status: NgoStatus = 'active', extra: Partial<AdminNgo> = {}): AdminNgo {
  return {
    id,
    name,
    status,
    created_by_id: `creator-${id}`,
    created_by_email: `applicant-${id}@example.com`,
    created_at: '2026-09-20T06:44:36Z',
    updated_at: '2026-09-21T10:00:00Z',
    volunteer_count: 0,
    region_count: 0,
    ...extra,
  }
}
