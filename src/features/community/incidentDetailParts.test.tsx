import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { describe, expect, it, vi } from 'vitest'
import { reportTimeline } from './feedModel'
import { backToFeed, incidentPath } from './incidentLinks'
import { IncidentCard } from './IncidentCard'
import { IncidentDetailState } from './IncidentDetailState'
import { IncidentLocationCard } from './IncidentLocationCard'
import { IncidentMediaGallery } from './IncidentMediaGallery'
import { IncidentSummaryCard } from './IncidentSummaryCard'
import { IncidentTimeline } from './IncidentTimeline'
import { makeMedia, makeReport } from './fixtures'

const NOW = new Date('2026-09-26T09:14:00Z')
/** Times are shown in the viewer's own zone, so expected text is built the same way. */
const local = (iso: string) => format(parseISO(iso), 'd MMMM yyyy, HH:mm')

describe('links', () => {
  it('builds a report’s path with the id encoded', () => {
    expect(incidentPath('abc')).toBe('/app/community/abc')
    expect(incidentPath('a/b?c')).toBe('/app/community/a%2Fb%3Fc')
  })

  it('goes Back to the feed view it came from — and only ever to the feed', () => {
    expect(backToFeed({ from: '/app/community?tab=verified&q=tree' })).toBe('/app/community?tab=verified&q=tree')
    expect(backToFeed({ from: '/app/community' })).toBe('/app/community')
    expect(backToFeed(null)).toBe('/app/community')
    expect(backToFeed({ from: 'https://evil.example' })).toBe('/app/community')
    expect(backToFeed({ from: '/app/communityx' })).toBe('/app/community')
    expect(backToFeed({ from: 42 })).toBe('/app/community')
  })
})

describe('IncidentCard as a link', () => {
  it('opens the report’s page with the feed’s view, while the vote buttons stay their own', async () => {
    const onVote = vi.fn()
    render(
      <MemoryRouter>
        <IncidentCard report={makeReport()} mine={false} media={{ status: 'success', media: [] }} distance={null} now={NOW} vote={null} onVote={onVote} href="/app/community/r-1" linkState={{ from: '/app/community?tab=verified' }} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'View details' })
    expect(link).toHaveAttribute('href', '/app/community/r-1')
    expect(link).toHaveAccessibleDescription('Flooding reported by a community member')
    await userEvent.click(screen.getByRole('button', { name: 'Upvote' }))
    expect(onVote).toHaveBeenCalledWith('upvote')
  })
})

