import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import {
  MY_SHELTERS_QUERY_KEY,
  addEssentialLocation,
  addInfrastructure,
  essentialReportsQueryKey,
  getEssentialLocations,
  getEssentialReports,
  getInfrastructure,
  getMyShelters,
  getShelter,
  getShelters,
  registerShelter,
  reportEssentialLocationStatus,
  shelterQueryKey,
  updateInfrastructureStatus,
  updateShelter,
  updateShelterOccupancy,
} from './facilities'
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

describe('NGO shelter API', () => {
  it('reads the organisation\'s shelters from /ngo/shelters — no region, and the cache key is its own', async () => {
    let seen: { path: string; search: string } | null = null
    server.use(http.get('*/ngo/shelters', ({ request }) => ((seen = { path: new URL(request.url).pathname, search: new URL(request.url).search }), HttpResponse.json([{ id: 'a' }]))))
    expect(await getMyShelters()).toEqual([{ id: 'a' }])
    expect(seen).toEqual({ path: expect.stringMatching(/\/ngo\/shelters$/), search: '' })
    expect(MY_SHELTERS_QUERY_KEY).toEqual(['ngo', 'shelters'])
  })

  it('registers with the API\'s field names — capacity_total, a GeoJSON point — and never sends the managing organisation', async () => {
    let body: Record<string, unknown> = {}
    server.use(http.post('*/ngo/shelters', async ({ request }) => ((body = (await request.json()) as Record<string, unknown>), HttpResponse.json({ id: 'new' }, { status: 201 }))))
    await registerShelter({ name: 'Community Center', type: 'relief_center', location: { type: 'Point', coordinates: [67.1, 24.9] }, capacityTotal: 200 })
    expect(body).toEqual({ name: 'Community Center', type: 'relief_center', location: { type: 'Point', coordinates: [67.1, 24.9] }, capacity_total: 200 })
    expect(body).not.toHaveProperty('managed_by_ngo_id')
  })

  it('PATCHes occupancy with capacity_current, always a number in the body, and encodes the id into the path', async () => {
    let seen: { path: string; body: unknown } | null = null
    server.use(http.patch('*/shelters/:id/occupancy', async ({ request }) => ((seen = { path: new URL(request.url).pathname, body: await request.json() }), HttpResponse.json({ id: 'a' }))))
    await updateShelterOccupancy('a/b', 0)
    expect(seen).toEqual({ path: expect.stringMatching(/\/shelters\/a%2Fb\/occupancy$/), body: { capacity_current: 0 } })
  })

  it('PATCHes status and certification as a partial — only the fields it is given', async () => {
    const bodies: unknown[] = []
    server.use(http.patch('*/shelters/:id', async ({ request }) => (bodies.push(await request.json()), HttpResponse.json({ id: 'a' }))))
    await updateShelter('a', { status: 'closed' })
    await updateShelter('a', { certification_status: 'certified' })
    expect(bodies).toEqual([{ status: 'closed' }, { certification_status: 'certified' }])
  })

  it('surfaces the server\'s refusal as a rejected call with its status', async () => {
    server.use(http.patch('*/shelters/:id/occupancy', () => HttpResponse.json({ error: 'capacity_current must be between 0 and capacity_total' }, { status: 400 })))
    await expect(updateShelterOccupancy('a', 999)).rejects.toMatchObject({ response: { status: 400 } })
  })
})

describe('admin facility API', () => {
  const location = { type: 'Point' as const, coordinates: [67.05, 24.86] as [number, number] }

  it('adds infrastructure with a GeoJSON point and no status — the route always starts it safe', async () => {
    let body: Record<string, unknown> = {}
    server.use(http.post('*/admin/infrastructure', async ({ request }) => ((body = (await request.json()) as Record<string, unknown>), HttpResponse.json({ id: 'i1' }, { status: 201 }))))
    await addInfrastructure({ name: 'General Hospital', type: 'hospital', location })
    expect(body).toEqual({ name: 'General Hospital', type: 'hospital', location })
    expect(body).not.toHaveProperty('status')
  })

  it('sets an infrastructure status by PATCH with only the status, the id encoded into the path', async () => {
    let seen: { path: string; body: unknown } | null = null
    server.use(http.patch('*/admin/infrastructure/:id/status', async ({ request }) => ((seen = { path: new URL(request.url).pathname, body: await request.json() }), HttpResponse.json({ id: 'a' }))))
    await updateInfrastructureStatus('a/b', 'at_risk')
    expect(seen).toEqual({ path: expect.stringMatching(/\/admin\/infrastructure\/a%2Fb\/status$/), body: { status: 'at_risk' } })
  })

  it('adds an essential location with a point and no status — only a report ever gives it one', async () => {
    let body: Record<string, unknown> = {}
    server.use(http.post('*/admin/essential-locations', async ({ request }) => ((body = (await request.json()) as Record<string, unknown>), HttpResponse.json({ id: 'e1' }, { status: 201 }))))
    await addEssentialLocation({ name: 'Corner Pharmacy', type: 'pharmacy', location })
    expect(body).toEqual({ name: 'Corner Pharmacy', type: 'pharmacy', location })
  })

  it("reads a place's report log from its own path, keyed by id", async () => {
    let path = ''
    server.use(http.get('*/essential-locations/:id/status-reports', ({ request }) => ((path = new URL(request.url).pathname), HttpResponse.json([{ id: 'r1', status: 'open', created_at: '2026-09-25T00:00:00Z' }]))))
    expect(await getEssentialReports('abc')).toEqual([{ id: 'r1', status: 'open', created_at: '2026-09-25T00:00:00Z' }])
    expect(path).toMatch(/\/essential-locations\/abc\/status-reports$/)
    expect(essentialReportsQueryKey('abc')).toEqual(['essential-reports', 'abc'])
  })

  it('surfaces a refusal as a rejected call with its status', async () => {
    server.use(http.post('*/admin/infrastructure', () => HttpResponse.json({ error: 'insufficient permissions' }, { status: 403 })))
    await expect(addInfrastructure({ name: 'X', type: 'bridge', location })).rejects.toMatchObject({ response: { status: 403 } })
  })
})
