import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { NgosTable } from './NgosTable'
import { makeNgo } from './testNgo'

const ngos = [
  makeNgo('n-1', 'Flood Relief Karachi', 'pending_approval', { contact_email: 'help@flood.example', contact_phone: '+92 300 1', volunteer_count: 0 }),
  makeNgo('n-2', 'Indus Relief Foundation', 'active', { volunteer_count: 3, region_count: 2 }),
  makeNgo('n-3', 'Sindh Response Network', 'rejected'),
]

function renderTable() {
  const onApprove = vi.fn()
  const onReject = vi.fn()
  render(
    <MemoryRouter>
      <NgosTable ngos={ngos} onApprove={onApprove} onReject={onReject} detailState={{ listSearch: '?tab=active' }} />
    </MemoryRouter>,
  )
  return { onApprove, onReject }
}

describe('NgosTable', () => {
  it('shows each organisation with contact details, applicant, volunteer count, submitted date and status', () => {
    renderTable()

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Flood Relief Karachi')).toBeInTheDocument()
    expect(within(rows[0]).getByText('help@flood.example · +92 300 1')).toBeInTheDocument()
    expect(within(rows[0]).getByText('applicant-n-1@example.com')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Pending approval')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/20 Sep 2026/)).toBeInTheDocument()
    expect(within(rows[1]).getByText('Active')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/^3/)).toBeInTheDocument()
    expect(within(rows[2]).getByText('Rejected')).toBeInTheDocument()
  })

  it('shows how many regions each organisation covers, worded for a screen reader ("2 regions", not a bare 2)', () => {
    renderTable()
    const rows = screen.getAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('2 regions')
    expect(rows[2]).toHaveTextContent('0 regions')
    expect(screen.getByText('Regions', { selector: 'div' })).toBeInTheDocument()
  })

  it("links View to the organisation's detail page", () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'View Indus Relief Foundation' })).toHaveAttribute('href', '/admin/ngos/n-2')
  })

  it('offers Approve and Reject only on a pending row, and reports which organisation', async () => {
    const { onApprove, onReject } = renderTable()

    expect(screen.getAllByRole('button', { name: /^Approve / })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Reject / })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Approve Flood Relief Karachi' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject Flood Relief Karachi' }))

    expect(onApprove).toHaveBeenCalledWith(ngos[0])
    expect(onReject).toHaveBeenCalledWith(ngos[0])
    const active = screen.getAllByRole('listitem')[1]
    expect(within(active).queryByRole('button')).not.toBeInTheDocument()
  })
})
