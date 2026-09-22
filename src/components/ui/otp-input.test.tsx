import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from './otp-input'

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('')
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />
}

describe('OtpInput', () => {
  it('renders 6 individually-labeled, focusable boxes', () => {
    render(<Harness />)
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i} of 6`)).toBeInTheDocument()
    }
  })

  it('auto-advances focus to the next box as digits are typed', async () => {
    render(<Harness />)
    const box1 = screen.getByLabelText('Digit 1 of 6')
    const box2 = screen.getByLabelText('Digit 2 of 6')

    box1.focus()
    await userEvent.keyboard('4')

    expect(box1).toHaveValue('4')
    expect(box2).toHaveFocus()
  })

  it('backspace on an empty box clears and focuses the previous box', async () => {
    render(<Harness />)
    const box1 = screen.getByLabelText('Digit 1 of 6')
    const box2 = screen.getByLabelText('Digit 2 of 6')

    box1.focus()
    await userEvent.keyboard('4')
    expect(box2).toHaveFocus()

    await userEvent.keyboard('{Backspace}')

    expect(box1).toHaveFocus()
    expect(box1).toHaveValue('')
  })

  it('ignores non-digit characters', async () => {
    render(<Harness />)
    const box1 = screen.getByLabelText('Digit 1 of 6')
    box1.focus()

    await userEvent.keyboard('a')

    expect(box1).toHaveValue('')
  })

  it('fills every box from a pasted 6-digit code and calls onComplete', async () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const box1 = screen.getByLabelText('Digit 1 of 6')
    await userEvent.click(box1)
    await userEvent.paste('123456')

    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i} of 6`)).toHaveValue(String(i))
    }
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('calls onComplete exactly when the 6th digit is typed, not before', async () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const box1 = screen.getByLabelText('Digit 1 of 6')
    box1.focus()

    await userEvent.keyboard('12345')
    expect(onComplete).not.toHaveBeenCalled()

    await userEvent.keyboard('6')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })
})
