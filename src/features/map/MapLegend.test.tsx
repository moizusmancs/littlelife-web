import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MapLegend } from './MapLegend'

describe('MapLegend', () => {
  it('explains the flood colours, and says which model zones the server leaves out', () => {
    render(<MapLegend />)
    expect(screen.getByRole('heading', { name: 'Flood zones' })).toBeInTheDocument()
    expect(screen.getByText('Lower model confidence')).toBeInTheDocument()
    expect(screen.getByText("Model zones under 34% confidence aren't shown.")).toBeInTheDocument()
    for (const level of ['High', 'Medium', 'Low']) expect(screen.getByText(new RegExp(`${level} risk outline`))).toBeInTheDocument()
    expect(screen.getByText('Declared by staff: one flat colour')).toBeInTheDocument()
  })

  it('explains the place markers', () => {
    render(<MapLegend />)
    expect(screen.getByRole('heading', { name: 'Places' })).toBeInTheDocument()
    for (const label of ['Open / safe', 'At risk', 'Closed / damaged', 'Status unknown']) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('leaves out the citizen floor note where every zone is shown', () => {
    render(<MapLegend showCitizenFloor={false} />)
    expect(screen.queryByText(/aren't shown/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Flood zones' })).toBeInTheDocument()
  })
})
