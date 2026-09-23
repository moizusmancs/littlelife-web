import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { ForgotPasswordPage } from './ForgotPasswordPage'

function renderForgotPasswordPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ForgotPasswordPage', () => {
  it('shows the same confirmation regardless of whether the email is actually registered', async () => {
    let sentBody: unknown
    server.use(
      http.post('*/auth/password/forgot', async ({ request }) => {
        sentBody = await request.json()
        // The real backend always returns this exact 200, whether or not the email exists
        // (api/00-identity.md) — the mock mirrors that, there is no "unknown email" branch.
        return HttpResponse.json({ message: 'if that email is registered, a reset link has been sent' })
      }),
    )
    renderForgotPasswordPage()

    await userEvent.type(screen.getByLabelText('Email'), 'anyone@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Code' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(sentBody).toEqual({ email: 'anyone@example.com' })
  })

  it('shows a real error banner on a genuine network/server failure', async () => {
    server.use(http.post('*/auth/password/forgot', () => HttpResponse.error()))
    renderForgotPasswordPage()

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Code' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
  })
})
