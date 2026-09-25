import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { CredibilityPage } from './CredibilityPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CredibilityPage />
    </QueryClientProvider>,
  )
}

const serve = (body: unknown, status = 200) => server.use(http.get('*/trust-score', () => HttpResponse.json(body as object, { status })))

describe('CredibilityPage', () => {
  it("shows the account's stored score and when it was updated", async () => {
    serve({ account_id: 'a', score: 88, updated_at: '2026-09-25T17:44:18.872965+05:00' })
    renderPage()

    expect(await screen.findByRole('img', { name: 'Credibility score 88 out of 100' })).toBeInTheDocument()
    expect(screen.getByText('Last updated 25 Sep 2026')).toBeInTheDocument()
  })

  it('shows "Not scored yet" for the never-scored account the backend answers with an implicit zero', async () => {
    serve({ account_id: 'a', score: 0 })
    renderPage()

    expect(await screen.findByText('Not scored yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a score outside 0–100 as the number it is', async () => {
    serve({ account_id: 'a', score: 250, updated_at: '2026-09-25T12:44:18Z' })
    renderPage()

    expect(await screen.findByText('250')).toBeInTheDocument()
    expect(screen.queryByText('of 100')).not.toBeInTheDocument()
  })

  it('shows the failure with a retry, and recovers when the retry succeeds', async () => {
    let failing = true
    server.use(
      http.get('*/trust-score', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json({ account_id: 'a', score: 42, updated_at: '2026-09-25T12:44:18Z' }))),
      http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('img', { name: 'Credibility score 42 out of 100' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
