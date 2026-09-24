import { describe, expect, it } from 'vitest'
import type { AdminNgo, NgoStatus } from '@/api/identity'
import { canDecide, countByTab, filterNgos } from './ngoFilters'

function ngo(id: string, name: string, status: NgoStatus, extra: Partial<AdminNgo> = {}): AdminNgo {
  return {
    id,
    name,
    status,
    created_by_id: `creator-${id}`,
    created_by_email: `${id}@applicant.example`,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
    volunteer_count: 0,
    region_count: 0,
    ...extra,
  }
}

const ngos = [
  ngo('aaaa-1', 'Flood Relief Karachi', 'pending_approval', { contact_email: 'help@floodrelief.example' }),
  ngo('bbbb-2', 'Indus Relief Foundation', 'active'),
  ngo('cccc-3', 'Larkana Community Aid', 'active'),
  ngo('dddd-4', 'Sindh Response Network', 'rejected'),
  ngo('eeee-5', 'Old Shelter Trust', 'deactivated'),
]

describe('filterNgos', () => {
  it('filters by tab, and "all" keeps every status', () => {
    expect(filterNgos(ngos, { tab: 'active', q: '' }).map((n) => n.id)).toEqual(['bbbb-2', 'cccc-3'])
    expect(filterNgos(ngos, { tab: 'suspended', q: '' })).toEqual([])
    expect(filterNgos(ngos, { tab: 'all', q: '' })).toEqual(ngos)
  })

  it('searches the name, contact email, applicant email and id, case-insensitively and trimmed', () => {
    expect(filterNgos(ngos, { tab: 'all', q: '  INDUS ' }).map((n) => n.id)).toEqual(['bbbb-2'])
    expect(filterNgos(ngos, { tab: 'all', q: 'floodrelief.example' }).map((n) => n.id)).toEqual(['aaaa-1'])
    expect(filterNgos(ngos, { tab: 'all', q: 'dddd-4@applicant' }).map((n) => n.id)).toEqual(['dddd-4'])
    expect(filterNgos(ngos, { tab: 'all', q: 'cccc-3' }).map((n) => n.id)).toEqual(['cccc-3'])
  })

  it('combines tab and search', () => {
    expect(filterNgos(ngos, { tab: 'active', q: 'relief' }).map((n) => n.id)).toEqual(['bbbb-2'])
    expect(filterNgos(ngos, { tab: 'pending_approval', q: 'indus' })).toEqual([])
  })
})

describe('countByTab', () => {
  it('counts every status, plus the total', () => {
    expect(countByTab(ngos)).toEqual({
      all: 5,
      pending_approval: 1,
      active: 2,
      suspended: 0,
      rejected: 1,
      deactivated: 1,
    })
    expect(countByTab([]).all).toBe(0)
  })
})

describe('canDecide', () => {
  it('is true only for a pending application', () => {
    expect(canDecide(ngo('1', 'x', 'pending_approval'))).toBe(true)
    for (const status of ['active', 'rejected', 'suspended', 'deactivated'] as const) {
      expect(canDecide(ngo('1', 'x', status))).toBe(false)
    }
  })
})
