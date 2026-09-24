import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  promoteToPlatformAdmin,
  readHazardZone,
  readZonesDeclaredBy,
  resolveZoneInDb,
  seedHazardZone,
  seedRegion,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for the admin's Hazard Zones & Predictions (/admin/hazard-zones and /:id), against the real backend with no stubbed
 * responses. The world is `E2E …` rows in Postgres in a spot of its own (south of the flood pipeline's grid, at a random place each run, so
 * only these zones are on the map there): a model zone with a confidence, a milder model zone inside it that citizens never see, three
 * declared zones and a resolved one. Every claim about what was saved is read back from the `hazard_zones` row, including who declared it.
 */
const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`

// A random 0.6° square at 16–21°N, 70–78°E — clear of the real regions and of the pipeline's grid (which starts at 23.86°N).
const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
const ORIGIN: [number, number] = [70 + jitter(8), 16 + jitter(5)]
const at = (dx: number, dy: number): [number, number] => [Number((ORIGIN[0] + dx).toFixed(4)), Number((ORIGIN[1] + dy).toFixed(4))]
const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]
const modelVersion = `e2e-${tag}`
const ids = { region: '', high: '', low: '', medium: '', resolved: '', doubled: '', detail: '' }
const short = (id: string) => id.slice(0, 8)

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function register(api: APIRequestContext, label: string) {
  const email = `e2e-hz-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await api.post(`${API}/auth/register`, { data: { email, password }, timeout: 30_000 })
  expect(res.ok()).toBeTruthy()
  return email
}

async function logIn(page: Page, email: string, landing: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(landing)
}

