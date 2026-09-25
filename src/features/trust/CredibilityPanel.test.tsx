import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CredibilityPanel } from './CredibilityPanel'

function renderPanel(overrides: Partial<React.ComponentProps<typeof CredibilityPanel>> = {}) {
  const props = { score: undefined, isLoading: false, error: null, onRetry: vi.fn(), ...overrides }
  render(<CredibilityPanel {...props} />)
  return props
}

describe('CredibilityPanel', () => {
  it('shows a stored score with the ring, and when it last changed', () => {
    renderPanel({ score: { account_id: 'a', score: 88, updated_at: '2026-09-18T00:10:05Z' } })

    expect(screen.getByRole('heading', { level: 1, name: 'Credibility' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Credibility score 88 out of 100' })).toBeInTheDocument()
    expect(screen.getByText('Last updated 18 Sep 2026')).toBeInTheDocument()
    expect(screen.queryByText('Not scored yet')).not.toBeInTheDocument()
  })

  it('shows "Not scored yet" — not a zero — for the implicit score of an account never scored', () => {
    renderPanel({ score: { account_id: 'a', score: 0 } })

    expect(screen.getByText('Not scored yet')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'No credibility score yet' })).toBeInTheDocument()
    expect(screen.queryByText(/Credibility score 0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument()
  })

  it('shows a stored score of zero as a score of zero — it has an updated_at', () => {
    renderPanel({ score: { account_id: 'a', score: 0, updated_at: '2026-09-18T00:10:05Z' } })

    expect(screen.getByRole('img', { name: 'Credibility score 0 out of 100' })).toBeInTheDocument()
    expect(screen.queryByText('Not scored yet')).not.toBeInTheDocument()
  })

  it('says what it is for, without claiming anything the backend does not do — and that there is no history', () => {
    renderPanel({ score: { account_id: 'a', score: 0 } })

    expect(screen.getByText(/designed to rise when the community reports you submit are verified/)).toBeInTheDocument()
    expect(screen.getByText(/NGO staff and admins can look up your score/)).toBeInTheDocument()
    expect(screen.getByText("An itemised history of what changed your score isn't recorded yet.")).toBeInTheDocument()
    // Nothing the API doesn't have: no level, no statistics, no points.
    expect(screen.queryByText(/Level \d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reports submitted/)).not.toBeInTheDocument()
  })

  it('shows a busy skeleton while loading, and no score or "not scored yet"', () => {
    renderPanel({ isLoading: true })

    expect(screen.getByRole('status', { name: 'Loading your credibility score' })).toBeInTheDocument()
    expect(screen.queryByText('Not scored yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows a failure with a retry — never an empty score, which would read as "not scored"', async () => {
    const { onRetry } = renderPanel({ error: 'boom' })

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByText('Not scored yet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
