import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { AlertPreferences, AlertPreferencesPatch } from '@/api/profiling'
import { AlertPreferencesPage } from './AlertPreferencesPage'

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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertPreferencesPage />
    </QueryClientProvider>,
  )
}

/** An in-memory stand-in for the two routes, applying a patch the way the backend does. `delayMs` slows the PATCH. */
function servePreferences(initial: AlertPreferences = defaults, options: { delayMs?: number } = {}) {
  let stored = { ...initial }
  const patches: AlertPreferencesPatch[] = []
  server.use(
    http.get('*/profile/alert-preferences', () => HttpResponse.json(stored)),
    http.patch('*/profile/alert-preferences', async ({ request }) => {
      const patch = (await request.json()) as AlertPreferencesPatch
      patches.push(patch)
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
      stored = { ...stored, ...patch, updated_at: '2026-09-25T12:00:00Z' }
      return HttpResponse.json(stored)
    }),
  )
  return { patches, current: () => stored }
}

describe('AlertPreferencesPage', () => {
  it('shows the account\'s preferences as the server has them', async () => {
    servePreferences({ ...defaults, whatsapp_enabled: true, minimum_severity: 'watch', language: 'sd' })
    renderPage()

    expect(await screen.findByRole('switch', { name: 'WhatsApp' })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Watch/ })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Alert language' })).toHaveValue('sd')
  })

  it('shows the failure with a retry, and recovers when the retry succeeds', async () => {
    let failing = true
    server.use(
      http.get('*/profile/alert-preferences', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(defaults))),
      http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('switch', { name: 'Push notifications' })).toBeInTheDocument()
  })

  describe('saving as you go', () => {
    it('sends ONLY the field that changed, then says "All changes saved"', async () => {
      const { patches } = servePreferences()
      renderPage()

      await userEvent.click(await screen.findByRole('switch', { name: 'WhatsApp' }))

      expect(await screen.findByText('All changes saved')).toBeInTheDocument()
      expect(patches).toEqual([{ whatsapp_enabled: true }])
    })

    it('shows the new value at once — before the server has answered — and "Saving…" while it waits', async () => {
      servePreferences(defaults, { delayMs: 150 })
      renderPage()

      await userEvent.click(await screen.findByRole('switch', { name: 'Push notifications' }))

      expect(screen.getByRole('switch', { name: 'Push notifications' })).not.toBeChecked()
      expect(screen.getByRole('status')).toHaveTextContent('Saving…')
      expect(await screen.findByText('All changes saved')).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: 'Push notifications' })).not.toBeChecked()
    })

    it('sends a severity and a language as their own single-field patches', async () => {
      const { patches } = servePreferences()
      renderPage()

      await userEvent.click(await screen.findByRole('radio', { name: /^Warning/ }))
      await waitFor(() => expect(patches).toHaveLength(1))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Alert language' }), 'ur')
      await waitFor(() => expect(patches).toHaveLength(2))

      expect(patches).toEqual([{ minimum_severity: 'warning' }, { language: 'ur' }])
      expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    })

    it('never sends a value the user did not touch — a channel left alone is not in any request', async () => {
      const { patches } = servePreferences()
      renderPage()

      await userEvent.click(await screen.findByRole('switch', { name: 'SMS' }))
      await waitFor(() => expect(patches).toHaveLength(1))

      expect(Object.keys(patches[0])).toEqual(['sms_enabled'])
    })

    it('keeps quick taps in order and does not flicker: two switches tapped at once both end up as tapped', async () => {
      const { patches, current } = servePreferences(defaults, { delayMs: 80 })
      renderPage()

      const voice = await screen.findByRole('switch', { name: 'Voice calls' })
      const voiceStates: Array<string | null> = []
      const observer = new MutationObserver(() => voiceStates.push(voice.getAttribute('aria-checked')))
      observer.observe(voice, { attributes: true, attributeFilter: ['aria-checked'] })

      await userEvent.click(screen.getByRole('switch', { name: 'WhatsApp' }))
      await userEvent.click(voice)

      expect(await screen.findByText('All changes saved')).toBeInTheDocument()
      // The second switch went off once and stayed off — the first save's answer (which doesn't have it yet) never flipped it back.
      expect(voiceStates).toEqual(['false'])
      observer.disconnect()
      expect(patches).toEqual([{ whatsapp_enabled: true }, { voice_call_enabled: false }])
      expect(current()).toMatchObject({ whatsapp_enabled: true, voice_call_enabled: false })
      expect(screen.getByRole('switch', { name: 'WhatsApp' })).toBeChecked()
      expect(screen.getByRole('switch', { name: 'Voice calls' })).not.toBeChecked()
    })

    it('keeps a switch tapped twice as the last tap left it', async () => {
      const { patches, current } = servePreferences(defaults, { delayMs: 60 })
      renderPage()

      const push = await screen.findByRole('switch', { name: 'Push notifications' })
      await userEvent.click(push)
      await userEvent.click(push)

      await waitFor(() => expect(patches).toHaveLength(2))
      expect(await screen.findByText('All changes saved')).toBeInTheDocument()
      expect(patches).toEqual([{ push_enabled: false }, { push_enabled: true }])
      expect(current().push_enabled).toBe(true)
      expect(screen.getByRole('switch', { name: 'Push notifications' })).toBeChecked()
    })

    it("puts the old value back and shows the server's message when a change is refused", async () => {
      servePreferences({ ...defaults, language: 'ur' })
      server.use(http.patch('*/profile/alert-preferences', () => HttpResponse.json({ error: 'language is required' }, { status: 400 })))
      renderPage()

      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Alert language' }), 'sd')

      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save that change. language is required")
      await waitFor(() => expect(screen.getByRole('combobox', { name: 'Alert language' })).toHaveValue('ur')) // what the server still has
      expect(screen.queryByText('All changes saved')).not.toBeInTheDocument()
    })

    it('clears the message when the next change goes through, and the message can be dismissed', async () => {
      let refusing = true
      const { patches } = servePreferences()
      server.use(
        http.patch('*/profile/alert-preferences', async ({ request }) => {
          patches.push((await request.json()) as AlertPreferencesPatch)
          return refusing ? HttpResponse.json({ error: 'nope' }, { status: 400 }) : HttpResponse.json({ ...defaults, whatsapp_enabled: true })
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('switch', { name: 'WhatsApp' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('nope')
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      refusing = true
      await userEvent.click(screen.getByRole('switch', { name: 'WhatsApp' }))
      await screen.findByRole('alert')
      refusing = false
      await userEvent.click(screen.getByRole('switch', { name: 'WhatsApp' }))
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    })
  })
})
