import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { getAllNgos, type AdminNgo } from './identity'

function makeNgos(count: number): AdminNgo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ngo-${i}`,
    name: `NGO ${i}`,
    status: 'active' as const,
    created_by_id: `c-${i}`,
    created_by_email: `c${i}@example.com`,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
    volunteer_count: 0,
  }))
}

function serve(count: number) {
  const requests: Array<{ limit: number; offset: number; status: string | null }> = []
  const all = makeNgos(count)
  server.use(
    http.get('*/admin/ngos', ({ request }) => {
      const url = new URL(request.url)
      const limit = Number(url.searchParams.get('limit'))
      const offset = Number(url.searchParams.get('offset'))
      requests.push({ limit, offset, status: url.searchParams.get('status') })
      return HttpResponse.json({ ngos: all.slice(offset, offset + limit), total: all.length, limit, offset })
    }),
  )
  return requests
}

describe('getAllNgos', () => {
  it('needs one request when everything fits in a page, and asks for no status filter', async () => {
    const requests = serve(16)

    const result = await getAllNgos()

    expect(result.ngos).toHaveLength(16)
    expect(result.total).toBe(16)
    expect(requests).toEqual([{ limit: 100, offset: 0, status: null }])
  })

  it('handles none at all', async () => {
    serve(0)
    expect(await getAllNgos()).toEqual({ ngos: [], total: 0 })
  })

  it('pulls the remaining pages and returns every organisation in order', async () => {
    const requests = serve(230)

    const result = await getAllNgos()

    expect(result.ngos.map((n) => n.id)).toEqual(makeNgos(230).map((n) => n.id))
    expect(requests.map((r) => r.offset).sort((a, b) => a - b)).toEqual([0, 100, 200])
  })
})
