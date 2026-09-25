import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoreRing } from './ScoreRing'
import { ScoreMeter } from './ScoreMeter'

describe('ScoreRing', () => {
  it('reads out the score and fills the ring to it', () => {
    render(<ScoreRing score={88} />)

    const ring = screen.getByRole('img', { name: 'Credibility score 88 out of 100' })
    expect(ring.style.background).toContain('88%')
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('of 100')).toBeInTheDocument()
  })

  it('draws an empty ring and a dash for an account with no score — and says so', () => {
    render(<ScoreRing score={null} />)

    const ring = screen.getByRole('img', { name: 'No credibility score yet' })
    expect(ring.style.background).toContain(' 0%')
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/of 100/)).not.toBeInTheDocument()
  })

  it('shows a score outside the scale as the number it is, stops the ring at the ends, and does not say "of 100"', () => {
    const { unmount } = render(<ScoreRing score={250} />)
    expect(screen.getByRole('img').style.background).toContain('100%')
    expect(screen.getByText('250')).toBeInTheDocument()
    expect(screen.queryByText('of 100')).not.toBeInTheDocument()
    unmount()

    render(<ScoreRing score={-5} />)
    expect(screen.getByRole('img').style.background).toContain(' 0%')
    expect(screen.getByText('-5')).toBeInTheDocument()
  })

  it('accepts the scale ends: 0 and 100 are scores', () => {
    const { unmount } = render(<ScoreRing score={0} />)
    expect(screen.getByRole('img', { name: 'Credibility score 0 out of 100' })).toBeInTheDocument()
    unmount()
    render(<ScoreRing score={100} />)
    expect(screen.getByText('of 100')).toBeInTheDocument()
  })
})

describe('ScoreMeter', () => {
  it('reads out the score and clamps the bar', () => {
    render(<ScoreMeter score={250} />)
    const meter = screen.getByRole('img', { name: 'Credibility score 250 out of 100' })
    expect((meter.firstChild as HTMLElement).style.width).toBe('100%')
  })
})
