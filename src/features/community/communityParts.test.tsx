import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeedEmpty, FeedError, FeedList, NearbyPrompt, QaComingSoon } from './FeedList'
import { FeedToolbar } from './FeedToolbar'
import { IncidentCard } from './IncidentCard'
import { MediaThumb } from './MediaThumb'
import { OfficialUpdateCard } from './OfficialUpdateCard'
import { makeMedia, makeReport, makeUpdate } from './fixtures'
import type { FeedItem } from './feedModel'

const NOW = new Date('2026-09-26T09:14:00Z')
const loaded = (media = [makeMedia()]) => ({ status: 'success' as const, media })

describe('IncidentCard', () => {
  it('shows who, when, the category, the status, what they wrote and the vote totals — read-only', () => {
    render(<IncidentCard report={makeReport()} mine={false} media={loaded([])} distance={null} now={NOW} />)
    const card = screen.getByRole('article', { name: 'Flooding reported by a community member' })
    expect(within(card).getByText('A community member')).toBeInTheDocument()
    expect(within(card).getByText('14 minutes ago')).toHaveAttribute('datetime', '2026-09-26T09:00:00Z')
    expect(within(card).getByText('Flooding')).toBeInTheDocument()
    expect(within(card).getByText('Not verified yet')).toBeInTheDocument()
    expect(within(card).getByText(/Water rising fast on Indus Road/)).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: '3 upvotes, 1 downvote' })).toBeInTheDocument()
    // While the viewer's votes are unknown there is nothing to press; and no link until Incident Detail exists.
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
  })

  it('once the viewer’s vote is known, offers Upvote and Downvote with theirs pressed, and reports each press', async () => {
    const onVote = vi.fn()
    const { rerender } = render(<IncidentCard report={makeReport()} mine={false} media={loaded([])} distance={null} now={NOW} vote={null} onVote={onVote} />)
    const group = screen.getByRole('group', { name: '3 upvotes, 1 downvote' })
    expect(within(group).getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: 'Downvote' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(group).getByRole('button', { name: 'Upvote' }))
    expect(onVote).toHaveBeenLastCalledWith('upvote')

    rerender(<IncidentCard report={makeReport()} mine={false} media={loaded([])} distance={null} now={NOW} vote="downvote" onVote={onVote} />)
    expect(screen.getByRole('button', { name: 'Downvote' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Downvote' }))
    expect(onVote).toHaveBeenLastCalledWith('downvote')
  })

  it('says "You" for the viewer’s own report', () => {
    render(<IncidentCard report={makeReport()} mine media={loaded([])} distance={null} now={NOW} />)
    expect(screen.getByRole('article', { name: 'Flooding reported by you' })).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('says so when there is no description, and never invents one', () => {
    render(<IncidentCard report={makeReport({ description: undefined, category: 'blocked_road' })} mine={false} media={loaded([])} distance={null} now={NOW} />)
    expect(screen.getByText('No description given.')).toBeInTheDocument()
    expect(screen.getByText('Blocked road')).toBeInTheDocument()
  })

  it('shows the distance only when the viewer has been located', () => {
    const { rerender } = render(<IncidentCard report={makeReport()} mine={false} media={loaded([])} distance={null} now={NOW} />)
    expect(screen.queryByText(/away/)).not.toBeInTheDocument()
    rerender(<IncidentCard report={makeReport()} mine={false} media={loaded([])} distance={4200} now={NOW} />)
    expect(screen.getByText('4.2 km away')).toBeInTheDocument()
  })

  it('keeps a very long unbroken description inside the card', () => {
    render(<IncidentCard report={makeReport({ description: 'x'.repeat(600) })} mine={false} media={loaded([])} distance={null} now={NOW} />)
    expect(screen.getByText('x'.repeat(600)).className).toMatch(/overflow-wrap:anywhere/)
    expect(screen.getByText('x'.repeat(600)).className).toMatch(/line-clamp-3/)
  })
})

describe('MediaThumb', () => {
  it('shows a skeleton while the media list loads', () => {
    const { container } = render(<MediaThumb state={{ status: 'pending' }} />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows nothing for a report with no media, or whose media couldn’t be read', () => {
    const { container, rerender } = render(<MediaThumb state={loaded([])} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<MediaThumb state={{ status: 'error' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the photo with "+N" when there is more', () => {
    render(<MediaThumb state={loaded([makeMedia({ id: 'a' }), makeMedia({ id: 'b', media_type: 'video' }), makeMedia({ id: 'c' })])} />)
    expect(screen.getByRole('img', { name: 'Photo attached to this report' })).toHaveAttribute('src', makeMedia().media_url)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('shows a video as a tile — nothing downloaded in a list', () => {
    render(<MediaThumb state={loaded([makeMedia({ media_type: 'video', media_url: 'http://x/v.mp4' })])} />)
    expect(screen.getByText('Video')).toBeInTheDocument()
    expect(document.querySelector('video, img')).toBeNull()
  })

  it('shows a plain tile if the photo won’t load', () => {
    render(<MediaThumb state={loaded()} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText("Photo couldn't be shown")).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('OfficialUpdateCard', () => {
  it('is marked as official, for the home region, with its title and content and no votes', () => {
    render(<OfficialUpdateCard update={makeUpdate()} homeName="Sukkur City" now={NOW} />)
    const card = screen.getByRole('article', { name: 'Clean drinking water distribution' })
    expect(within(card).getByText('Official update')).toBeInTheDocument()
    expect(within(card).getByText('For Sukkur City')).toBeInTheDocument()
    expect(within(card).getByText(/Water tankers/)).toBeInTheDocument()
    expect(within(card).getByText('1 hour ago')).toBeInTheDocument()
    expect(within(card).queryByRole('img', { name: /upvote/ })).not.toBeInTheDocument()
  })

  it('says "For Everyone" for a platform-wide post, and still has a name without a title', () => {
    render(<OfficialUpdateCard update={makeUpdate({ region_id: undefined, title: undefined })} homeName={null} now={NOW} />)
    expect(screen.getByRole('article', { name: 'Official update' })).toBeInTheDocument()
    expect(screen.getByText('For Everyone')).toBeInTheDocument()
  })
})

describe('FeedToolbar', () => {
  const counts = { all: 5, flooding: 3, blocked_road: 2, other_hazard: 0 }

  it('reports what is typed, clears it, and marks the chosen category', async () => {
    const onQueryChange = vi.fn()
    const onCategoryChange = vi.fn()
    const { rerender } = render(<FeedToolbar query="" onQueryChange={onQueryChange} category="all" counts={counts} onCategoryChange={onCategoryChange} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'r')
    expect(onQueryChange).toHaveBeenLastCalledWith('r')
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    rerender(<FeedToolbar query="river" onQueryChange={onQueryChange} category="flooding" counts={counts} onCategoryChange={onCategoryChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onQueryChange).toHaveBeenLastCalledWith('')

    const group = screen.getByRole('group', { name: 'Category' })
    expect(within(group).getByRole('button', { name: 'Flooding 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(group).getByRole('button', { name: 'Blocked road 2' }))
    expect(onCategoryChange).toHaveBeenCalledWith('blocked_road')
  })

  it('offers only the three real categories — no fire, landslide or medical', () => {
    render(<FeedToolbar query="" onQueryChange={vi.fn()} category="all" counts={counts} onCategoryChange={vi.fn()} />)
    expect(within(screen.getByRole('group', { name: 'Category' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['All 5', 'Flooding 3', 'Blocked road 2', 'Other hazard 0'])
  })
})

describe('FeedList and its states', () => {
  const items: FeedItem[] = [
    { kind: 'report', key: 'report:r-1', report: makeReport(), createdAt: '2026-09-26T09:00:00Z', distance: null },
    { kind: 'update', key: 'update:u-1', update: makeUpdate(), createdAt: '2026-09-26T08:00:00Z' },
  ]

  it('draws reports and updates in the order given, asks about each reporter, and offers "Show more" only when there is more', async () => {
    const isMine = vi.fn(() => false)
    const onShowMore = vi.fn()
    const { rerender } = render(<FeedList items={items} total={2} isMine={isMine} mediaOf={() => loaded([])} homeName="Sukkur City" now={NOW} onShowMore={onShowMore} />)
    const list = screen.getByRole('list', { name: 'Reports and updates' })
    expect(within(list).getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual(['report-r-1-title', 'update-u-1-title'])
    expect(isMine).toHaveBeenCalledWith(makeReport().reporter_account_id)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()

    rerender(<FeedList items={items} total={14} isMine={isMine} mediaOf={() => loaded([])} homeName="Sukkur City" now={NOW} onShowMore={onShowMore} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show more (12 more)' }))
    expect(onShowMore).toHaveBeenCalled()
  })

  it('an empty state with a way out only when a filter is the reason', async () => {
    const onClear = vi.fn()
    const { rerender } = render(<FeedEmpty message="Nobody has reported anything yet." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<FeedEmpty message="No reports match your search and filters." onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('an error in the server’s words, with a retry', async () => {
    const onRetry = vi.fn()
    render(<FeedError message="bbox must have exactly 4 comma-separated values" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load community reports: bbox must have exactly 4 comma-separated values")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('Nearby asks nothing until pressed, and explains a blocked location', async () => {
    const onLocate = vi.fn()
    const { rerender } = render(<NearbyPrompt status="idle" onLocate={onLocate} />)
    expect(onLocate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(onLocate).toHaveBeenCalledTimes(1)
    rerender(<NearbyPrompt status="denied" onLocate={onLocate} />)
    expect(screen.getByRole('status')).toHaveTextContent('Location is blocked for this site')
  })

  it('Q&A is "Coming soon"', () => {
    render(<QaComingSoon />)
    expect(screen.getByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument()
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument()
  })
})
