import { test, expect, type APIRequestContext, type Page, type Request } from '@playwright/test'
import {
  seedEssentialLocation,
  seedHazardZone,
  seedHomeRegion,
  seedInfrastructure,
  seedRegion,
  seedShelter,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for the citizen map (/app/map) — the flood overlay, the region-scoped place layers, the selection cards, search,
 * the legend and "Go to my location" with the server's risk check — against the real backend, with no stubbed responses. The world
 * is `E2E …` rows in Postgres (a province with two shelters, a hospital, two essentials and two hazard zones — one a model forecast
 * with a confidence, one declared by hand without), and every citizen has that province as their home region so the map opens on it.
 * Places are found by their unique `E2E Map … <tag>` names, so anything else in the database (real regions, earlier runs) can be on the map too.
 */
const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`

// A random 0.6° square at 16–21°N, 70–78°E each run — clear of the real regions and south of the flood pipeline's grid (which starts at
// 23.86°N and, being real data, covers the rest of the country with zones of every risk level), so what is drawn here is only ours, and an
// earlier run's rows (which stay until the cleanup) can never join this run's world.
const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
const ORIGIN: [number, number] = [70 + jitter(8), 16 + jitter(5)]
const at = (dx: number, dy: number): [number, number] => [Number((ORIGIN[0] + dx).toFixed(4)), Number((ORIGIN[1] + dy).toFixed(4))]
const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]
const names = {
  province: `E2E Map Prov ${tag}`,
  alpha: `E2E Map Shelter Alpha ${tag}`,
  full: `E2E Map Shelter Full ${tag}`,
  hospital: `E2E Map Hospital ${tag}`,
  pharmacy: `E2E Map Pharmacy ${tag}`,
  atm: `E2E Map ATM ${tag}`,
}
const ids = { province: '', alpha: '', full: '', highZone: '', manualZone: '' }

// One world, seeded once (`beforeAll` runs per worker, and a second copy would double every marker) — so one worker runs the file.
test.describe.configure({ mode: 'serial', timeout: 90_000 })

/** `page.goto` that re-asks when the dev server doesn't answer the document in time. On this 8 GB machine the idle Vite process gets
 *  paged out and its first request afterwards can stall for tens of seconds (it answers at once when asked again). */
async function visit(page: Page, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(path, { timeout: 12_000 })
      return
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
}

/** Registers a fresh account. A request that gets no answer is re-sent under a *new* email, so a registration that did go through
 *  but whose reply was lost can't turn the retry into a conflict. */
async function register(api: APIRequestContext, label: string) {
  for (let attempt = 1; ; attempt++) {
    const email = `e2e-map-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
    try {
      const res = await api.post(`${API}/auth/register`, { data: { email, password }, timeout: 15_000 })
      expect(res.ok()).toBeTruthy()
      return email
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
}

/** A verified, onboarded citizen whose home region is the seeded province, signed in and standing on the map. */
async function openMap(page: Page, label: string) {
  const email = await register(page.request, label)
  verifyAndOnboardAccount(email, 'E2E Map Citizen')
  seedHomeRegion(email, ids.province)
  await visit(page, '/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
  await visit(page, '/app/map')
  await expect(page.getByRole('button', { name: `${names.alpha}, Shelter, Open` })).toBeVisible({ timeout: 20_000 })
  // Markers are in the page wherever the map is looking, so the drawn forecast zone is what shows it has settled on the home region and loaded the overlay.
  await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })
  return email
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000) // a dozen `docker exec psql` seeds, each guarded by a region lookup, plus a real registration
  const reporterEmail = await register(request, 'reporter')

  ids.province = seedRegion(names.province, 'province', undefined, squareRing(ORIGIN[0], ORIGIN[1], 0.6))
  const [alphaLng, alphaLat] = at(0.2, 0.2)
  const [fullLng, fullLat] = at(0.45, 0.4)
  const [hospitalLng, hospitalLat] = at(0.3, 0.3)
  const [pharmacyLng, pharmacyLat] = at(0.25, 0.45)
  const [atmLng, atmLat] = at(0.5, 0.15)
  ids.alpha = seedShelter(ids.province, { name: names.alpha, lng: alphaLng, lat: alphaLat, capacityTotal: 400, capacityCurrent: 210 })
  ids.full = seedShelter(ids.province, { name: names.full, lng: fullLng, lat: fullLat, capacityTotal: 300, capacityCurrent: 330, certification: 'pending' })
  seedInfrastructure(ids.province, { name: names.hospital, lng: hospitalLng, lat: hospitalLat, type: 'hospital', status: 'at_risk' })
  seedEssentialLocation(ids.province, { name: names.pharmacy, lng: pharmacyLng, lat: pharmacyLat, type: 'pharmacy', report: { by: reporterEmail, status: 'open' } })
  seedEssentialLocation(ids.province, { name: names.atm, lng: atmLng, lat: atmLat, type: 'atm' })
  ids.highZone = seedHazardZone(ids.province, { ring: rect(0.05, 0.05, 0.35, 0.35), risk: 'high', confidence: 0.87 })
  // The flood pipeline leaves every old run's zones active, so one cell arrives many times over; three identical copies (and a milder one) stand in for that.
  const manualRing = rect(0.4, 0.45, 0.55, 0.58)
  ids.manualZone = seedHazardZone(ids.province, { ring: manualRing, risk: 'medium' })
  seedHazardZone(ids.province, { ring: manualRing, risk: 'medium' })
  seedHazardZone(ids.province, { ring: manualRing, risk: 'medium' })
  seedHazardZone(ids.province, { ring: manualRing, risk: 'low' })
})

