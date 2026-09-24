import type { AdminNgo, NgoStatus } from '@/api/identity'

export type NgoTab = 'all' | NgoStatus

/** Tabs in the order shown: the actionable one first, then the rest, then everything. */
export const NGO_TABS: NgoTab[] = ['pending_approval', 'active', 'suspended', 'rejected', 'deactivated', 'all']

/** Where the list opens: the applications waiting for a decision — the admin's actual job here. */
export const DEFAULT_NGO_TAB: NgoTab = 'pending_approval'

export const NGO_STATUS_LABEL: Record<NgoStatus, string> = {
  pending_approval: 'Pending approval',
  active: 'Active',
  suspended: 'Suspended',
  rejected: 'Rejected',
  deactivated: 'Deactivated',
}

export interface NgoFilters {
  tab: NgoTab
  q: string
}

/**
 * The list's tab and search, applied client-side over every loaded NGO. The search matches the
 * organisation's name, its contact email, the applicant's email, or a pasted id, case-insensitively.
 */
export function filterNgos(ngos: AdminNgo[], { tab, q }: NgoFilters): AdminNgo[] {
  const needle = q.trim().toLowerCase()
  return ngos.filter(
    (ngo) =>
      (tab === 'all' || ngo.status === tab) &&
      (needle === '' ||
        ngo.name.toLowerCase().includes(needle) ||
        (ngo.contact_email ?? '').toLowerCase().includes(needle) ||
        ngo.created_by_email.toLowerCase().includes(needle) ||
        ngo.id.toLowerCase().includes(needle)),
  )
}

/** How many NGOs sit in each tab — the numbers on the tab labels (search doesn't change them). */
export function countByTab(ngos: AdminNgo[]): Record<NgoTab, number> {
  const counts: Record<NgoTab, number> = {
    all: ngos.length,
    pending_approval: 0,
    active: 0,
    suspended: 0,
    rejected: 0,
    deactivated: 0,
  }
  for (const { status } of ngos) counts[status] += 1
  return counts
}

/** Only a pending application can be approved or rejected; the API refuses anything else. */
export const canDecide = (ngo: AdminNgo) => ngo.status === 'pending_approval'
