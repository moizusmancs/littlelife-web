import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { EditProfilePage } from './EditProfilePage'

function renderEditProfilePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <EditProfilePage />
    </QueryClientProvider>,
  )
}

describe('EditProfilePage', () => {
  it('shows a loading skeleton, then pre-fills the field with the real fetched name', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderEditProfilePage()

    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Your name')).toHaveValue('Hina Khan')
  })

  it('pre-fills an empty field for a freshly-registered account (real "not yet set" state)', async () => {
    server.use(
      http.get('*/profile', () => HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' })),
    )
    renderEditProfilePage()

    expect(await screen.findByLabelText('Your name')).toHaveValue('')
  })

  it('submits the real PATCH /profile call and shows Saved', async () => {
    server.use(
      http.get('*/profile', () => HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' })),
    )
    renderEditProfilePage()
    await screen.findByLabelText('Your name')

    let sentBody: unknown
    server.use(
      http.patch('*/profile', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' })
      }),
    )

    await userEvent.type(screen.getByLabelText('Your name'), 'Hina Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ name: 'Hina Khan' })
  })

  it('clears the Saved indicator once the field is edited again', async () => {
    server.use(
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
      http.patch('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Hina Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderEditProfilePage()
    await screen.findByDisplayValue('Hina Khan')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Your name'), ' Updated')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows the real backend error banner on a failed save', async () => {
    server.use(
      http.get('*/profile', () => HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' })),
      http.patch('*/profile', () => HttpResponse.json({ error: 'name is required' }, { status: 400 })),
    )
    renderEditProfilePage()
    await screen.findByLabelText('Your name')

    await userEvent.type(screen.getByLabelText('Your name'), 'Hina Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
