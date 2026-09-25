import { test, expect, type Page } from '@playwright/test'
import { promoteToPlatformAdmin, seedEssentialLocation, seedHazardZone, seedInfrastructure, seedRegion, seedShelter, squareRing, verifyAndOnboardAccount } from './helpers/seed'
import { API, logIn, randomWorld, register, signInCitizen, visit } from './helpers/citizen'

/**
 * The Map's deferred tests (plan items 1–7): the phone run with touch, the browser's answers about the viewer's position, a citizen with no
 * home region and a staff account, panning and zooming by hand and the keyboard, every status and kind of place, the real flood pipeline's
 * zones, and the selection edge cases — all against the real backend, with no stubbed responses. (The one route that is delayed, not replaced,
 * is the flood overlay, to see the map keep the previous zones while the next box loads.) The world is `E2E MapX …` rows at a random spot per
 * run: a province with a district inside it, shelters of every state, infrastructure and essential places of every status, two stacked markers,
 * and two zones — a forecast with a confidence and one declared by hand.
 */
const { origin, at, rect, tag } = randomWorld()
const names = {
  province: `E2E MapX Prov ${tag}`,
  district: `E2E MapX District ${tag}`,
  open: `E2E MapX Shelter Open ${tag}`,
  closed: `E2E MapX Shelter Closed ${tag}`,
  relief: `E2E MapX Relief ${tag}`,
  inZone: `E2E MapX Shelter InZone ${tag}`,
  districtShelter: `E2E MapX Shelter District ${tag}`,
  stackA: `E2E MapX Stack A ${tag}`,
  stackB: `E2E MapX Stack B ${tag}`,
  hospital: `E2E MapX Hospital ${tag}`,
  bridge: `E2E MapX Bridge ${tag}`,
  utility: `E2E MapX Utility ${tag}`,
  pharmacy: `E2E MapX Pharmacy ${tag}`,
  grocery: `E2E MapX Grocery ${tag}`,
  atm: `E2E MapX ATM ${tag}`,
}
const ids = { province: '', district: '', highZone: '', manualZone: '' }

test.describe.configure({ mode: 'serial', timeout: 90_000 })

const place = (page: Page, name: string, type: string, status: string) => page.getByRole('button', { name: `${name}, ${type}, ${status}` })
const layerChips = (page: Page) => page.getByRole('group', { name: 'Map layers' })
const noHorizontalOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

/** A verified citizen with the seeded province as home region, on the map with the seeded shelters and forecast zone drawn. */
async function openMap(page: Page, label: string) {
  await signInCitizen(page, label, ids.province)
  await visit(page, '/app/map')
  await expect(place(page, names.open, 'Shelter', 'Open')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(150_000) // ~20 `docker exec psql` seeds, each guarded by a region lookup, plus a registration
  const reporter = await register(request, 'mapx-reporter')
  ids.province = seedRegion(names.province, 'province', undefined, squareRing(origin[0], origin[1], 0.6))
  ids.district = seedRegion(names.district, 'district', ids.province, rect(0.12, 0.38, 0.32, 0.6))

  const shelter = (name: string, dx: number, dy: number, extra: Partial<Parameters<typeof seedShelter>[1]> = {}) => {
    const [lng, lat] = at(dx, dy)
    return seedShelter(ids.province, { name, lng, lat, capacityTotal: 300, capacityCurrent: 120, ...extra })
  }
  shelter(names.open, 0.5, 0.1)
  shelter(names.closed, 0.5, 0.2, { status: 'closed' })
  shelter(names.relief, 0.5, 0.3, { type: 'relief_center' })
  shelter(names.inZone, 0.2, 0.2)
  shelter(names.districtShelter, 0.2, 0.45)
  shelter(names.stackA, 0.1, 0.5) // two markers on one spot
  shelter(names.stackB, 0.1, 0.5)

  const infra = (name: string, dx: number, dy: number, type: 'hospital' | 'bridge' | 'utility', status: 'safe' | 'at_risk' | 'damaged') => {
    const [lng, lat] = at(dx, dy)
    seedInfrastructure(ids.province, { name, lng, lat, type, status })
  }
  infra(names.hospital, 0.05, 0.55, 'hospital', 'safe')
  infra(names.bridge, 0.15, 0.55, 'bridge', 'at_risk')
  infra(names.utility, 0.25, 0.55, 'utility', 'damaged')

  const essential = (name: string, dx: number, dy: number, type: 'atm' | 'grocery_store' | 'pharmacy', report?: 'open' | 'closed') => {
    const [lng, lat] = at(dx, dy)
    seedEssentialLocation(ids.province, { name, lng, lat, type, ...(report ? { report: { by: reporter, status: report } } : {}) })
  }
  essential(names.pharmacy, 0.3, 0.4, 'pharmacy', 'open')
  essential(names.grocery, 0.4, 0.4, 'grocery_store', 'closed')
  essential(names.atm, 0.55, 0.4, 'atm')

  ids.highZone = seedHazardZone(ids.province, { ring: rect(0.05, 0.05, 0.35, 0.35), risk: 'high', confidence: 0.87 })
  ids.manualZone = seedHazardZone(ids.province, { ring: rect(0.4, 0.45, 0.55, 0.58), risk: 'medium' })
})

