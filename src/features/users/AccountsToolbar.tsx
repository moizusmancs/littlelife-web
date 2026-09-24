import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ROLE_LABEL } from '@/features/account/roleLabels'
import { ACCOUNT_STATUS_LABEL } from '@/features/account/accountStatusLabels'
import { ROLE_FILTERS, STATUS_FILTERS, type AccountFilters } from './accountFilters'

export interface AccountsToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  role: AccountFilters['role']
  onRoleChange: (role: AccountFilters['role']) => void
  status: AccountFilters['status']
  onStatusChange: (status: AccountFilters['status']) => void
}

/**
 * Pixel reference: Batch 5 §5d — a search field, a role pill group and a status dropdown. The
 * mockup's "Credibility < 50%" filter is left out (credibility is per-account and isn't in the
 * list data), and its search hint ("name, phone, @handle") becomes email or id, the only things an
 * account summary has. On a phone the role pills scroll sideways instead of wrapping.
 */
export function AccountsToolbar({
  search,
  onSearchChange,
  role,
  onRoleChange,
  status,
  onStatusChange,
}: AccountsToolbarProps) {
  const pill = (active: boolean) =>
    cn(
      'flex-none rounded-full px-3 py-1.5 font-body text-[12px] font-semibold whitespace-nowrap',
      active ? 'bg-primary-500 text-white' : 'text-ink-700 hover:bg-surface-border',
    )

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <div className="relative flex items-center md:w-80">
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 text-ink-500" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search email or account ID"
          aria-label="Search accounts"
          className="h-9 w-full rounded-sm border border-surface-border bg-surface-sunken ps-9 pe-3 font-body text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
        />
      </div>

      <div
        role="group"
        aria-label="Filter by role"
        className="flex min-w-0 gap-0.5 overflow-x-auto rounded-full bg-surface-sunken p-0.75"
      >
        <button type="button" aria-pressed={role === 'all'} onClick={() => onRoleChange('all')} className={pill(role === 'all')}>
          All
        </button>
        {ROLE_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={role === value}
            onClick={() => onRoleChange(value)}
            className={pill(role === value)}
          >
            {ROLE_LABEL[value]}
          </button>
        ))}
      </div>

      <div className="md:w-48">
        <Select
          compact
          aria-label="Filter by status"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as AccountFilters['status'])}
        >
          <option value="all">All statuses</option>
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {ACCOUNT_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
