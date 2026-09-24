import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { getEssentialLocations, getInfrastructure, getShelter, getShelters, reportEssentialLocationStatus, shelterQueryKey } from './facilities'
import { checkRisk, declareHazardZone, getAdminFloodOverlay, getAdminFloodPredictions, getAdminHazardZones, getFloodOverlay, getHazardZone, resolveHazardZone } from './floodIntel'

describe('flood intelligence API', () => {
  it('asks for the overlay by the viewport rectangle, in the west,south,east,north order the route takes', async () => {
    let bbox: string | null = null
    server.use(http.get('*/map/flood-overlay', ({ request }) => ((bbox = new URL(request.url).searchParams.get('bbox')), HttpResponse.json([]))))
    await getFloodOverlay('67,24,68.5,25.1')
    expect(bbox).toBe('67,24,68.5,25.1')
  })

  it('reads a hazard zone by id', async () => {
    server.use(http.get('*/hazard-zones/:id', ({ params }) => HttpResponse.json({ id: params.id, risk_level: 'high' })))
    expect(await getHazardZone('abc')).toMatchObject({ id: 'abc', risk_level: 'high' })
  })

  it('POSTs the coordinates as numbers in the body — never in the URL', async () => {
    let seen: { url: string; body: unknown } | null = null
    server.use(
      http.post('*/hazard-zones/risk-check', async ({ request }) => {
        seen = { url: request.url, body: await request.json() }
        return HttpResponse.json({ inside_hazard_zone: false, distance_meters: 0 })
      }),
    )
    await checkRisk(24.86, 67.0)
    expect(seen).toMatchObject({ body: { lat: 24.86, lng: 67 } })
    expect(seen!.url).not.toContain('24.86')
  })

  it('refuses to send a risk check without real coordinates, because the server would silently read a missing one as 0', async () => {
    let called = false
    server.use(http.post('*/hazard-zones/risk-check', () => ((called = true), HttpResponse.json({}))))
    await expect(checkRisk(NaN, 67)).rejects.toThrow(/real coordinates/)
    await expect(checkRisk(24, Infinity)).rejects.toThrow()
    expect(called).toBe(false)
  })
})

describe('facilities API', () => {
  it('scopes every read by region_id — the routes have no bbox and no nationwide query', async () => {
    const seen: string[] = []
    server.use(
      http.get('*/shelters', ({ request }) => (seen.push(`shelters:${new URL(request.url).searchParams.get('region_id')}`), HttpResponse.json([]))),
      http.get('*/infrastructure', ({ request }) => (seen.push(`infrastructure:${new URL(request.url).searchParams.get('region_id')}`), HttpResponse.json([]))),
      http.get('*/essential-locations', ({ request }) => (seen.push(`essential:${new URL(request.url).searchParams.get('region_id')}`), HttpResponse.json([]))),
    )
    await Promise.all([getShelters('r1'), getInfrastructure('r1'), getEssentialLocations('r1')])
    expect(seen.sort()).toEqual(['essential:r1', 'infrastructure:r1', 'shelters:r1'])
  })
})

describe('shelter by id', () => {
  it('reads one shelter from /shelters/{id}, and keys the cache by id', async () => {
    let path = ''
    server.use(http.get('*/shelters/:id', ({ request }) => ((path = new URL(request.url).pathname), HttpResponse.json({ id: 'abc', name: 'GBHS Johi', capacity_total: 400 }))))
    expect(await getShelter('abc')).toMatchObject({ id: 'abc', name: 'GBHS Johi' })
    expect(path).toMatch(/\/shelters\/abc$/)
    expect(shelterQueryKey('abc')).toEqual(['shelter', 'abc'])
  })

  it('never lets an id change the path it is sent to', async () => {
    let path = ''
    server.use(http.get('*/shelters/*', ({ request }) => ((path = new URL(request.url).pathname), HttpResponse.json({}))))
    await getShelter('a/../../admin/accounts')
    expect(path).not.toMatch(/\/admin\/accounts$/)
    expect(path).toContain('a%2F..%2F..%2Fadmin%2Faccounts')
  })

  it('rejects with the server’s status for an unknown or malformed id', async () => {
    server.use(http.get('*/shelters/:id', () => HttpResponse.json({ error: 'shelter not found' }, { status: 404 })))
    await expect(getShelter('missing')).rejects.toMatchObject({ response: { status: 404 } })
  })
})

