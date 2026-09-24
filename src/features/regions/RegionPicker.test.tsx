import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Region } from '@/api/geo'
import { RegionPicker } from './RegionPicker'
import { sampleRegions } from './testRegion'
import { useRegionPicker } from './useRegionPicker'

function Harness({ regions = sampleRegions, unavailable = new Map<string, string>() }: { regions?: Region[]; unavailable?: Map<string, string> }) {
  const { pickerProps, selected, reset } = useRegionPicker(regions, unavailable)
  return (
    <div>
      <RegionPicker {...pickerProps} />
      <output data-testid="selected">{selected?.name ?? 'nothing'}</output>
      <button type="button" onClick={reset}>
        reset
      </button>
    </div>
  )
}

const optionNames = () =>
  within(screen.getAllByRole('list')[0])
    .getAllByRole('radio')
    .map((radio) => radio.closest('label')?.textContent)

describe('RegionPicker', () => {
  it('starts at the top level: provinces first, then a district with no parent, each with its level', () => {
    render(<Harness />)
    expect(optionNames()).toEqual(['PunjabProvince', 'SindhProvince', 'Orphan DistrictDistrict'])
    expect(screen.getByText('All regions', { selector: '[aria-current]' })).toBeInTheDocument()
    expect(screen.getByTestId('selected')).toHaveTextContent('nothing')
  })

  it('has an arrow to open sub-regions only on regions that have some', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Show the 2 sub-regions of Sindh' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /of Punjab/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /of Orphan District/ })).not.toBeInTheDocument()
  })

  it('drills down province › district › tehsil, showing where you are, and goes back up from the trail', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    expect(optionNames()).toEqual(['LarkanaDistrict', 'SukkurDistrict'])
    const trail = screen.getByRole('navigation', { name: 'Where you are' })
    expect(within(trail).getByText('Sindh')).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByRole('button', { name: 'Show the 1 sub-region of Sukkur' }))
    expect(optionNames()).toEqual(['Sukkur CityTehsil'])
    expect(screen.queryByRole('button', { name: /Show the/ })).not.toBeInTheDocument()

    await userEvent.click(within(trail).getByRole('button', { name: 'Sindh' }))
    expect(optionNames()).toEqual(['LarkanaDistrict', 'SukkurDistrict'])
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Where you are' })).getByRole('button', { name: 'All regions' }))
    expect(optionNames()).toEqual(['PunjabProvince', 'SindhProvince', 'Orphan DistrictDistrict'])
  })

  it('chooses a region at any level — a whole province, or a tehsil — and only one at a time', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: /Sindh/ }))
    expect(screen.getByTestId('selected')).toHaveTextContent('Sindh')

    await userEvent.click(screen.getByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show the 1 sub-region of Sukkur' }))
    await userEvent.click(screen.getByRole('radio', { name: /Sukkur City/ }))
    expect(screen.getByTestId('selected')).toHaveTextContent('Sukkur City')
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
  })

  it('keeps the choice while browsing elsewhere, and clears everything on reset', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: /Punjab/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    expect(screen.getByTestId('selected')).toHaveTextContent('Punjab')

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(screen.getByTestId('selected')).toHaveTextContent('nothing')
    expect(optionNames()).toEqual(['PunjabProvince', 'SindhProvince', 'Orphan DistrictDistrict'])
  })

  it('searches by name across every level into a flat list with each result’s parents, hiding the trail', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search regions' }), 'sukkur')
    const results = within(screen.getByRole('list', { name: 'Matching regions' })).getAllByRole('radio')
    expect(results.map((r) => r.closest('label')?.textContent)).toEqual(['SukkurDistrict · Sindh', 'Sukkur CityTehsil · Sindh › Sukkur'])
    expect(screen.queryByRole('navigation', { name: 'Where you are' })).not.toBeInTheDocument()

    await userEvent.click(results[1])
    expect(screen.getByTestId('selected')).toHaveTextContent('Sukkur City')
    expect(screen.queryByRole('button', { name: /Show the/ })).not.toBeInTheDocument()
  })

  it('says when a search matches nothing, and returns to browsing when cleared', async () => {
    render(<Harness />)
    const search = screen.getByRole('searchbox', { name: 'Search regions' })
    await userEvent.type(search, 'zzz')
    expect(screen.getByText('No regions match.')).toBeInTheDocument()
    await userEvent.clear(search)
    expect(optionNames()).toEqual(['PunjabProvince', 'SindhProvince', 'Orphan DistrictDistrict'])
  })

  it('lists regions that can’t be chosen, disabled and with the reason, without hiding them', async () => {
    render(<Harness unavailable={new Map([['sindh', 'Already added']])} />)
    const sindh = screen.getByRole('radio', { name: /Sindh/ })
    expect(sindh).toBeDisabled()
    expect(sindh.closest('label')).toHaveTextContent('Province · Already added')
    await userEvent.click(sindh)
    expect(screen.getByTestId('selected')).toHaveTextContent('nothing')
    // …but what's inside it can still be opened and chosen.
    await userEvent.click(screen.getByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    expect(screen.getByRole('radio', { name: /Larkana/ })).toBeEnabled()
  })

  it('lands on the last valid level when the list changes under an open trail', async () => {
    const { rerender } = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Show the 2 sub-regions of Sindh' }))
    rerender(<Harness regions={sampleRegions.filter((r) => r.id !== 'sindh' && r.parent_region_id !== 'sindh')} />)
    // Sindh and its districts are gone; the trail falls back to the top, where the tehsil whose district
    // vanished now sits rather than disappearing.
    expect(optionNames()).toEqual(['PunjabProvince', 'Orphan DistrictDistrict', 'Sukkur CityTehsil'])
  })
})