describe('IncidentSummaryCard', () => {
  it('headlines the category, says who and when (with the full date), shows the whole description and the large vote pair', async () => {
    const onVote = vi.fn()
    const long = 'Water rising fast.\nTwo motorcycles stuck. ' + 'x'.repeat(400)
    render(<IncidentSummaryCard report={makeReport({ description: long, status: 'verified', auto_verified: true })} mine={false} now={NOW} vote="upvote" onVote={onVote} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Flooding' })).toBeInTheDocument()
    expect(screen.getByText('Verified automatically')).toBeInTheDocument()
    expect(screen.getByText(/Reported by/)).toHaveTextContent(`Reported by a community member 14 minutes ago (${local('2026-09-26T09:00:00Z')})`)
    // The whole description, not clamped as on the card.
    expect(screen.getByText(/Two motorcycles stuck/).className).not.toMatch(/line-clamp/)
    expect(screen.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Downvote' }))
    expect(onVote).toHaveBeenCalledWith('downvote')
  })

  it('says "you" for the viewer’s own report; plain totals while the vote is unknown; no description said plainly', () => {
    render(<IncidentSummaryCard report={makeReport({ description: undefined })} mine now={NOW} vote={undefined} />)
    expect(screen.getByText(/Reported by/)).toHaveTextContent('Reported by you')
    expect(screen.getByRole('img', { name: '3 upvotes, 1 downvote' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('No description given.')).toBeInTheDocument()
  })
})

describe('IncidentMediaGallery', () => {
  it('shows every photo (opening full size in a new tab) and every video (playable, only metadata fetched)', () => {
    render(
      <IncidentMediaGallery
        state={{ status: 'success', media: [makeMedia({ id: 'p1' }), makeMedia({ id: 'v1', media_type: 'video', media_url: 'http://x/clip.mp4' })] }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: /^Photos and videos/ })).toHaveTextContent('Photos and videos · 2')
    const photo = screen.getByRole('img', { name: 'Photo 1 from this report (opens full size in a new tab)' })
    expect(photo.closest('a')).toHaveAttribute('target', '_blank')
    const video = screen.getByLabelText('Video 2 from this report')
    expect(video).toHaveAttribute('src', 'http://x/clip.mp4')
    expect(video).toHaveAttribute('preload', 'metadata')
  })

  it('turns a file that won’t load into a tile with a direct link, leaving the rest alone', () => {
    render(<IncidentMediaGallery state={{ status: 'success', media: [makeMedia({ id: 'p1' }), makeMedia({ id: 'v1', media_type: 'video', media_url: 'http://x/gone.mp4' })] }} onRetry={vi.fn()} />)
    fireEvent.error(screen.getByLabelText('Video 2 from this report'))
    expect(screen.getByText("This video can't be played here.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it directly' })).toHaveAttribute('href', 'http://x/gone.mp4')
    expect(screen.getByRole('img', { name: /Photo 1/ })).toBeInTheDocument()
    fireEvent.error(screen.getByRole('img', { name: /Photo 1/ }))
    expect(screen.getByText("This photo can't be shown here.")).toBeInTheDocument()
  })

  it('a skeleton while loading, a sentence for none, a failure with a retry', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<IncidentMediaGallery state={{ status: 'pending' }} onRetry={onRetry} />)
    expect(screen.getByLabelText('Loading photos and videos')).toBeInTheDocument()
    rerender(<IncidentMediaGallery state={{ status: 'success', media: [] }} onRetry={onRetry} />)
    expect(screen.getByText('No photos or videos are attached to this report.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Photos and videos' })).toBeInTheDocument()
    rerender(<IncidentMediaGallery state={{ status: 'error' }} onRetry={onRetry} />)
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('IncidentLocationCard', () => {
  it('shows the map slot and the coordinates, and the distance only when asked', async () => {
    const onLocate = vi.fn()
    const { rerender } = render(<IncidentLocationCard position={[27.7, 68.86]} map={<div>MAP</div>} distance={null} locationStatus="idle" onLocate={onLocate} />)
    expect(screen.getByText('MAP')).toBeInTheDocument()
    expect(screen.getByText('27.7000° N, 68.8600° E')).toBeInTheDocument()
    expect(onLocate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Show distance from me' }))
    expect(onLocate).toHaveBeenCalledTimes(1)
    rerender(<IncidentLocationCard position={[27.7, 68.86]} map={<div>MAP</div>} distance={4200} locationStatus="ready" onLocate={onLocate} />)
    expect(screen.getByText('4.2 km from you')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show distance from me' })).not.toBeInTheDocument()
  })

  it('explains a blocked location, and a stored point that isn’t on the globe', () => {
    const { rerender } = render(<IncidentLocationCard position={[27.7, 68.86]} map={null} distance={null} locationStatus="denied" onLocate={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('see how far this report is from you')
    rerender(<IncidentLocationCard position={null} map={null} distance={null} locationStatus="idle" onLocate={vi.fn()} />)
    expect(screen.getByText(/isn't a real place on the map/)).toBeInTheDocument()
  })
})

describe('IncidentTimeline', () => {
  it('lists the four steps with their state in words and the current one marked', () => {
    render(<IncidentTimeline steps={reportTimeline(makeReport({ status: 'verified', verified_at: '2026-09-21T06:00:00Z', created_at: '2026-09-20T06:00:00Z' }))} />)
    const items = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      `Reported — done${local('2026-09-20T06:00:00Z')}`,
      `Verified — current step${local('2026-09-21T06:00:00Z')}`,
      'Being handled — not yet',
      'Resolved — not yet',
    ])
    expect(items[1]).toHaveAttribute('aria-current', 'step')
  })

  it('a step passed without a record says so — no tick', () => {
    render(<IncidentTimeline steps={reportTimeline(makeReport({ status: 'resolved', verified_at: '2026-09-21T06:00:00Z', resolved_at: '2026-09-22T06:00:00Z' }))} />)
    const handled = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem')[2]
    expect(handled).toHaveTextContent('Being handled — no record')
    expect(handled).toHaveTextContent('No record kept')
    expect(handled.querySelector('svg')).toBeNull()
  })
})

describe('IncidentDetailState', () => {
  const renderState = (kind: 'loading' | 'not-found' | 'rejected' | 'error', onRetry = vi.fn()) =>
    render(
      <MemoryRouter>
        <IncidentDetailState kind={kind} backTo="/app/community?tab=verified" message="database unavailable" onRetry={onRetry} />
      </MemoryRouter>,
    )

  it('always offers Back to the view it came from', () => {
    renderState('loading')
    expect(screen.getByRole('link', { name: 'Back to community' })).toHaveAttribute('href', '/app/community?tab=verified')
    expect(screen.getByLabelText('Loading the report')).toBeInTheDocument()
  })

  it('not found, rejected, and an error with a retry', async () => {
    const onRetry = vi.fn()
    const { unmount } = renderState('not-found')
    expect(screen.getByRole('heading', { name: 'Report not found' })).toBeInTheDocument()
    unmount()
    const second = renderState('rejected')
    expect(screen.getByRole('heading', { name: 'This report was rejected' })).toBeInTheDocument()
    second.unmount()
    renderState('error', onRetry)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this report: database unavailable")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
