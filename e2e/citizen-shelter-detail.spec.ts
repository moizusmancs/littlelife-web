import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { readShelter, seedHazardZone, seedHomeRegion, seedRegion, seedShelter, squareRing, verifyAndOnboardAccount } from './helpers/seed'

/**
 * Real end to end for the citizen's Shelter Detail (/app/map/shelters/:id), against the real backend with no stubbed responses. The world
 * is `E2E …` rows in Postgres: a province with an open, certified shelter that sits inside a forecast flood zone, and a closed,
 * uncertified-pending relief centre that is over capacity. Every claim about what the page shows is compared with the stored row.
 */
const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`

// A random 0.6° square at 16–21°N, 70–78°E each run: clear of the real regions and south of the flood pipeline's grid, so the only zone near these
// shelters is ours, and an earlier run's rows can never join this run's world.
const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
const ORIGIN: [number, number] = [70 + jitter(8), 16 + jitter(5)]
const at = (dx: number, dy: number): [number, number] => [Number((ORIGIN[0] + dx).toFixed(4)), Number((ORIGIN[1] + dy).toFixed(4))]
const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]
const names = { province: `E2E Shelter Prov ${tag}`, open: `E2E Shelter Open ${tag}`, closed: `E2E Shelter Closed ${tag}` }
const ids = { province: '', open: '', closed: '' }

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function register(api: APIRequestContext, label: string) {
  const email = `e2e-shelter-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await api.post(`${API}/auth/register`, { data: { email, password }, timeout: 30_000 })
  expect(res.ok()).toBeTruthy()
  return email
}

/** A verified, onboarded citizen with the seeded province as home region, signed in and on /app/home. */
async function signIn(page: Page, label: string) {
  const email = await register(page.request, label)
  verifyAndOnboardAccount(email, 'E2E Shelter Citizen')
  seedHomeRegion(email, ids.province)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
}

const haversineKm = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

test.beforeAll(() => {
  test.setTimeout(120_000)
  ids.province = seedRegion(names.province, 'province', undefined, squareRing(ORIGIN[0], ORIGIN[1], 0.6))
  const [openLng, openLat] = at(0.2, 0.2)
  const [closedLng, closedLat] = at(0.45, 0.4)
  ids.open = seedShelter(ids.province, { name: names.open, lng: openLng, lat: openLat, capacityTotal: 400, capacityCurrent: 265 })
  ids.closed = seedShelter(ids.province, {
    name: names.closed,
    lng: closedLng,
    lat: closedLat,
    capacityTotal: 300,
    capacityCurrent: 330,
    status: 'closed',
    type: 'relief_center',
    certification: 'pending',
  })
  seedHazardZone(ids.province, { ring: rect(0.05, 0.05, 0.35, 0.35), risk: 'high', confidence: 0.87 })
})