test.describe('Map (deferred) — every status and kind, and the selection edge cases', () => {
  test('every status and kind has its own marker colour, name and card; the search matches the status wording; a place inside a district shows once', async ({ page, request }) => {
    await openMap(page, 'mapx-kinds')
    await layerChips(page).getByRole('button', { name: 'Infrastructure' }).click()
    await layerChips(page).getByRole('button', { name: 'Essentials' }).click()

    const SAFE = 'rgb(46, 158, 91)'
    const CAUTION = 'rgb(224, 161, 0)'
    const CRITICAL = 'rgb(212, 46, 46)'
    const NEUTRAL = 'rgb(122, 90, 104)'
    const expected = [
      [names.open, 'Shelter', 'Open', SAFE],
      [names.closed, 'Shelter', 'Closed', CRITICAL],
      [names.relief, 'Relief center', 'Open', SAFE],
      [names.hospital, 'Hospital', 'Safe', SAFE],
      [names.bridge, 'Bridge', 'At risk', CAUTION],
      [names.utility, 'Utility', 'Damaged', CRITICAL],
      [names.pharmacy, 'Pharmacy', 'Open', SAFE],
      [names.grocery, 'Grocery store', 'Closed', CRITICAL],
      [names.atm, 'ATM', 'Status unknown', NEUTRAL],
    ] as const
    for (const [name, type, status, colour] of expected) {
      const marker = place(page, name, type, status)
      await expect(marker, `${name} is drawn once`).toHaveCount(1)
      await expect(marker.locator('div').first(), `${name} is ${status}`).toHaveCSS('background-color', colour)
    }

    // Each card says what the marker says.
    for (const [name, type, status] of [
      [names.closed, 'Shelter', 'Closed'],
      [names.relief, 'Relief center', 'Open'],
      [names.bridge, 'Bridge', 'At risk'],
      [names.utility, 'Utility', 'Damaged'],
      [names.grocery, 'Grocery store', 'Closed'],
    ] as const) {
      await place(page, name, type, status).click()
      const card = page.getByRole('region', { name: `${name} details` })
      await expect(card).toContainText(type)
      await expect(card).toContainText(status)
    }

    // The search reads the status wording as well as the name and the kind (other places in the database may match too — only ours are checked).
    const search = page.getByLabel('Search the map')
    const results = page.getByRole('region', { name: 'Places matching your search' })
    const found = (name: string) => results.getByRole('button', { name: new RegExp(`^${name}`) })
    await search.fill('closed')
    await expect(found(names.closed)).toBeVisible()
    await expect(found(names.grocery)).toBeVisible()
    await expect(found(names.open)).toHaveCount(0)
    await search.fill('at risk')
    await expect(found(names.bridge)).toBeVisible()
    await expect(found(names.hospital)).toHaveCount(0)
    await search.fill('damaged')
    await expect(found(names.utility)).toBeVisible()
    await search.fill('status unknown')
    await expect(found(names.atm)).toBeVisible()
    await expect(found(names.pharmacy)).toHaveCount(0)
    await search.fill('relief center')
    await expect(found(names.relief)).toBeVisible()
    await search.fill('')

    // The premise: the API returns a place inside a district for the district *and* for its province — and the map still shows it once.
    const names_ = async (region: string) => ((await (await request.get(`${API}/shelters?region_id=${region}`)).json()) as Array<{ name: string }>).map((s) => s.name)
    expect(await names_(ids.province)).toContain(names.districtShelter)
    expect(await names_(ids.district)).toContain(names.districtShelter)
    await expect(place(page, names.districtShelter, 'Shelter', 'Open')).toHaveCount(1)
  })

  test('selection edge cases: another layer going off keeps the card, its own layer going off takes it; a marker in a zone wins over the zone; a zone survives a search that hides it; stacked markers can each be chosen', async ({
    page,
  }) => {
    await openMap(page, 'mapx-select')
    const chips = layerChips(page)

    // A marker sitting inside a zone is what a click on it selects — not the zone under it.
    await place(page, names.inZone, 'Shelter', 'Open').click()
    await expect(page.getByRole('region', { name: `${names.inZone} details` })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Hazard zone details' })).toHaveCount(0)

    // A selected shelter survives Infrastructure being switched on and off…
    await place(page, names.open, 'Shelter', 'Open').click()
    const shelterCard = page.getByRole('region', { name: `${names.open} details` })
    await expect(shelterCard).toBeVisible()
    await chips.getByRole('button', { name: 'Infrastructure' }).click()
    await chips.getByRole('button', { name: 'Infrastructure' }).click()
    await expect(shelterCard).toBeVisible()
    // …but a hospital's card goes with its own layer.
    await chips.getByRole('button', { name: 'Infrastructure' }).click()
    await place(page, names.hospital, 'Hospital', 'Safe').click()
    const hospitalCard = page.getByRole('region', { name: `${names.hospital} details` })
    await expect(hospitalCard).toBeVisible()
    await chips.getByRole('button', { name: 'Infrastructure' }).click()
    await expect(hospitalCard).toHaveCount(0)

    // Two markers on one spot: both are there, the search lists both, and each can be chosen from it.
    const stack = page.locator(`.leaflet-marker-icon[title^="${names.stackA}"], .leaflet-marker-icon[title^="${names.stackB}"]`)
    await expect(stack).toHaveCount(2)
    const spot = (await stack.first().boundingBox())!
    await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2)
    await expect(page.getByRole('region', { name: new RegExp(`^E2E MapX Stack [AB] ${tag} details$`) })).toHaveCount(1)
    const search = page.getByLabel('Search the map')
    await search.fill(`Stack`)
    const results = page.getByRole('region', { name: 'Places matching your search' })
    for (const name of [names.stackA, names.stackB]) {
      await results.getByRole('button', { name: new RegExp(`^${name}`) }).click()
      await expect(page.getByRole('region', { name: `${name} details` })).toBeVisible()
    }

    // A selected zone stays selected when a search hides its outline.
    await search.fill('')
    await page.getByRole('button', { name: /High-risk flood zone/ }).first().click()
    const zoneCard = page.getByRole('region', { name: 'Hazard zone details' })
    await expect(zoneCard).toBeVisible()
    await search.fill('zzz nothing matches this')
    await expect(page.locator('path.hazard-zone')).toHaveCount(0)
    await expect(zoneCard).toBeVisible()
  })
})

