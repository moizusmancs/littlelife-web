import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AlertPreferences } from '@/api/profiling'
import { AlertPreferencesPanel } from './AlertPreferencesPanel'

const defaults: AlertPreferences = {
  id: 'p1',
  push_enabled: true,
  sms_enabled: true,
  whatsapp_enabled: false,
  voice_call_enabled: true,
  language: 'en',
  minimum_severity: 'general_advisory',
  created_at: '2026-09-20T06:44:36Z',
  updated_at: '2026-09-20T06:44:36Z',
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof AlertPreferencesPanel>> = {}) {
  const props = { prefs: defaults, onChange: vi.fn(), status: 'idle' as const, error: null, onDismissError: vi.fn(), ...overrides }
  render(<AlertPreferencesPanel {...props} />)
  return props
}

describe('AlertPreferencesPanel', () => {
  it('shows each channel as a switch in the state the server has — the defaults are push, SMS and voice on, WhatsApp off', () => {
    renderPanel()

    expect(screen.getByRole('switch', { name: 'Push notifications' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'SMS' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'WhatsApp' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Voice calls' })).toBeChecked()
  })

  it('describes each switch by its line, for a screen reader', () => {
    renderPanel()
    expect(screen.getByRole('switch', { name: 'SMS' })).toHaveAccessibleDescription('Text messages to your phone.')
  })

  it('reports a toggled channel as a patch of ONLY that field — never the values around it', async () => {
    const { onChange } = renderPanel()

    await userEvent.click(screen.getByRole('switch', { name: 'WhatsApp' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Push notifications' }))

    expect(onChange).toHaveBeenNthCalledWith(1, { whatsapp_enabled: true })
    expect(onChange).toHaveBeenNthCalledWith(2, { push_enabled: false })
  })

  it('says once that SMS, WhatsApp and voice need a phone number the account does not have', () => {
    renderPanel()
    expect(screen.getAllByText(/SMS, WhatsApp and voice calls go to a phone number, and your account doesn't have one on file yet\./)).toHaveLength(1)
  })

  it('shows the four severities as one radio group with the current one chosen', () => {
    renderPanel({ prefs: { ...defaults, minimum_severity: 'warning' } })

    const group = screen.getByRole('group', { name: 'Minimum severity' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: /^Warning/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^General advisory/ })).not.toBeChecked()
  })

  it('reports a chosen severity as a patch of only minimum_severity', async () => {
    const { onChange } = renderPanel()

    await userEvent.click(screen.getByRole('radio', { name: /^Critical emergency/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ minimum_severity: 'critical_emergency' })
  })

  it('says that critical emergencies always get through, whatever the minimum', () => {
    renderPanel()
    expect(screen.getByText(/Critical emergencies always reach you\./)).toBeInTheDocument()
  })

  it('offers English, Urdu and Sindhi, and reports a change as a patch of only language', async () => {
    const { onChange } = renderPanel({ prefs: { ...defaults, language: 'ur' } })

    const select = screen.getByRole('combobox', { name: 'Alert language' })
    expect(select).toHaveValue('ur')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await userEvent.selectOptions(select, 'sd')

    expect(onChange).toHaveBeenCalledWith({ language: 'sd' })
  })

  it("shows an account's unfamiliar language as an extra option instead of pretending it's English", () => {
    renderPanel({ prefs: { ...defaults, language: 'fr' } })

    expect(screen.getByRole('combobox', { name: 'Alert language' })).toHaveValue('fr')
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('says nothing about saving when idle, and says "Saving…" then "All changes saved"', () => {
    const { unmount } = render(<AlertPreferencesPanel prefs={defaults} onChange={vi.fn()} status="idle" error={null} onDismissError={vi.fn()} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    unmount()

    const { rerender } = render(<AlertPreferencesPanel prefs={defaults} onChange={vi.fn()} status="saving" error={null} onDismissError={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
    rerender(<AlertPreferencesPanel prefs={defaults} onChange={vi.fn()} status="saved" error={null} onDismissError={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved')
  })

  it("shows a refused change's message as an alert that can be dismissed", async () => {
    const { onDismissError } = renderPanel({ error: "We couldn't save that change. language is required" })

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save that change. language is required")
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismissError).toHaveBeenCalledTimes(1)
  })

  it('has no Save button — every change saves as it is made', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })
})