test.describe('Shelter Detail — real backend', () => {
  test('opens from the map card\'s View Details and shows what the database holds; Back returns to the map', async ({ page }) => {
    await signIn(page, 'flow')
    await page.goto('/app/map')
    await page.getByRole('button', { name: `${names.open}, Shelter, Open` }).click()
    await page.getByRole('region', { name: `${names.open} details` }).getByRole('link', { name: 'View Details' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/map/shelters/${ids.open}$`))

    const stored = readShelter(ids.open)
    await expect(page.getByRole('heading', { level: 1, name: stored.name })).toBeVisible()
    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Certified', { exact: true }).first()).toBeVisible()
    const capacity = page.getByRole('region', { name: 'Capacity' })
    await expect(capacity).toContainText(`Capacity ${stored.capacityCurrent} / ${stored.capacityTotal}`)
    await expect(capacity.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', String(Math.round((stored.capacityCurrent / stored.capacityTotal) * 100)))
    await expect(capacity).toContainText(/Updated .* ago/)
    const details = page.getByRole('region', { name: 'Details' })
    await expect(details).toContainText('Shelter')
    await expect(details).toContainText('Certified')
    await expect(page.getByRole('link', { name: /Navigate Here/ })).toHaveAttribute('href', `/app/navigate?destination_shelter_id=${ids.open}`)
    await expect(page.getByText(`${stored.lat.toFixed(4)}° N, ${stored.lng.toFixed(4)}° E`)).toBeVisible()

    await page.getByRole('link', { name: 'Back to map' }).click()
    await expect(page).toHaveURL(/\/app\/map$/)
    await expect(page.getByRole('button', { name: `${names.open}, Shelter, Open` })).toBeVisible({ timeout: 20_000 })
  })

  test('a closed, pending, over-full relief centre says exactly that', async ({ page }) => {
    await signIn(page, 'closed')
    await page.goto(`/app/map/shelters/${ids.closed}`)
    await expect(page.getByRole('heading', { level: 1, name: names.closed })).toBeVisible()
    await expect(page.getByText('Relief center', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Pending certification').first()).toBeVisible()
    const capacity = page.getByRole('region', { name: 'Capacity' })
    await expect(capacity).toContainText('Over capacity — 30 more than it holds.')
    await expect(capacity).toContainText('This shelter is closed right now.')
    await expect(capacity.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    await expect(page.getByRole('link', { name: /Navigate Here/ })).toBeVisible()
  })

  test('the embedded map shows the shelter and the real flood zone around it, and the page scrolls past the map instead of zooming it', async ({ page }) => {
    const overlay: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/map/flood-overlay')) overlay.push(req.url())
    })
    await signIn(page, 'map')
    await page.goto(`/app/map/shelters/${ids.open}`)
    const location = page.getByRole('region', { name: 'Location' })
    await expect(location.getByRole('button', { name: `${names.open}, Shelter, Open` })).toBeVisible()
    await expect(location.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })
    expect(overlay.some((url) => /bbox=[\d.,-]+/.test(url))).toBe(true)

    const box = await location.locator('.leaflet-container').boundingBox()
    expect(box).not.toBeNull()
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
  })

  test('an unknown shelter and a malformed id both say "not found" — the real 404 and 400 — and lead back to the map', async ({ page }) => {
    await signIn(page, 'missing')
    await page.goto('/app/map/shelters/3fa85f64-5717-4562-b3fc-2c963f66afa6')
    await expect(page.getByRole('heading', { name: 'Shelter not found' })).toBeVisible()
    await page.goto('/app/map/shelters/not-a-real-id')
    await expect(page.getByRole('heading', { name: 'Shelter not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to map' }).click()
    await expect(page).toHaveURL(/\/app\/map$/)
  })
})

test.describe('Shelter Detail — distance from the visitor, real backend', () => {
  const me: [number, number] = [at(0.1, 0.1)[1], at(0.1, 0.1)[0]] // [lat, lng]: about 15 km from the open shelter, 0.1° south-west of it
  test.use({ permissions: ['geolocation'], geolocation: { latitude: me[0], longitude: me[1] } })

  test('asks for the position only when pressed, then shows the real distance and the visitor on the map', async ({ page }) => {
    await signIn(page, 'distance')
    await page.goto(`/app/map/shelters/${ids.open}`)
    await expect(page.getByRole('heading', { level: 1, name: names.open })).toBeVisible()
    await expect(page.getByText(/km away|\bm away/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Show distance from me' }).click()
    const stored = readShelter(ids.open)
    const expected = haversineKm(me, [stored.lat, stored.lng])
    const shown = page.getByRole('region', { name: 'Location' }).getByText(/\d+(\.\d+)? km away/)
    await expect(shown).toBeVisible()
    const km = Number((await shown.innerText()).match(/([\d.]+) km/)![1])
    expect(km).toBeCloseTo(expected, 0)
    await expect(page.locator('.leaflet-marker-icon div[style*="box-shadow:0 0 0 8px"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show distance from me' })).toHaveCount(0)
  })
})
