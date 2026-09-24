import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { NgoRegistration } from '@/api/identity'
import { OrganizationSettingsPage } from './OrganizationSettingsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationSettingsPage />
    </QueryClientProvider>,
  )
}

function ngo(overrides: Partial<NgoRegistration> = {}): NgoRegistration {
  return {
    id: 'ngo-1',
    name: 'Flood Relief Karachi',
    status: 'active',
    contact_email: 'contact@floodrelief.example',
    contact_phone: '+92 300 1234567',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
    ...overrides,
  }
}

describe('OrganizationSettingsPage', () => {
  it('loads the real organisation and pre-fills the form; contact fields the server omitted are empty', async () => {
    server.use(
      http.get('*/ngo/me', () =>
        HttpResponse.json({ ...ngo(), contact_email: undefined, contact_phone: undefined }),
      ),
    )
    renderPage()

    expect(await screen.findByLabelText('Organisation name')).toHaveValue('Flood Relief Karachi')
    expect(screen.getByLabelText('Contact email')).toHaveValue('')
    expect(screen.getByLabelText('Contact phone')).toHaveValue('')
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('saves ONLY the field that changed (a real partial patch), then shows Saved and the new name', async () => {
    let sentBody: unknown
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json(ngo({ name: 'Flood Relief Sindh' }))
      }),
    )
    renderPage()

    const name = await screen.findByLabelText('Organisation name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Flood Relief Sindh')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ name: 'Flood Relief Sindh' })
    expect(screen.getByText('Flood Relief Sindh', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('clears a contact field by sending an empty string for just that field', async () => {
    let sentBody: unknown
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ ...ngo(), contact_email: undefined })
      }),
    )
    renderPage()

    await userEvent.clear(await screen.findByLabelText('Contact email'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ contact_email: '' })
    expect(screen.getByLabelText('Contact email')).toHaveValue('')
  })

  it('makes no request at all when trimming leaves nothing actually changed', async () => {
    let patchCalled = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', () => {
        patchCalled = true
        return HttpResponse.json(ngo())
      }),
    )
    renderPage()

    await userEvent.type(await screen.findByLabelText('Organisation name'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('Discard puts the server\'s values back and disables Save again', async () => {
    server.use(http.get('*/ngo/me', () => HttpResponse.json(ngo())))
    renderPage()

    const name = await screen.findByLabelText('Organisation name')
    await userEvent.type(name, ' extra')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(name).toHaveValue('Flood Relief Karachi')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('validates before calling the network', async () => {
    let patchCalled = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', () => {
        patchCalled = true
        return HttpResponse.json(ngo())
      }),
    )
    renderPage()

    await userEvent.clear(await screen.findByLabelText('Organisation name'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Organisation name is required')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('shows the real server error when a save is rejected', async () => {
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.patch('*/ngo/me', () => HttpResponse.json({ error: 'insufficient permissions' }, { status: 403 })),
    )
    renderPage()

    await userEvent.type(await screen.findByLabelText('Contact phone'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('insufficient permissions')
  })

  it('deactivates for real after confirming, then refetches so the badge and danger zone show the server\'s truth', async () => {
    let deactivated = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo({ status: deactivated ? 'deactivated' : 'active' }))),
      http.post('*/ngo/me/deactivate', () => {
        deactivated = true
        return HttpResponse.json({ message: 'ngo deactivated' })
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate…' }))
    expect(screen.getByRole('heading', { name: 'Deactivate Flood Relief Karachi?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate organisation' }))

    expect(await screen.findByText('Deactivated')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This organisation is no longer active' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Deactivate Flood Relief/ })).not.toBeInTheDocument()
  })

  it('cancelling the dialog does not deactivate anything', async () => {
    let called = false
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.post('*/ngo/me/deactivate', () => {
        called = true
        return HttpResponse.json({ message: 'ngo deactivated' })
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(called).toBe(false)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows the real 409 in the dialog and refetches when it was already deactivated elsewhere', async () => {
    let status: NgoRegistration['status'] = 'active'
    server.use(
      http.get('*/ngo/me', () => HttpResponse.json(ngo({ status }))),
      http.post('*/ngo/me/deactivate', () => {
        status = 'deactivated'
        return HttpResponse.json({ error: 'ngo is not active' }, { status: 409 })
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate organisation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ngo is not active')
    expect(await screen.findByText('Deactivated')).toBeInTheDocument()
  })

  it('shows a load failure with a retry that recovers', async () => {
    let calls = 0
    server.use(
      http.get('*/ngo/me', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ error: 'account is not affiliated with an ngo' }, { status: 403 })
          : HttpResponse.json(ngo())
      }),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Organisation name')).toHaveValue('Flood Relief Karachi')
  })
})