test.describe('Map (deferred) — panning, zooming and the keyboard', () => {
  test('a real drag sends a new box; zooming in sends another; coming back to a view already loaded sends nothing', async ({ page }) => {
    const boxes: string[] = []
    page.on('request', (req) => req.url().startsWith(`${API}/map/flood-overlay`) && boxes.push(new URL(req.url()).searchParams.get('bbox') ?? ''))
    await openMap(page, 'mapx-pan')
    await page.waitForTimeout(1200) // the view settles and the debounce fires
    const opening = boxes.length
    expect(opening).toBeGreaterThan(0)

    // Drag from a corner clear of markers, far enough to cross the 0.1° grid the box is rounded to.
    const map = (await page.locator('.leaflet-container').first().boundingBox())!
    await page.mouse.move(map.x + 40, map.y + 40)
    await page.mouse.down()
    await page.mouse.move(map.x + 40 + 330, map.y + 40 + 170, { steps: 15 })
    await page.waitForTimeout(200)
    await page.mouse.up()
    await expect.poll(() => boxes.length, { timeout: 6000 }).toBeGreaterThan(opening)
    const afterDrag = boxes.length

    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => boxes.length, { timeout: 6000 }).toBeGreaterThan(afterDrag)
    const afterZoomIn = boxes.length

    // Zooming back out returns to the view that was already loaded (well inside the 30 s the answer is kept): no request.
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.waitForTimeout(1500)
    expect(boxes.length).toBe(afterZoomIn)
    expect(new Set(boxes).size).toBeGreaterThan(1)
  })

  test('the previous zones stay drawn while the next box is on its way', async ({ page }) => {
    await openMap(page, 'mapx-keep')
    await page.waitForTimeout(1000)
    let held = 0
    await page.route(`${API}/map/flood-overlay*`, async (route) => {
      held += 1
      await new Promise((resolve) => setTimeout(resolve, 2500))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => held, { timeout: 5000 }).toBeGreaterThan(0)
    // The request is in flight (held 2.5 s): the zone is still drawn and the list is not back to its loading skeleton.
    await expect(page.locator('path.hazard-zone.hazard-high').first()).toBeVisible()
    await expect(page.getByLabel('Loading hazards')).toHaveCount(0)
    await expect.poll(async () => page.locator('path.hazard-zone').count(), { timeout: 8000 }).toBeGreaterThan(0)
  })

  test('the markers are reachable by keyboard: Tab lands on one, Enter selects it, and Escape closes the legend', async ({ page }) => {
    await openMap(page, 'mapx-keys')
    await page.getByLabel('Search the map').focus()
    let landed = ''
    for (let i = 0; i < 200 && !landed.startsWith('E2E MapX'); i++) {
      await page.keyboard.press('Tab')
      landed = (await page.evaluate(() => document.activeElement?.getAttribute('title') ?? '')) as string
    }
    expect(landed, 'Tab reached one of the seeded markers').toMatch(/^E2E MapX .*, (Shelter|Relief center), (Open|Closed)$/)
    await page.keyboard.press('Enter')
    const [name] = landed.split(', ')
    await expect(page.getByRole('region', { name: `${name} details` })).toBeVisible()

    await page.getByRole('button', { name: 'Map legend' }).focus()
    await page.keyboard.press('Enter')
    const legend = page.getByRole('dialog', { name: 'Map legend' })
    await expect(legend).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(legend).toHaveCount(0)
  })
})

