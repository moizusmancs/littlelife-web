import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { getAllAccounts, type AccountSummary } from './identity'

function makeAccounts(count: number): AccountSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `acct-${i}`,
    email: `user${i}@example.com`,
    role: 'user' as const,
    status: 'active' as const,
    email_verified: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  }))
}

/** Serves `GET /admin/accounts` the way the real one behaves: `limit` capped at 100, offset paging. */
function serve(source: () => AccountSummary[], requests: Array<{ limit: number; offset: number }> = []) {
  server.use(
    http.get('*/admin/accounts', ({ request }) => {
      const url = new URL(request.url)
      const limit = Number(url.searchParams.get('limit'))
      const offset = Number(url.searchParams.get('offset'))
      requests.push({ limit, offset })
      const all = source()
      return HttpResponse.json({ accounts: all.slice(offset, offset + limit), total: all.length, limit, offset })
    }),
  )
  return requests
}

describe('getAllAccounts', () => {
  it('needs only one request when everything fits in the first page of 100', async () => {
    const requests = serve(() => makeAccounts(40))

    const result = await getAllAccounts()

    expect(result.accounts).toHaveLength(40)
    expect(result.total).toBe(40)
    expect(requests).toEqual([{ limit: 100, offset: 0 }])
  })

  it('handles an empty platform', async () => {
    serve(() => [])
    expect(await getAllAccounts()).toEqual({ accounts: [], total: 0 })
  })

  it('pulls the remaining pages after the first, and returns every account in order', async () => {
    const requests = serve(() => makeAccounts(250))

    const result = await getAllAccounts()

    expect(result.accounts.map((a) => a.id)).toEqual(makeAccounts(250).map((a) => a.id))
    expect(result.total).toBe(250)
    expect(requests.map((r) => r.offset).sort((a, b) => a - b)).toEqual([0, 100, 200])
  })

  it('does not list an account twice when new signups shift the offsets between requests', async () => {
    let calls = 0
    serve(() => {
      // After the first page is served, ten newer accounts appear at the front.
      calls += 1
      return calls === 1 ? makeAccounts(150) : [...makeAccounts(10).map((a) => ({ ...a, id: `new-${a.id}` })), ...makeAccounts(150)]
    })

    const { accounts } = await getAllAccounts()

    const ids = accounts.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('acct-149')
  })

  it('stops at the safety cap and reports the real total, so the screen can say some were left out', async () => {
    const requests = serve(() => makeAccounts(5300))

    const result = await getAllAccounts()

    expect(result.accounts).toHaveLength(5000)
    expect(result.total).toBe(5300)
    expect(requests).toHaveLength(50)
  })
})