test.describe('Citizen map — real backend', () => {
  test('opens on the home region, draws the seeded zones and shelters, and only asks for the layers that are switched on', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (req: Request) => {
      if (req.url().startsWith(API)) requested.push(req.url().slice(API.length))
    })
    await openMap(page, 'layers')

    // Both zones are drawn, each carrying its risk in its class, and the shelter markers are real focusable buttons.
    await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible()
    await expect(page.locator('path.hazard-zone.hazard-medium').first()).toBeVisible()
    await expect(page.getByRole('button', { name: `${names.full}, Shelter, Open` })).toBeVisible()

    // Four copies of one boundary came back from the real route; the map and the list each show it once, at its worst.
    await expect(page.locator('path.hazard-zone')).toHaveCount(2)
    await expect(page.getByRole('button', { name: /Medium-risk hazard zone/ })).toHaveCount(1)
    await expect(page.locator('path.hazard-zone.hazard-low')).toHaveCount(0)

    // The overlay was asked for by the visible box, the shelters per region — and nothing for the layers still off.
    expect(requested.some((url) => /^\/map\/flood-overlay\?bbox=[\d.,-]+$/.test(url))).toBe(true)
    expect(requested.some((url) => url.startsWith('/shelters?region_id='))).toBe(true)
    expect(requested.some((url) => url.startsWith('/infrastructure'))).toBe(false)
    expect(requested.some((url) => url.startsWith('/essential-locations'))).toBe(false)
    await expect(page.getByRole('button', { name: `${names.hospital}, Hospital, At risk` })).toHaveCount(0)

    // Switching Infrastructure on fetches it and its marker appears; switching Flood off removes every zone and the list explains.
    const layers = page.getByRole('group', { name: 'Map layers' })
    await expect(layers.getByRole('button', { name: 'Flood' })).toHaveAttribute('aria-pressed', 'true')
    await layers.getByRole('button', { name: 'Infrastructure' }).click()
    await expect(layers.getByRole('button', { name: 'Infrastructure' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: `${names.hospital}, Hospital, At risk` })).toBeVisible()
    expect(requested.some((url) => url.startsWith('/infrastructure?region_id='))).toBe(true)

    await layers.getByRole('button', { name: 'Flood' }).click()
    await expect(page.locator('path.hazard-zone')).toHaveCount(0)
    await expect(page.getByText('Turn on the Flood layer to see hazards.')).toBeVisible()
    await layers.getByRole('button', { name: 'Flood' }).click()
    await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible()
  })

  test('selecting a shelter shows its real capacity and routes, and an over-full one says so', async ({ page }) => {
    await openMap(page, 'shelter')
    await page.getByRole('button', { name: `${names.alpha}, Shelter, Open` }).click()

    const card = page.getByRole('region', { name: `${names.alpha} details` })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Capacity')
    await expect(card).toContainText('210')
    await expect(card).toContainText('/ 400')
    await expect(card.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', '53')
    await expect(card.getByRole('link', { name: 'Navigate Here' })).toHaveAttribute('href', `/app/navigate?destination_shelter_id=${ids.alpha}`)
    await expect(card.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', `/app/map/shelters/${ids.alpha}`)

    // Another place replaces the card; the over-full shelter is flagged, its bar capped at 100.
    await page.getByRole('button', { name: `${names.full}, Shelter, Open` }).click()
    const full = page.getByRole('region', { name: `${names.full} details` })
    await expect(full).toContainText('Over capacity — 30 more than it holds.')
    await expect(full.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', '100')
    await expect(card).toHaveCount(0)

    await full.getByRole('button', { name: 'Close details' }).click()
    await expect(full).toHaveCount(0)
  })

  test('a forecast zone shows its model confidence and detail; a zone declared by hand has none', async ({ page }) => {
    await openMap(page, 'zones')
    await expect(page.getByRole('button', { name: /High-risk flood zone/ }).first()).toBeVisible()

    // Clicking the polygon itself (near its corner, clear of the shelter marker inside it) selects it and loads GET /hazard-zones/{id}.
    const detail = page.waitForResponse((res) => res.url() === `${API}/hazard-zones/${ids.highZone}` && res.ok())
    await page.locator('path.hazard-zone.hazard-high').first().click({ position: { x: 8, y: 8 } })
    await detail
    const card = page.getByRole('region', { name: 'Hazard zone details' })
    await expect(card).toContainText('High-risk flood zone')
    await expect(card).toContainText('Model forecast')
    await expect(card.getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute('aria-valuenow', '87')
    await expect(card).toContainText('e2e-model-1')
    await expect(card).toContainText('Valid')

    // The hand-declared zone: a flat colour, no confidence, and it says who made it.
    await page.locator('path.hazard-zone.hazard-medium').first().click({ position: { x: 8, y: 8 } })
    await expect(card).toContainText('Medium-risk hazard zone')
    await expect(card).toContainText('Declared by an admin')
    await expect(card.getByRole('progressbar', { name: 'Model confidence' })).toHaveCount(0)

    await card.getByRole('button', { name: 'Close details' }).click()
    await expect(card).toHaveCount(0)
  })

  test('search finds places by name across the layers that are on, and choosing one selects it', async ({ page }) => {
    await openMap(page, 'search')
    const search = page.getByLabel('Search the map')

    // Essentials are off, so their places aren't searched — and the panel says so instead of pretending there is nothing.
    await search.fill(names.pharmacy)
    await expect(page.getByText('Nothing matches. Only places on the layers that are switched on are searched.')).toBeVisible()

    const results = page.getByRole('region', { name: 'Places matching your search' })
    await page.getByRole('group', { name: 'Map layers' }).getByRole('button', { name: 'Essentials' }).click()
    await expect(results.getByRole('button', { name: new RegExp(`^${names.pharmacy}\\s+Pharmacy · Open`) })).toBeVisible()
    await results.getByRole('button', { name: new RegExp(`^${names.pharmacy}`) }).click()
    const card = page.getByRole('region', { name: `${names.pharmacy} details` })
    await expect(card).toContainText('Pharmacy')
    await expect(card).toContainText(/Reported open .* ago\./)

    // A place nobody has reported on is "Status unknown", never a guess at open or closed.
    await search.fill(names.atm)
    await expect(results.getByRole('button', { name: new RegExp(`^${names.atm}\\s+ATM · Status unknown`) })).toBeVisible()
    await results.getByRole('button', { name: new RegExp(`^${names.atm}`) }).click()
    await expect(page.getByRole('region', { name: `${names.atm} details` })).toContainText('Nobody has reported whether this place is open yet.')
  })

  test('the legend opens beside its button and closes with its X or Escape', async ({ page }) => {
    await openMap(page, 'legend')
    const toggle = page.getByRole('button', { name: 'Map legend' })
    await toggle.click()
    const legend = page.getByRole('dialog', { name: 'Map legend' })
    await expect(legend).toBeVisible()
    await expect(legend.getByRole('heading', { name: 'Flood zones' })).toBeVisible()

    await legend.getByRole('button', { name: 'Close legend' }).click()
    await expect(legend).toHaveCount(0)

    await toggle.click()
    await expect(legend).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(legend).toHaveCount(0)
  })
})

test.describe('Citizen map — go to my location, real backend', () => {
  // Inside the high-risk zone (0.05–0.35° from the province's corner) and about 15 km from the nearest shelter.
  test.use({ permissions: ['geolocation'], geolocation: { latitude: at(0.1, 0.1)[1], longitude: at(0.1, 0.1)[0] } })

  test('drops the viewer on the map and shows the server\'s risk check for it, with a way to the zone', async ({ page }) => {
    await openMap(page, 'locate')
    const risk = page.waitForRequest((req) => req.url() === `${API}/hazard-zones/risk-check` && req.method() === 'POST')
    await page.getByRole('button', { name: 'Go to my location' }).click()

    const body = (await risk).postDataJSON() as { lat: number; lng: number }
    expect(body.lat).toBeCloseTo(at(0.1, 0.1)[1], 3)
    expect(body.lng).toBeCloseTo(at(0.1, 0.1)[0], 3)

    await expect(page.getByRole('status').filter({ hasText: "You're inside a high-risk hazard zone." })).toBeVisible()
    await expect(page.locator('.leaflet-marker-icon div[style*="box-shadow:0 0 0 8px"]')).toBeVisible()

    await page.getByRole('button', { name: 'Show zone' }).click()
    await expect(page.getByRole('region', { name: 'Hazard zone details' })).toContainText('High-risk flood zone')

    // With the position known, a shelter's card says how far it is.
    await page.getByRole('button', { name: `${names.alpha}, Shelter, Open` }).click()
    await expect(page.getByRole('region', { name: `${names.alpha} details` })).toContainText(/km away|m away/)
  })
})
