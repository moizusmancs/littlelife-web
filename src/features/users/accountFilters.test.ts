import { describe, expect, it } from 'vitest'
import type { AccountStatus, AccountSummary } from '@/api/identity'
import type { Role } from '@/store/auth'
import { availableStatusActions, countByGroup, filterAccounts, rowStatusAction } from './accountFilters'

function account(id: string, email: string, role: Role = 'user', status: AccountStatus = 'active'): AccountSummary {
  return { id, email, role, status, email_verified: true, created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z' }
}

const accounts = [
  account('aaaa-1111', 'Aisha.Khan@example.com'),
  account('bbbb-2222', 'bilal@ngo.example.org', 'ngo_volunteer'),
  account('cccc-3333', 'chair@ngo.example.org', 'ngo_admin', 'suspended'),
  account('dddd-4444', 'root@platform.example', 'super_admin'),
  account('eeee-5555', 'new@example.com', 'user', 'pending_verification'),
]
const all = { q: '', role: 'all', status: 'all' } as const

describe('filterAccounts', () => {
  it('returns everything, in order, when nothing is filtered', () => {
    expect(filterAccounts(accounts, all)).toEqual(accounts)
  })

  it('searches the email case-insensitively, anywhere in it, ignoring surrounding spaces', () => {
    expect(filterAccounts(accounts, { ...all, q: '  AISHA.kh ' }).map((a) => a.id)).toEqual(['aaaa-1111'])
    expect(filterAccounts(accounts, { ...all, q: 'ngo.example' }).map((a) => a.id)).toEqual(['bbbb-2222', 'cccc-3333'])
  })

  it('also finds an account by a pasted id', () => {
    expect(filterAccounts(accounts, { ...all, q: 'cccc-3333' }).map((a) => a.email)).toEqual(['chair@ngo.example.org'])
  })

  it('filters by role and by status, and combines all three', () => {
    expect(filterAccounts(accounts, { ...all, role: 'ngo_admin' }).map((a) => a.id)).toEqual(['cccc-3333'])
    expect(filterAccounts(accounts, { ...all, status: 'pending_verification' }).map((a) => a.id)).toEqual(['eeee-5555'])
    expect(filterAccounts(accounts, { q: 'example', role: 'user', status: 'active' }).map((a) => a.id)).toEqual(['aaaa-1111'])
    expect(filterAccounts(accounts, { q: 'zzz', role: 'all', status: 'all' })).toEqual([])
  })
})

describe('countByGroup', () => {
  it('splits citizens, NGO staff (both roles) and platform admins (both roles)', () => {
    expect(countByGroup(accounts)).toEqual({ citizens: 2, ngoStaff: 2, admins: 1 })
    expect(countByGroup([])).toEqual({ citizens: 0, ngoStaff: 0, admins: 0 })
  })
})

describe('availableStatusActions', () => {
  it('offers suspend for an active account, and nothing else', () => {
    expect(availableStatusActions(account('1', 'a@b.c'), false)).toEqual(['suspend'])
  })

  it('offers reactivate (only) for a suspended account', () => {
    expect(availableStatusActions(account('1', 'a@b.c', 'user', 'suspended'), false)).toEqual(['reactivate'])
  })

  it('offers both for a deactivated account', () => {
    expect(availableStatusActions(account('1', 'a@b.c', 'user', 'deactivated'), false)).toEqual(['suspend', 'reactivate'])
  })

  it('never offers reactivate for a pending_verification account — it would skip verification', () => {
    expect(availableStatusActions(account('1', 'a@b.c', 'user', 'pending_verification'), false)).toEqual(['suspend'])
  })

  it("offers nothing for the caller's own account, whatever its status", () => {
    expect(availableStatusActions(account('1', 'a@b.c', 'admin', 'active'), true)).toEqual([])
    expect(availableStatusActions(account('1', 'a@b.c', 'admin', 'suspended'), true)).toEqual([])
  })
})

describe('rowStatusAction', () => {
  it('is reactivate for suspended and suspend otherwise, and null for yourself', () => {
    expect(rowStatusAction(account('1', 'a@b.c', 'user', 'suspended'), false)).toBe('reactivate')
    expect(rowStatusAction(account('1', 'a@b.c', 'user', 'active'), false)).toBe('suspend')
    expect(rowStatusAction(account('1', 'a@b.c', 'user', 'deactivated'), false)).toBe('suspend')
    expect(rowStatusAction(account('1', 'a@b.c', 'user', 'active'), true)).toBeNull()
  })
})