/** A platform admin, signed in on the admin dashboard. */
async function signInAdmin(page: Page, label: string) {
  const email = await register(page.request, label)
  verifyAndOnboardAccount(email, 'E2E Hazard Admin')
  promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

const row = (page: Page, id: string) => page.locator('li', { has: page.locator(`a[href="/admin/hazard-zones/${id}"]`) })
const showOnMap = (page: Page, id: string) => page.getByRole('button', { name: new RegExp(`^Show .* ${short(id)} on the map$`) })
const resolveButton = (page: Page, id: string) => page.getByRole('button', { name: new RegExp(`^Resolve .* ${short(id)}$`) })
const zonesPath = '/admin/hazard-zones?size=100'

test.beforeAll(() => {
  test.setTimeout(120_000)
  ids.region = seedRegion(`E2E Hazard Prov ${tag}`, 'province', undefined, squareRing(ORIGIN[0], ORIGIN[1], 0.6))
  ids.high = seedHazardZone(ids.region, { ring: rect(0.1, 0.1, 0.4, 0.4), risk: 'high', confidence: 0.87, modelVersion })
  ids.low = seedHazardZone(ids.region, { ring: rect(0.15, 0.15, 0.35, 0.35), risk: 'low', confidence: 0.2, modelVersion })
  ids.medium = seedHazardZone(ids.region, { ring: rect(0.2, 0.2, 0.45, 0.45), risk: 'medium' })
  ids.resolved = seedHazardZone(ids.region, { ring: rect(0, 0, 0.08, 0.08), risk: 'low', status: 'resolved' })
  ids.doubled = seedHazardZone(ids.region, { ring: rect(0.25, 0.05, 0.4, 0.14), risk: 'medium' })
  ids.detail = seedHazardZone(ids.region, { ring: rect(0.05, 0.3, 0.15, 0.4), risk: 'high' })
})

test.describe('Admin hazard zones — real backend', () => {
  test('lists the zones by status with their source and level, asking the real table for a page — and Show on map draws the zone', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (req) => {
      if (req.url().startsWith(`${API}/admin/hazard-zones?`)) asked.push(req.url().slice(API.length))
    })
    await signInAdmin(page, 'list')
    await page.goto(zonesPath)
    await expect(row(page, ids.high)).toBeVisible({ timeout: 20_000 })
    expect(asked[0]).toBe('/admin/hazard-zones?status=active&limit=100&offset=0')

    await expect(row(page, ids.high)).toContainText('High-risk flood zone')
    await expect(row(page, ids.high)).toContainText('Model forecast')
    await expect(row(page, ids.high)).toContainText('Active')
    await expect(row(page, ids.medium)).toContainText('Medium-risk hazard zone')
    await expect(row(page, ids.medium)).toContainText('Declared by an admin')
    await expect(row(page, ids.resolved)).toHaveCount(0)

    await page.getByRole('button', { name: 'Resolved' }).click()
    await expect(row(page, ids.resolved)).toBeVisible({ timeout: 20_000 })
    await expect(row(page, ids.resolved)).toContainText('Resolved')
    await expect(row(page, ids.resolved)).toContainText(/resolved .* ago/)
    await expect(resolveButton(page, ids.resolved)).toHaveCount(0)
    await expect(row(page, ids.high)).toHaveCount(0)
    await page.getByRole('button', { name: 'Active' }).click()

    // The zones are far from where the map opens (the country); pointing it at one draws it.
    await expect(page.locator('path.hazard-zone.hazard-high')).toHaveCount(0)
    await showOnMap(page, ids.high).click()
    await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })
    await expect(row(page, ids.high)).toHaveAttribute('aria-current', 'true')
  })

  test('the confidence slider asks the real overlay for min_confidence: the low model zone goes, the declared zone stays', async ({ page }) => {
    const overlay: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/admin/map/flood-overlay')) overlay.push(req.url())
    })
    await signInAdmin(page, 'slider')
    await page.goto(zonesPath)
    await showOnMap(page, ids.high).click()
    // The admin overlay shows everything, including the 20% model zone that the citizen map never returns.
    const zones = (level: string) => page.locator(`path.hazard-zone.hazard-${level}`)
    await expect(zones('low')).toHaveCount(1, { timeout: 20_000 })
    await expect(zones('high').first()).toBeVisible()
    await expect(zones('medium').first()).toBeVisible()
    const [highBefore, mediumBefore] = [await zones('high').count(), await zones('medium').count()]
    expect(overlay.some((url) => !url.includes('min_confidence'))).toBe(true)

    await page.getByRole('slider').fill('0.5')
    await expect(page.getByText('50%', { exact: true })).toBeVisible()
    await expect(zones('low')).toHaveCount(0, { timeout: 20_000 })
    expect(overlay.some((url) => url.includes('min_confidence=0.5'))).toBe(true)
    // Declared zones have no confidence, so they always stay; the 87% model zone is above the line.
    await expect(zones('medium')).toHaveCount(mediumBefore)
    await expect(zones('high')).toHaveCount(highBefore)

    await page.getByRole('slider').fill('0')
    await expect(zones('low')).toHaveCount(1, { timeout: 20_000 })
  })

  test('resolving asks first, then really resolves: the row leaves Active, the database says so, and the citizen map no longer holds it', async ({ page, request }) => {
    await signInAdmin(page, 'resolve')
    await page.goto(zonesPath)
    await expect(row(page, ids.medium)).toBeVisible({ timeout: 20_000 })
    const box = `${ORIGIN[0]},${ORIGIN[1]},${ORIGIN[0] + 0.6},${ORIGIN[1] + 0.6}`
    const citizenIds = async () => ((await (await request.get(`${API}/map/flood-overlay?bbox=${box}`)).json()) as Array<{ hazard_zone_id: string }>).map((entry) => entry.hazard_zone_id)
    expect(await citizenIds()).toContain(ids.medium)

    await resolveButton(page, ids.medium).click()
    const dialog = page.getByRole('dialog', { name: 'Resolve this hazard zone?' })
    await expect(dialog).toContainText('no way to reactivate')
    expect(readHazardZone(ids.medium).status).toBe('active')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(readHazardZone(ids.medium).status).toBe('active')

    await resolveButton(page, ids.medium).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Resolve zone' }).click()
    await expect(page.getByText(/is resolved and off the citizen map/)).toBeVisible()
    await expect(row(page, ids.medium)).toHaveCount(0)
    const stored = readHazardZone(ids.medium)
    expect(stored.status).toBe('resolved')
    expect(stored.resolvedAt).not.toBeNull()
    expect(await citizenIds()).not.toContain(ids.medium)
    expect(await citizenIds()).toContain(ids.high)

    await page.getByRole('button', { name: 'Resolved' }).click()
    await expect(row(page, ids.medium)).toBeVisible({ timeout: 20_000 })
  })

  test('a zone someone else resolved first gets the real 400 — reported, not repeated — and the list catches up', async ({ page }) => {
    await signInAdmin(page, 'double')
    await page.goto(zonesPath)
    await expect(row(page, ids.doubled)).toBeVisible({ timeout: 20_000 })
    resolveZoneInDb(ids.doubled) // behind the open page
    await resolveButton(page, ids.doubled).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Resolve zone' }).click()
    await expect(page.getByText(/hazard zone is not active. The list has been refreshed./)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(row(page, ids.doubled)).toHaveCount(0)
  })

  test('declaring a zone files it under the admin’s own account, active at once, and citizens see it', async ({ page, request }) => {
    const posts: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url() === `${API}/admin/hazard-zones`) posts.push(req.url())
    })
    const email = await signInAdmin(page, 'declare')
    await page.goto(zonesPath)
    await expect(row(page, ids.high)).toBeVisible({ timeout: 20_000 })
    await showOnMap(page, ids.high).click()
    // The map's view is only known once it has stopped moving; the 20% model zone is on the overlay (not pinned), so it appears when the map has arrived and loaded.
    await expect(page.locator('path.hazard-zone.hazard-low')).toHaveCount(1, { timeout: 20_000 })

    await page.getByRole('button', { name: 'Declare hazard zone' }).click()
    const dialog = page.getByRole('dialog', { name: 'Declare a hazard zone' })
    // Nothing valid yet: every problem is named and nothing is sent.
    await dialog.getByRole('button', { name: 'Declare zone' }).click()
    await expect(dialog.getByText('Choose a risk level.')).toBeVisible()
    await dialog.getByLabel('Boundary (GeoJSON Polygon)').fill('{ not json')
    await expect(dialog.getByText(/isn't valid JSON/)).toBeVisible()
    await dialog.getByLabel('Boundary (GeoJSON Polygon)').fill(JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] }))
    await expect(dialog.getByText(/crosses or touches itself/)).toBeVisible()
    await dialog.getByLabel('Risk level').selectOption('high')
    await dialog.getByRole('button', { name: 'Declare zone' }).click()
    expect(posts).toHaveLength(0)
    expect(readZonesDeclaredBy(email)).toEqual([])

    // A good one, from the map's own view.
    await dialog.getByRole('button', { name: "Use the map's current view" }).click()
    await expect(dialog.getByRole('img', { name: "The zone's outline" })).toBeVisible()
    await dialog.getByLabel('Risk level').selectOption('medium')
    await dialog.getByRole('button', { name: 'Declare zone' }).click()
    await expect(page.getByText(/Hazard zone declared \(#/)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(posts).toHaveLength(1)

    const declared = readZonesDeclaredBy(email)
    expect(declared).toHaveLength(1)
    const stored = readHazardZone(declared[0])
    expect(stored).toMatchObject({ source: 'manual_admin', risk: 'medium', status: 'active', createdBy: email, confidence: null })
    expect(stored.vertices).toBe(5)
    await expect(row(page, declared[0])).toBeVisible({ timeout: 20_000 })
    await expect(row(page, declared[0])).toContainText('Declared by an admin')
    await expect(page.locator('path.hazard-zone.hazard-medium').first()).toBeVisible({ timeout: 20_000 })

    // Citizens are not shown model zones under 34% — but a declared zone always shows.
    const citizen = (await (await request.get(`${API}/map/flood-overlay?bbox=${ORIGIN[0]},${ORIGIN[1]},${ORIGIN[0] + 0.6},${ORIGIN[1] + 0.6}`)).json()) as Array<{ hazard_zone_id: string }>
    expect(citizen.map((entry) => entry.hazard_zone_id)).toContain(declared[0])
    expect(citizen.map((entry) => entry.hazard_zone_id)).not.toContain(ids.low)
  })

  test('Predictions shows the model’s real output, newest first, with its confidence — and the date filter narrows it', async ({ page }) => {
    await signInAdmin(page, 'pred')
    await page.goto('/admin/hazard-zones?view=predictions&size=100')
    const list = page.getByRole('list', { name: 'Flood predictions' })
    const ours = list.getByRole('listitem').filter({ hasText: modelVersion })
    await expect(ours.first()).toBeVisible({ timeout: 20_000 })
    await expect(ours.filter({ hasText: '87%' })).toHaveCount(1)
    await expect(ours.filter({ hasText: '87%' })).toContainText('High risk')
    await expect(ours.filter({ hasText: '20%' })).toContainText('Low risk')
    expect(readHazardZone(ids.high).confidence).toBeCloseTo(0.87, 2)
    await expect(page.locator('.leaflet-container')).toHaveCount(0)

    const tomorrow = new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10)
    await page.getByLabel('Generated from').fill(tomorrow)
    await expect(page.getByText('No predictions in those dates.')).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Generated to').fill('2000-01-01')
    await expect(page.getByText('The start date is after the end date, so nothing can match.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear dates' }).click()
    await expect(ours.first()).toBeVisible({ timeout: 20_000 })
  })

  test('a zone’s page shows what the database holds, resolves it for real, and an unknown or malformed id says "not found"', async ({ page }) => {
    await signInAdmin(page, 'detail')
    await page.goto(zonesPath)
    await row(page, ids.high).getByRole('link', { name: 'High-risk flood zone' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/hazard-zones/${ids.high}$`))
    const stored = readHazardZone(ids.high)
    await expect(page.getByRole('heading', { level: 1, name: 'High-risk flood zone' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Zone', exact: true })).toContainText('Model forecast')
    await expect(page.getByRole('region', { name: 'Zone', exact: true })).toContainText(ids.high)
    await expect(page.getByRole('region', { name: 'Prediction' }).getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute('aria-valuenow', String(Math.round((stored.confidence ?? 0) * 100)))
    await expect(page.getByRole('region', { name: 'Prediction' })).toContainText(stored.modelVersion ?? 'missing')
    await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })

    // Resolve from here — a different zone, so the one above stays for the other tests.
    await page.goto(`/admin/hazard-zones/${ids.detail}`)
    await expect(page.getByRole('heading', { level: 1, name: 'High-risk hazard zone' })).toBeVisible()
    await page.getByRole('button', { name: 'Resolve zone' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Resolve zone' }).click()
    await expect(page.getByText(/Resolved. High-risk hazard zone/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resolve zone' })).toHaveCount(0)
    expect(readHazardZone(ids.detail).status).toBe('resolved')

    await page.goto('/admin/hazard-zones/3fa85f64-5717-4562-b3fc-2c963f66afa6')
    await expect(page.getByRole('heading', { name: 'Hazard zone not found' })).toBeVisible()
    await page.goto('/admin/hazard-zones/not-an-id')
    await expect(page.getByRole('heading', { name: 'Hazard zone not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to hazard zones' }).click()
    await expect(page).toHaveURL(/\/admin\/hazard-zones$/)
  })

  test('a citizen is turned away from the page, and the real API refuses them too', async ({ page }) => {
    const email = await register(page.request, 'citizen')
    verifyAndOnboardAccount(email, 'E2E Hazard Citizen')
    await logIn(page, email, /\/app\/home$/)
    await page.goto('/admin/hazard-zones')
    await expect(page).toHaveURL(/\/app\/home$/)
    const token = await page.evaluate(async ({ api, email: e, pw }) => {
      const res = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }) })
      return ((await res.json()) as { access_token: string }).access_token
    }, { api: API, email, pw: password })
    const refused = await page.request.get(`${API}/admin/hazard-zones`, { headers: { Authorization: `Bearer ${token}` } })
    expect(refused.status()).toBe(403)
    const declared = await page.request.post(`${API}/admin/hazard-zones`, { headers: { Authorization: `Bearer ${token}` }, data: { boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, risk_level: 'high' } })
    expect(declared.status()).toBe(403)
  })
})
