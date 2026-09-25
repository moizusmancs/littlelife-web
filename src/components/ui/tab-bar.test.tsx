import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from './tab-bar'

const TABS = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
  { id: 'three', label: 'Three' },
] as const
type Id = (typeof TABS)[number]['id']

function Harness({ onChange }: { onChange?: (id: Id) => void }) {
  const [active, setActive] = useState<Id>('one')
  return (
    <TabBar
      tabs={TABS}
      active={active}
      onChange={(id) => {
        setActive(id)
        onChange?.(id)
      }}
      label="Things"
      idPrefix="thing-tab"
      panelId="thing-panel"
    />
  )
}

describe('TabBar', () => {
  it('is a tablist whose tabs name the panel they control, with only the active one in the tab order', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Things' })).toBeInTheDocument()
    const one = screen.getByRole('tab', { name: 'One' })
    expect(one).toHaveAttribute('aria-selected', 'true')
    expect(one).toHaveAttribute('aria-controls', 'thing-panel')
    expect(one).toHaveAttribute('id', 'thing-tab-one')
    expect(one).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves and selects with the arrow keys (wrapping), Home and End, and focuses what it selects', async () => {
    render(<Harness />)
    screen.getByRole('tab', { name: 'One' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
  })

  it('measures each arrow from the tab that has focus, so keys pressed faster than the page can follow still step one tab at a time', async () => {
    // A page that has not caught up: `active` never changes, as it wouldn't for a moment when the tab lives in the URL.
    const onChange = vi.fn()
    render(<TabBar tabs={TABS} active="one" onChange={onChange} label="Things" idPrefix="thing-tab" panelId="thing-panel" />)
    screen.getByRole('tab', { name: 'One' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(onChange.mock.calls.map(([id]) => id)).toEqual(['two', 'three'])
  })

  it('ignores other keys', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('tab', { name: 'One' }).focus()
    await userEvent.keyboard('a{ArrowDown}{ArrowUp}{Escape}')
    expect(onChange).not.toHaveBeenCalled()
  })
})
