import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { ResetPasswordPage } from './ResetPasswordPage'

function LoginStub() {
  const location = useLocation()
  const infoMessage = (location.state as { infoMessage?: string } | null)?.infoMessage
  return <div>login screen{infoMessage ? ` — ${infoMessage}` : ''}</div>
}

function renderResetPasswordPage(search: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ResetPasswordPage', () => {
  it('always renders the full form — there is no link-validity gate, email/token are typed fields', () => {
    renderResetPasswordPage('')

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Reset code')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
  })

  it('pre-fills email and token from the URL as a convenience, but they stay editable', () => {
    renderResetPasswordPage('?email=citizen%40example.com&token=abc123')

    expect(screen.getByLabelText('Email')).toHaveValue('citizen@example.com')
    expect(screen.getByLabelText('Reset code')).toHaveValue('abc123')
  })

  it('submits the typed email, code and password, then redirects to /login with a message', async () => {
    let sentBody: unknown
    server.use(
      http.post('*/auth/password/reset', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ message: 'password reset' })
      }),
    )
    renderResetPasswordPage('')

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Reset code'), 'abc123')
    await userEvent.type(screen.getByLabelText('New password'), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'correct-password')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/Log in with your new password/)).toBeInTheDocument()
    expect(sentBody).toEqual({
      email: 'citizen@example.com',
      token: 'abc123',
      new_password: 'correct-password',
    })
  })

  it('submits URL-prefilled email/token as-is when the user does not edit them', async () => {
    let sentBody: unknown
    server.use(
      http.post('*/auth/password/reset', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ message: 'password reset' })
      }),
    )
    renderResetPasswordPage('?email=citizen%40example.com&token=abc123')

    await userEvent.type(screen.getByLabelText('New password'), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'correct-password')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(sentBody).toEqual({
      email: 'citizen@example.com',
      token: 'abc123',
      new_password: 'correct-password',
    })
  })

  it('shows the real backend error for an expired/invalid token and stays on the screen', async () => {
    server.use(
      http.post('*/auth/password/reset', () =>
        HttpResponse.json({ error: 'invalid or expired code' }, { status: 400 }),
      ),
    )
    renderResetPasswordPage('')

    await userEvent.type(screen.getByLabelText('Email'), 'citizen@example.com')
    await userEvent.type(screen.getByLabelText('Reset code'), 'expired')
    await userEvent.type(screen.getByLabelText('New password'), 'correct-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'correct-password')
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired code')
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })
})
