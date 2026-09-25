import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ActivityEvent } from '@/api/profiling'
import { groupByDay } from './activityModel'
import { ActivityPanel } from './ActivityPanel'

const at = (d: Date) => d.toISOString()
const NOW = new Date()
const today = (h: number) => at(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), h, 0))

const events: ActivityEvent[] = [
  { id: 'incident_report:1', type: 'incident_report', occurred_at: today(11), subject_id: 'r1', detail: { category: 'flooding', status: 'verified' } },
  { id: 'status_report:2', type: 'status_report', occurred_at: today(9), subject_id: 'shelter-9', detail: { status: 'open', place_type: 'shelter' } },
  { id: 'donation:3', type: 'donation', occurred_at: at(new Date(2020, 0, 5, 8, 0)), subject_id: 'c1', detail: { amount: 5000, status: 'delivered' } },
]

function renderPanel(overrides: Partial<React.ComponentProps<typeof ActivityPanel>> = {}) {
  const props = {
    filter: 'all' as const,
    onFilterChange: vi.fn(),
    days: groupByDay(events),
    isPending: false,
    error: null,
    onRetry: vi.fn(),
    hasMore: false,
    onLoadMore: vi.fn(),
    isLoadingMore: false,
    loadMoreError: null,
    ...overrides,
  }
  render(
    <MemoryRouter>
      <ActivityPanel {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('ActivityPanel', () => {
  it('groups the activity under a heading per day, each row a sentence with its status and the time', () => {
    renderPanel()

    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Today', '5 January 2020'])
    const todayList = within(screen.getByRole('region', { name: 'Today' }))
    expect(todayList.getByText('You reported flooding')).toBeInTheDocument()
    expect(todayList.getByText('Verified')).toBeInTheDocument()
    expect(todayList.getByText('11:00')).toBeInTheDocument()
    expect(screen.getByText('You donated 5,000')).toBeInTheDocument()
  })

  it("links a shelter's status report to the shelter's page — and nothing else", () => {
    renderPanel()

    expect(screen.getByRole('link', { name: 'You reported a shelter as open' })).toHaveAttribute('href', '/app/map/shelters/shelter-9')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('shows a pill per kind plus All, with the current one pressed, and reports a choice', async () => {
    const { onFilterChange } = renderPanel({ filter: 'donation' })

    const group = screen.getByRole('group', { name: 'Filter activity' })
    expect(within(group).getAllByRole('button')).toHaveLength(8)
    expect(within(group).getByRole('button', { name: 'Donations' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(group).getByRole('button', { name: 'Votes' }))
    expect(onFilterChange).toHaveBeenCalledWith('incident_vote')
  })

  it('shows a busy skeleton, and no "no activity" message, while the first page loads', () => {
    renderPanel({ isPending: true, days: [] })

    expect(screen.getByLabelText('Loading your activity')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
  })

  it('shows the failure with a retry — and never an empty list, which would read as "no activity"', async () => {
    const { onRetry } = renderPanel({ error: 'boom', days: [] })

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says there is no activity yet — an empty state, not an error — for an account with none', () => {
    renderPanel({ days: [] })

    expect(screen.getByText('No activity yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names the filter when a filtered list is empty, and points back to All', () => {
    renderPanel({ days: [], filter: 'donation' })

    expect(screen.getByText('No donations yet')).toBeInTheDocument()
    expect(screen.getByText('Try another filter, or choose All.')).toBeInTheDocument()
  })

  it('offers Load more only while there is more, and reports it', async () => {
    const { onLoadMore } = renderPanel({ hasMore: true })

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('has no Load more at the end of the list', () => {
    renderPanel({ hasMore: false })
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('spins Load more while the next page loads', () => {
    renderPanel({ hasMore: true, isLoadingMore: true })
    expect(screen.getByRole('button', { name: 'Load more' })).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps the list when a later page fails, with the message and the button turned into a retry', () => {
    renderPanel({ hasMore: true, loadMoreError: 'boom' })

    expect(screen.getByText('You reported flooding')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})