test.describe('Map (deferred) — the browser will not say where the viewer is', () => {
  const asks = (page: Page) => {
    const posted: string[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().includes('/hazard-zones/risk-check') && posted.push(req.url()))
    return posted
  }
  const note = (page: Page, text: RegExp) => page.getByRole('status').filter({ hasText: text })

  test('blocked: the plain-language note, and no risk check sent', async ({ page }) => {
    const posted = asks(page)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => fail({ code: 1, PERMISSION_DENIED: 1, message: 'denied' }) },
      })
    })
    await openMap(page, 'mapx-denied')
    await page.getByRole('button', { name: 'Go to my location' }).click()
    await expect(note(page, /Location is blocked for this site/)).toBeVisible()
    await page.waitForTimeout(500)
    expect(posted).toEqual([])
  })

  test('no fix: says so and leaves the button to try again, and no risk check sent', async ({ page }) => {
    const posted = asks(page)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => fail({ code: 2, PERMISSION_DENIED: 1, message: 'unavailable' }) },
      })
    })
    await openMap(page, 'mapx-unavailable')
    const locate = page.getByRole('button', { name: 'Go to my location' })
    await locate.click()
    await expect(note(page, /Couldn't get your location\. Try the location button again\./)).toBeVisible()
    await expect(locate).toBeEnabled()
    await page.waitForTimeout(500)
    expect(posted).toEqual([])
  })

  test('a browser with no geolocation at all: says it cannot share its location, and no risk check sent', async ({ page }) => {
    const posted = asks(page)
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'geolocation', { configurable: true, get: () => undefined })
    })
    await openMap(page, 'mapx-unsupported')
    await page.getByRole('button', { name: 'Go to my location' }).click()
    await expect(note(page, /This browser can't share its location\./)).toBeVisible()
    await page.waitForTimeout(500)
    expect(posted).toEqual([])
  })

  test.describe('outside every zone', () => {
    // 0.12° south-west of the province's corner: outside both seeded zones, about 25 km from the nearest, and far from the real pipeline's grid.
    const [lng, lat] = at(-0.12, -0.12)
    test.use({ permissions: ['geolocation'], geolocation: { latitude: lat, longitude: lng } })

    test('says how far the nearest active hazard is — from the real risk check — and Show zone opens it', async ({ page }) => {
      await openMap(page, 'mapx-outside')
      const answer = page.waitForResponse((res) => res.url() === `${API}/hazard-zones/risk-check` && res.request().method() === 'POST')
      await page.getByRole('button', { name: 'Go to my location' }).click()
      const body = (await (await answer).json()) as { inside_hazard_zone: boolean; hazard_zone_id?: string; distance_meters?: number }
      expect(body.inside_hazard_zone).toBe(false)
      expect([ids.highZone, ids.manualZone]).toContain(body.hazard_zone_id)
      expect(body.distance_meters).toBeGreaterThan(10_000)
      expect(body.distance_meters).toBeLessThan(60_000)

      await expect(page.getByRole('status').filter({ hasText: /The nearest active hazard is .* km away/ })).toBeVisible()
      await page.getByRole('button', { name: 'Show zone' }).click()
      await expect(page.getByRole('region', { name: 'Hazard zone details' })).toBeVisible()
    })
  })
})

