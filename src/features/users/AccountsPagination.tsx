import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PAGE_SIZES } from './accountFilters'

export interface AccountsPaginationProps {
  page: number
  pageSize: number
  /** Rows after filtering — what is being paged through. */
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

/** Rows-per-page, "21–40 of 983" and previous/next — pixel reference Batch 5 §5d's footer. */
export function AccountsPagination({ page, pageSize, total, onPageChange, onPageSizeChange }: AccountsPaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  const step = (enabled: boolean) =>
    cn(
      'flex size-8 items-center justify-center rounded-sm border border-surface-border text-ink-700',
      enabled ? 'hover:bg-surface-sunken' : 'cursor-not-allowed text-ink-300',
    )

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-body text-body-sm text-ink-500">
      <label className="flex items-center gap-2">
        Rows per page
        <div className="w-20">
          <Select compact value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
      </label>

      <div className="flex items-center gap-3">
        <span aria-live="polite">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className={step(page > 1)}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <CaretLeftIcon size={14} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={step(page < lastPage)}
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <CaretRightIcon size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
