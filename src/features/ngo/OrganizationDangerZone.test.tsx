import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationDangerZone } from './OrganizationDangerZone'

describe('OrganizationDangerZone', () => {
  it('offers Deactivate for an active organisation and reports the click', async () => {
    const onDeactivateClick = vi.fn()
    render(<OrganizationDangerZone status="active" onDeactivateClick={onDeactivateClick} />)

    expect(screen.getByRole('heading', { name: 'Deactivate organisation' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate…' }))

    expect(onDeactivateClick).toHaveBeenCalledTimes(1)
  })

  it('replaces the button with a plain statement for any non-active status — it could only fail', () => {
    render(<OrganizationDangerZone status="deactivated" onDeactivateClick={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'This organisation is no longer active' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
