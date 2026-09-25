import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from './drawer'

/** The dialogs in this app are opened from page state (a row's button sets a target), not from a Radix `Trigger` — so Radix has no trigger to return focus to. */
describe('a modal gives focus back to what opened it', () => {
  it('a dialog opened from state: Escape returns focus to the button that opened it', async () => {
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Resolve zone 1</button>
          <button>Resolve zone 2</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>It cannot be undone.</DialogDescription>
              <button>Confirm</button>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Resolve zone 1' })
    await userEvent.click(opener)
    expect(await screen.findByRole('dialog', { name: 'Are you sure?' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('a dialog mounted only while open (the pattern most drawers use): the same', async () => {
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Register a shelter</button>
          {open && (
            <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
              <DialogContent>
                <DialogTitle>Register</DialogTitle>
                <DialogDescription>Details.</DialogDescription>
                <button>Save</button>
              </DialogContent>
            </Dialog>
          )}
        </>
      )
    }
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Register a shelter' })
    await userEvent.click(opener)
    await screen.findByRole('dialog', { name: 'Register' })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('a dialog whose first field is autofocused (the register drawer): still returns to the button that opened it, not the field that took focus first', async () => {
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Register shelter</button>
          {open && (
            <Drawer open onOpenChange={(next) => !next && setOpen(false)}>
              <DrawerContent>
                <DrawerTitle>Register</DrawerTitle>
                <DrawerDescription>Details.</DrawerDescription>
                <input aria-label="Name" autoFocus />
              </DrawerContent>
            </Drawer>
          )}
        </>
      )
    }
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Register shelter' })
    opener.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: 'Register' })
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('a drawer, the same', async () => {
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Edit</button>
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent>
              <DrawerTitle>Edit shelter</DrawerTitle>
              <DrawerDescription>Change it.</DrawerDescription>
              <button>Save</button>
            </DrawerContent>
          </Drawer>
        </>
      )
    }
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Edit' })
    await userEvent.click(opener)
    await screen.findByRole('dialog', { name: 'Edit shelter' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('a dialog with a real Trigger still returns to it', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open it</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const trigger = screen.getByRole('button', { name: 'Open it' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('does nothing — and does not throw — when what opened it is gone by the time it closes (a row that was resolved away)', async () => {
    function Page() {
      const [state, setState] = useState<'idle' | 'open' | 'gone'>('idle')
      return (
        <>
          {state !== 'gone' && <button onClick={() => setState('open')}>Row action</button>}
          <button>Somewhere else</button>
          <Dialog open={state === 'open'} onOpenChange={() => setState('gone')}>
            <DialogContent>
              <DialogTitle>Sure?</DialogTitle>
              <DialogDescription>Yes.</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Row action' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Row action' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Somewhere else' })).not.toHaveFocus()
  })

  it('leaves focus alone when the caller handles the close itself', async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
              <DialogTitle>T</DialogTitle>
              <DialogDescription>D</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).not.toHaveFocus()
  })
})