describe('reporting an essential location open or closed', () => {
  it('POSTs the status in the body to the place’s status-reports route', async () => {
    let seen: { path: string; body: unknown } | null = null
    server.use(
      http.post('*/essential-locations/:id/status-reports', async ({ request }) => {
        seen = { path: new URL(request.url).pathname, body: await request.json() }
        return HttpResponse.json({ id: 'r1', essential_location_id: 'e1', status: 'closed', created_at: '2026-09-24T10:00:00Z' }, { status: 201 })
      }),
    )
    expect(await reportEssentialLocationStatus('e1', 'closed')).toMatchObject({ id: 'r1', status: 'closed' })
    expect(seen).toEqual({ path: expect.stringMatching(/\/essential-locations\/e1\/status-reports$/), body: { status: 'closed' } })
  })

  it('rejects with the server’s status when the place is gone or the status is refused', async () => {
    server.use(http.post('*/essential-locations/:id/status-reports', () => HttpResponse.json({ error: 'essential location not found' }, { status: 404 })))
    await expect(reportEssentialLocationStatus('gone', 'open')).rejects.toMatchObject({ response: { status: 404 } })
  })
})

describe('admin hazard zones', () => {
  it('reads a page of zones with the filters as query parameters, and returns the envelope', async () => {
    let query: Record<string, string> = {}
    server.use(http.get('*/admin/hazard-zones', ({ request }) => ((query = Object.fromEntries(new URL(request.url).searchParams)), HttpResponse.json({ zones: [{ id: 'z1' }], total: 3983, limit: 20, offset: 40 }))))
    const page = await getAdminHazardZones({ status: 'resolved', from: '2026-09-24T00:00:00.000Z', to: '2026-09-25T00:00:00.000Z', limit: 20, offset: 40 })
    expect(page).toMatchObject({ total: 3983, limit: 20, offset: 40, zones: [{ id: 'z1' }] })
    expect(query).toEqual({ status: 'resolved', from: '2026-09-24T00:00:00.000Z', to: '2026-09-25T00:00:00.000Z', limit: '20', offset: '40' })
  })

  it('leaves out a filter that is not set — no status means every zone', async () => {
    let query: Record<string, string> = {}
    server.use(http.get('*/admin/hazard-zones', ({ request }) => ((query = Object.fromEntries(new URL(request.url).searchParams)), HttpResponse.json({ zones: [], total: 0, limit: 20, offset: 0 }))))
    await getAdminHazardZones({ limit: 20, offset: 0 })
    expect(query).toEqual({ limit: '20', offset: '0' })
  })

  it('reads a page of predictions', async () => {
    server.use(http.get('*/admin/flood-predictions', () => HttpResponse.json({ predictions: [{ id: 'p1' }], total: 1, limit: 20, offset: 0 })))
    expect(await getAdminFloodPredictions({ limit: 20, offset: 0 })).toMatchObject({ total: 1, predictions: [{ id: 'p1' }] })
  })

  it('asks the admin overlay for a box, sending min_confidence only above zero', async () => {
    const seen: Array<Record<string, string>> = []
    server.use(http.get('*/admin/map/flood-overlay', ({ request }) => (seen.push(Object.fromEntries(new URL(request.url).searchParams)), HttpResponse.json([]))))
    await getAdminFloodOverlay('67,24,70,28', 0)
    await getAdminFloodOverlay('67,24,70,28', 0.34)
    expect(seen).toEqual([{ bbox: '67,24,70,28' }, { bbox: '67,24,70,28', min_confidence: '0.34' }])
  })

  it('declares a zone with only a boundary and a level in the body — never a source', async () => {
    let body: unknown = null
    server.use(http.post('*/admin/hazard-zones', async ({ request }) => ((body = await request.json()), HttpResponse.json({ id: 'z1', source: 'manual_admin' }, { status: 201 }))))
    const boundary = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    expect(await declareHazardZone({ boundary, risk_level: 'high' })).toMatchObject({ id: 'z1' })
    expect(body).toEqual({ boundary, risk_level: 'high' })
  })

  it('resolves a zone with a PATCH and no body, the id encoded', async () => {
    let seen: { method: string; path: string; text: string } | null = null
    server.use(http.patch('*/admin/hazard-zones/*', async ({ request }) => ((seen = { method: request.method, path: new URL(request.url).pathname, text: await request.text() }), HttpResponse.json({ id: 'z1', status: 'resolved' }))))
    await resolveHazardZone('a/b')
    expect(seen).toMatchObject({ method: 'PATCH', text: '' })
    expect(seen!.path).toMatch(/\/admin\/hazard-zones\/a%2Fb\/resolve$/)
  })

  it('rejects with the status when a zone is already resolved', async () => {
    server.use(http.patch('*/admin/hazard-zones/:id/resolve', () => HttpResponse.json({ error: 'hazard zone is not active' }, { status: 400 })))
    await expect(resolveHazardZone('z1')).rejects.toMatchObject({ response: { status: 400 } })
  })
})
