import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountSettingsPanel } from './AccountSettingsPanel'

describe('AccountSettingsPanel', () => {
  it('renders both the deactivate and delete rows', () => {
    render(<AccountSettingsPanel onDeactivateClick={vi.fn()} onDeleteClick={vi.fn()} />)

    expect(screen.getByText('Deactivate account')).toBeInTheDocument()
    expect(screen.getByText('Delete account')).toBeInTheDocument()
  })

  it('reports a click on Deactivate without opening anything itself', async () => {
    const onDeactivateClick = vi.fn()
    render(<AccountSettingsPanel onDeactivateClick={onDeactivateClick} onDeleteClick={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }))

    expect(onDeactivateClick).toHaveBeenCalledTimes(1)
  })

  it('reports a click on Delete', async () => {
    const onDeleteClick = vi.fn()
    render(<AccountSettingsPanel onDeactivateClick={vi.fn()} onDeleteClick={onDeleteClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDeleteClick).toHaveBeenCalledTimes(1)
  })
})