test.describe('Map (deferred) — who opens it, and where', () => {
  test('a citizen with no home region opens on the box around every top-level region — and every one of them has its places', async ({ page, request }) => {
    const boxes: string[] = []
    page.on('request', (req) => req.url().startsWith(`${API}/map/flood-overlay`) && boxes.push(new URL(req.url()).searchParams.get('bbox') ?? ''))
    const email = await register(request, 'mapx-nohome')
    verifyAndOnboardAccount(email, 'E2E Citizen')
    await logIn(page, email, /\/app\/home$/)
    await visit(page, '/app/map')

    await expect(place(page, names.open, 'Shelter', 'Open')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => boxes.length, { timeout: 10_000 }).toBeGreaterThan(0)
    const regions = (await (await request.get(`${API}/regions`)).json()) as Array<{ parent_region_id?: string; boundary: { coordinates: number[][][] } }>
    const points = regions.filter((r) => !r.parent_region_id).flatMap((r) => r.boundary.coordinates.flat())
    const west = Math.min(...points.map((p) => p[0]))
    const east = Math.max(...points.map((p) => p[0]))
    const south = Math.min(...points.map((p) => p[1]))
    const north = Math.max(...points.map((p) => p[1]))
    const [w, s, e, n] = boxes[boxes.length - 1].split(',').map(Number)
    expect(w).toBeLessThanOrEqual(west)
    expect(s).toBeLessThanOrEqual(south)
    expect(e).toBeGreaterThanOrEqual(east)
    expect(n).toBeGreaterThanOrEqual(north)
  })

  test('a staff account is turned away from /app/map, to its own console', async ({ page, request }) => {
    const email = await register(request, 'mapx-staff')
    promoteToPlatformAdmin(email)
    await logIn(page, email, /\/admin\/dashboard$/)
    await page.goto('/app/map')
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
  })
})

