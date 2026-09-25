import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountDetailsCard } from './AccountDetailsCard'

describe('AccountDetailsCard', () => {
  it('shows the email with a Verified badge, and when the account was created', () => {
    render(<AccountDetailsCard email="hina@example.com" emailVerified memberSince="2026-09-20T06:44:36Z" />)

    expect(screen.getByRole('heading', { name: 'Your account' })).toBeInTheDocument()
    expect(screen.getByText('hina@example.com')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('20 September 2026')).toBeInTheDocument()
  })

  it('shows no Verified badge for an email that is not verified', () => {
    render(<AccountDetailsCard email="hina@example.com" emailVerified={false} memberSince="2026-09-20T06:44:36Z" />)
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
  })

  it('shows a placeholder, not a date, until the profile has loaded', () => {
    render(<AccountDetailsCard email="hina@example.com" emailVerified memberSince={undefined} />)

    expect(screen.getByText('hina@example.com')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
  })

  it('has nothing to edit — no inputs, no buttons', () => {
    render(<AccountDetailsCard email="hina@example.com" emailVerified memberSince="2026-09-20T06:44:36Z" />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
