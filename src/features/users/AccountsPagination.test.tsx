import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountsPagination } from './AccountsPagination'

function renderPagination(overrides: Partial<React.ComponentProps<typeof AccountsPagination>> = {}) {
  const props = { page: 1, pageSize: 20, total: 983, onPageChange: vi.fn(), onPageSizeChange: vi.fn(), ...overrides }
  render(<AccountsPagination {...props} />)
  return props
}

describe('AccountsPagination', () => {
  it('shows the range and total, and disables Previous on the first page', async () => {
    const { onPageChange } = renderPagination()

    expect(screen.getByText('1–20 of 983')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('shows a middle page and steps both ways', async () => {
    const { onPageChange } = renderPagination({ page: 3 })

    expect(screen.getByText('41–60 of 983')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('clips the last page to the real total and disables Next there', () => {
    renderPagination({ page: 50 })

    expect(screen.getByText('981–983 of 983')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('reports a new page size', async () => {
    const { onPageSizeChange } = renderPagination()

    await userEvent.selectOptions(screen.getByRole('combobox'), '50')

    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })
})