test.describe('Map (deferred) — the real flood pipeline', () => {
  test('a home region over the pipeline\'s grid: the copies collapse, the list and the map agree, and the whole country loads quickly', async ({ page, request }) => {
    // A 1° province over a cell where the pipeline has stored dozens of copies of a few boundaries.
    const pipeline = seedRegion(`E2E MapX Pipeline ${tag}`, 'province', undefined, squareRing(69, 26, 1))
    const overlayBodies: Array<{ url: string; entries: Array<{ boundary: unknown }> }> = []
    page.on('response', async (res) => {
      if (res.url().startsWith(`${API}/map/flood-overlay`) && res.ok()) overlayBodies.push({ url: res.url(), entries: (await res.json()) as Array<{ boundary: unknown }> })
    })
    await signInCitizen(page, 'mapx-pipeline', pipeline)
    await visit(page, '/app/map')
    await expect(page.locator('path.hazard-zone').first()).toBeVisible({ timeout: 25_000 })
    await page.waitForTimeout(1500)

    const latest = overlayBodies[overlayBodies.length - 1]
    const distinct = new Set(latest.entries.map((entry) => JSON.stringify(entry.boundary))).size
    expect(latest.entries.length, 'the route returns repeated boundaries').toBeGreaterThan(distinct)
    expect(distinct).toBeGreaterThan(0)
    await expect(page.locator('path.hazard-zone')).toHaveCount(distinct)
    const listed = page.getByRole('button', { name: /Active hazards in view/ })
    await expect(listed).toContainText(String(distinct))
    await noHorizontalOverflow(page)

    // Zoom right out to the whole country: it answers within seconds, in a payload nowhere near the 6.7 MB of the unfloored route, and the page stays responsive.
    const started = Date.now()
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Zoom out' }).click()
      await page.waitForTimeout(250)
    }
    await expect
      .poll(
        () =>
          overlayBodies.some((body) => {
            const [w, , e] = (new URL(body.url).searchParams.get('bbox') ?? '0,0,0,0').split(',').map(Number)
            return e - w > 25
          }),
        { timeout: 20_000 },
      )
      .toBe(true)
    const country = overlayBodies.find((body) => {
      const [w, , e] = (new URL(body.url).searchParams.get('bbox') ?? '0,0,0,0').split(',').map(Number)
      return e - w > 25
    })!
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(JSON.stringify(country.entries).length).toBeLessThan(2_000_000)
    await expect(page.locator('path.hazard-zone').first()).toBeVisible()
    await page.getByRole('button', { name: 'Zoom in' }).click({ timeout: 3000 })
    const total = await request.get(`${API}/map/flood-overlay?bbox=${new URL(country.url).searchParams.get('bbox')}`)
    expect(total.ok()).toBe(true)
  })
})

