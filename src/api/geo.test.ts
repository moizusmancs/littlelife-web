import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { getAdminNgoRegions, getRegionNgos } from './geo'
import { updateProfile } from './profiling'

describe('getRegionNgos', () => {
  it('asks for the region’s NGOs, with every status unless one is given', async () => {
    const seen: Array<{ path: string; status: string | null }> = []
    server.use(
      http.get('*/admin/regions/:id/ngos', ({ request, params }) => {
        seen.push({ path: String(params.id), status: new URL(request.url).searchParams.get('status') })
        return HttpResponse.json([])
      }),
    )
    await getRegionNgos('r-1')
    await getRegionNgos('r-1', 'active')
    expect(seen).toEqual([
      { path: 'r-1', status: null },
      { path: 'r-1', status: 'active' },
    ])
  })
})

describe('getAdminNgoRegions', () => {
  it('reads a bare array of the NGO’s regions', async () => {
    server.use(
      http.get('*/admin/ngos/:id/regions', () => HttpResponse.json([{ id: 'r-1', name: 'Sindh', level: 'province', path: 'Sindh', assigned_at: '2026-08-06T07:19:47Z' }])),
    )
    expect(await getAdminNgoRegions('n-1')).toEqual([{ id: 'r-1', name: 'Sindh', level: 'province', path: 'Sindh', assigned_at: '2026-08-06T07:19:47Z' }])
  })
})

describe('updateProfile', () => {
  function capture() {
    const bodies: unknown[] = []
    server.use(
      http.patch('*/profile', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ id: 'p', name: 'x', created_at: '', updated_at: '' })
      }),
    )
    return bodies
  }

  it('sends only what it is given — a name alone never carries a home region', async () => {
    const bodies = capture()
    await updateProfile({ name: 'Aisha' })
    expect(bodies).toEqual([{ name: 'Aisha' }])
  })

  it('sends home_region_id to set it, and an empty string to clear it — which is not the same as omitting it', async () => {
    const bodies = capture()
    await updateProfile({ homeRegionId: 'r-1' })
    await updateProfile({ homeRegionId: '' })
    expect(bodies).toEqual([{ home_region_id: 'r-1' }, { home_region_id: '' }])
  })

  it('can send both at once', async () => {
    const bodies = capture()
    await updateProfile({ name: 'Aisha', homeRegionId: 'r-1' })
    expect(bodies).toEqual([{ name: 'Aisha', home_region_id: 'r-1' }])
  })
})