test.describe('Map (deferred) — phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('Map ⇄ List keeps the map where it was; the chips scroll; a zone chosen in the list returns to the map once; the legend closes; the card fits — with no overflow', async ({ page }) => {
    await openMap(page, 'mapx-phone')
    await noHorizontalOverflow(page)

    // The chips sit in a strip that scrolls sideways under the map controls, and a chip that is off the strip can still be tapped.
    const chips = layerChips(page)
    const strip = await chips.evaluate((el) => {
      const scroller = el.parentElement!
      return { overflowX: getComputedStyle(scroller).overflowX, scrolls: scroller.scrollWidth > scroller.clientWidth }
    })
    expect(strip.overflowX).toBe('auto')
    await chips.getByRole('button', { name: 'Essentials' }).tap()
    await expect(chips.getByRole('button', { name: 'Essentials' })).toHaveAttribute('aria-pressed', 'true')
    await chips.getByRole('button', { name: 'Essentials' }).tap()

    // Going to the list and back leaves the map exactly where it was — once the opening fit to the home region has finished (it moves the map by itself as the profile and the regions arrive).
    const marker = place(page, names.open, 'Shelter', 'Open')
    let before = (await marker.boundingBox())!
    await expect
      .poll(async () => {
        const now = (await marker.boundingBox())!
        const still = now.x === before.x && now.y === before.y
        before = now
        return still
      }, { timeout: 15_000, intervals: [800] })
      .toBe(true)
    await page.getByRole('button', { name: 'List & filters' }).tap()
    await expect(page.getByLabel('Map filters and lists')).toBeVisible()
    await noHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Map', exact: true }).tap()
    await expect(marker).toBeVisible()
    const after = (await marker.boundingBox())!
    expect(Math.abs(after.x - before.x)).toBeLessThan(2)
    expect(Math.abs(after.y - before.y)).toBeLessThan(2)

    // A zone chosen in the list takes the person back to the map, with its card there exactly once, inside the screen.
    await page.getByRole('button', { name: 'List & filters' }).tap()
    await page.getByRole('button', { name: /High-risk flood zone/ }).first().tap()
    const card = page.getByRole('region', { name: 'Hazard zone details' })
    await expect(card).toHaveCount(1)
    await expect(card).toBeVisible()
    const cardBox = (await card.boundingBox())!
    expect(cardBox.y).toBeGreaterThanOrEqual(0)
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(844)
    const holder = await card.evaluate((el) => {
      const overlay = el.parentElement!
      return { overflowY: getComputedStyle(overlay).overflowY, height: overlay.getBoundingClientRect().height, mapHeight: overlay.parentElement!.getBoundingClientRect().height }
    })
    expect(holder.overflowY).toBe('auto') // a tall card scrolls instead of running off the screen
    expect(holder.height).toBeLessThanOrEqual(holder.mapHeight * 0.56)
    await card.getByRole('button', { name: 'Close details' }).tap()
    await expect(card).toHaveCount(0)

    // The legend opens and its close button is the topmost thing at its own centre — reachable by a finger.
    await page.getByRole('button', { name: 'Map legend' }).tap()
    const legend = page.getByRole('dialog', { name: 'Map legend' })
    await expect(legend).toBeVisible()
    const close = legend.getByRole('button', { name: 'Close legend' })
    expect(await close.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return el === top || el.contains(top)
    })).toBe(true)
    await close.tap()
    await expect(legend).toHaveCount(0)

    // A shelter chosen from the search results (the map has flown to the zone, so its marker may be anywhere): the card is over the map, inside the screen, and the page still has no sideways scroll.
    await page.getByRole('button', { name: 'List & filters' }).tap()
    await page.getByLabel('Search the map').fill(names.open)
    await page.getByRole('region', { name: 'Places matching your search' }).getByRole('button', { name: new RegExp(`^${names.open}`) }).tap()
    const shelterCard = page.getByRole('region', { name: `${names.open} details` })
    await expect(shelterCard).toBeVisible()
    const shelterBox = (await shelterCard.boundingBox())!
    expect(shelterBox.y + shelterBox.height).toBeLessThanOrEqual(844)
    await noHorizontalOverflow(page)
  })
})
