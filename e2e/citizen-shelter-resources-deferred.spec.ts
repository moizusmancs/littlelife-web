import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  promoteToPlatformAdmin,
  readEssentialReports,
  readShelter,
  seedEssentialLocation,
  seedEssentialLocations,
  seedHazardZone,
  seedRegion,
  seedShelter,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'
import { API, logIn, randomWorld, register, signInCitizen, visit } from './helpers/citizen'

/**
 * The deferred tests for Shelter Detail (plan items 9–12) and Resources › Local (14–19), against the real backend with no stubbed responses
 * (the one route that is delayed, not replaced, is a status report, to see the buttons lock while it is in flight). The world is `E2E SRX …`
 * rows at random spots: a province with a district and a tehsil inside it and a pharmacy at each level, shelters that are full / empty-capacity
 * / ordinary, a second province with a pharmacy, and a third with thirty ATMs.
 */
const A = randomWorld()
const B = randomWorld()
const C = randomWorld()
const tag = A.tag
const names = {
  provinceA: `E2E SRX Prov A ${tag}`,
  district: `E2E SRX District ${tag}`,
  tehsil: `E2E SRX Tehsil ${tag}`,
  provinceB: `E2E SRX Prov B ${tag}`,
  bulk: `E2E SRX Bulk Prov ${tag}`,
  shelter: `E2E SRX Shelter ${tag}`,
  full: `E2E SRX Shelter Full ${tag}`,
  zero: `E2E SRX Shelter Zero ${tag}`,
  pharmT: `E2E SRX Pharm Tehsil ${tag}`,
  pharmD: `E2E SRX Pharm District ${tag}`,
  pharmP: `E2E SRX Pharm Province ${tag}`,
  grocery: `E2E SRX Grocery ${tag}`,
  atm: `E2E SRX ATM ${tag}`,
  elsewhere: `E2E SRX Elsewhere ${tag}`,
  bulkPrefix: `E2E SRX Bulk ATM ${tag}`,
}
const ids = { provinceA: '', district: '', tehsil: '', provinceB: '', bulk: '', shelter: '', full: '', zero: '', pharmT: '', pharmD: '', pharmP: '', grocery: '', atm: '', elsewhere: '' }

test.describe.configure({ mode: 'serial', timeout: 90_000 })

const noHorizontalOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })
const rowCount = (page: Page) => page.getByRole('main').getByRole('listitem').count()
const listed = async (page: Page) => (await page.getByRole('listitem').locator('p.font-semibold').allInnerTexts()).filter((text) => text.startsWith('E2E SRX '))
const haversineKm = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
const insideBox = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1

/** A citizen in a browser context of their own (so several can be signed in at once), with the given home region. */
async function citizenIn(browser: Browser, label: string, home?: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = await signInCitizen(page, label, home)
  return { page, context, email }
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(150_000)
  ids.provinceA = seedRegion(names.provinceA, 'province', undefined, squareRing(A.origin[0], A.origin[1], 0.6))
  ids.district = seedRegion(names.district, 'district', ids.provinceA, A.rect(0.1, 0.1, 0.4, 0.4))
  ids.tehsil = seedRegion(names.tehsil, 'tehsil', ids.district, A.rect(0.15, 0.15, 0.3, 0.3))
  ids.provinceB = seedRegion(names.provinceB, 'province', undefined, squareRing(B.origin[0], B.origin[1], 0.6))
  ids.bulk = seedRegion(names.bulk, 'province', undefined, squareRing(C.origin[0], C.origin[1], 0.6))

  const shelter = (name: string, dx: number, dy: number, total: number, current: number) => {
    const [lng, lat] = A.at(dx, dy)
    return seedShelter(ids.provinceA, { name, lng, lat, capacityTotal: total, capacityCurrent: current })
  }
  ids.shelter = shelter(names.shelter, 0.5, 0.1, 400, 265)
  ids.full = shelter(names.full, 0.5, 0.2, 300, 300)
  ids.zero = shelter(names.zero, 0.5, 0.3, 0, 0)
  seedHazardZone(ids.provinceA, { ring: A.rect(0.4, 0.05, 0.58, 0.35), risk: 'high', confidence: 0.87 })

  const reporter = await register(request, 'srx-reporter')
  const pharmacy = (name: string, dx: number, dy: number, report?: 'open' | 'closed') => {
    const [lng, lat] = A.at(dx, dy)
    return seedEssentialLocation(ids.provinceA, { name, lng, lat, type: 'pharmacy', ...(report ? { report: { by: reporter, status: report } } : {}) })
  }
  ids.pharmT = pharmacy(names.pharmT, 0.2, 0.2, 'open')
  ids.pharmD = pharmacy(names.pharmD, 0.35, 0.35)
  ids.pharmP = pharmacy(names.pharmP, 0.5, 0.5)
  ids.grocery = seedEssentialLocation(ids.provinceA, { name: names.grocery, lng: A.at(0.05, 0.5)[0], lat: A.at(0.05, 0.5)[1], type: 'grocery_store', report: { by: reporter, status: 'closed' } })
  ids.atm = seedEssentialLocation(ids.provinceA, { name: names.atm, lng: A.at(0.05, 0.05)[0], lat: A.at(0.05, 0.05)[1], type: 'atm' })
  ids.elsewhere = seedEssentialLocation(ids.provinceB, { name: names.elsewhere, lng: B.at(0.2, 0.2)[0], lat: B.at(0.2, 0.2)[1], type: 'pharmacy' })
  expect(seedEssentialLocations(ids.bulk, { prefix: names.bulkPrefix, count: 30, lng: C.at(0.05, 0.05)[0], lat: C.at(0.05, 0.05)[1] })).toBe(30)
})

/* ────────────────────────────── Shelter Detail ────────────────────────────── */

test.describe('Shelter Detail (deferred) — the browser will not say where the visitor is', () => {
  const asks = (page: Page) => {
    const posted: string[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().includes('/hazard-zones/risk-check') && posted.push(req.url()))
    return posted
  }

  for (const [label, install, text] of [
    [
      'blocked',
      () => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => fail({ code: 1, PERMISSION_DENIED: 1, message: 'denied' }) } }),
      /Location is blocked for this site\. Allow it in your browser's site settings to see how far this shelter is from you\./,
    ],
    [
      'no fix',
      () => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => fail({ code: 2, PERMISSION_DENIED: 1, message: 'unavailable' }) } }),
      /Couldn't get your location\. Try the location button again\./,
    ],
    ['unsupported', () => Object.defineProperty(Navigator.prototype, 'geolocation', { configurable: true, get: () => undefined }), /This browser can't share its location\./],
  ] as const) {
    test(`${label}: says so in terms of the distance, shows no distance, and both the page's button and the map's own locate button can be tried again`, async ({ page }) => {
      const posted = asks(page)
      await page.addInitScript(install)
      await signInCitizen(page, `srx-loc-${label.replace(/\W/g, '')}`, ids.provinceA)
      await visit(page, `/app/map/shelters/${ids.shelter}`)
      await expect(page.getByRole('heading', { level: 1, name: names.shelter })).toBeVisible()

      const ask = page.getByRole('button', { name: 'Show distance from me' })
      await ask.click()
      await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible()
      await expect(page.getByText(/km away|\bm away/)).toHaveCount(0)
      await expect(ask).toBeEnabled()

      // The map's own locate button says the same thing, and neither sends a risk check.
      await page.getByRole('button', { name: 'Go to my location' }).click()
      await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible()
      await expect(page.getByText(/km away|\bm away/)).toHaveCount(0)
      expect(posted).toEqual([])
    })
  }
})

test.describe('Shelter Detail (deferred) — a shelter far from the visitor', () => {
  // About 440 km north of the shelter.
  const [lngA, latA] = A.at(0.5, 0.1)
  const me: [number, number] = [latA + 4, lngA]
  test.use({ permissions: ['geolocation'], geolocation: { latitude: me[0], longitude: me[1] } })

  test('the distance reads in kilometres, matches the stored coordinates, and the map shows both places', async ({ page }) => {
    await signInCitizen(page, 'srx-far', ids.provinceA)
    await visit(page, `/app/map/shelters/${ids.shelter}`)
    await page.getByRole('button', { name: 'Show distance from me' }).click()
    const stored = readShelter(ids.shelter)
    const shown = page.getByRole('region', { name: 'Location' }).getByText(/[\d,]+(\.\d+)? km away/)
    await expect(shown).toBeVisible()
    const km = Number((await shown.innerText()).match(/([\d,.]+) km/)![1].replace(/,/g, ''))
    expect(km).toBeGreaterThan(400)
    expect(km).toBeCloseTo(haversineKm(me, [stored.lat, stored.lng]), -1) // within ±5 km of the real distance

    // The map was fitted to both: the shelter's marker and the visitor's dot are each inside the map's frame, not merely in the page.
    const location = page.getByRole('region', { name: 'Location' })
    const frame = (await location.locator('.leaflet-container').boundingBox())!
    await expect
      .poll(async () => {
        const marker = await location.getByRole('button', { name: `${names.shelter}, Shelter, Open` }).boundingBox()
        const dot = await location.locator('.leaflet-marker-icon div[style*="box-shadow:0 0 0 8px"]').boundingBox()
        return !!marker && !!dot && insideBox(marker, frame) && insideBox(dot, frame)
      }, { timeout: 10_000 })
      .toBe(true)
  })
})

test.describe('Shelter Detail (deferred) — other shelters, and how to get in and out', () => {
  test('a shelter with no managing organisation, exactly full, and one with zero capacity are each shown plainly', async ({ page }) => {
    await signInCitizen(page, 'srx-others', ids.provinceA)

    // Exactly full: 100%, and it is not called over capacity.
    await visit(page, `/app/map/shelters/${ids.full}`)
    const capacity = page.getByRole('region', { name: 'Capacity' })
    await expect(capacity).toContainText('Capacity 300 / 300')
    await expect(capacity.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', '100')
    await expect(capacity).not.toContainText('Over capacity')

    // Zero capacity: no division by zero — a 0% bar and no "NaN" anywhere on the page.
    await visit(page, `/app/map/shelters/${ids.zero}`)
    await expect(page.getByRole('heading', { level: 1, name: names.zero })).toBeVisible()
    const empty = page.getByRole('region', { name: 'Capacity' })
    await expect(empty).toContainText('Capacity 0 / 0')
    await expect(empty.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', '0')
    expect(await page.locator('body').innerText()).not.toMatch(/NaN|Infinity/)

    // None of these has a managing organisation (the API omits it), and the page reads the same as any other: no "run by".
    await visit(page, `/app/map/shelters/${ids.shelter}`)
    await expect(page.getByRole('heading', { level: 1, name: names.shelter })).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(/run by|Managed by/i)
  })

  test('a staff account is turned away; Back to map works from a direct link with no history; the browser Back button returns to the map', async ({ page, request }) => {
    // Staff first, in their own context.
    const staffEmail = await register(request, 'srx-staff')
    promoteToPlatformAdmin(staffEmail)
    await logIn(page, staffEmail, /\/admin\/dashboard$/)
    await page.goto(`/app/map/shelters/${ids.shelter}`)
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
    await page.context().clearCookies()

    const email = await register(request, 'srx-nav')
    verifyAndOnboardAccount(email, 'E2E Citizen')
    await logIn(page, email, /\/app\/home$/)

    // A direct link: the tab has no history to go back to, so the link is the way back.
    await visit(page, `/app/map/shelters/${ids.shelter}`)
    await page.getByRole('link', { name: 'Back to map' }).click()
    await expect(page).toHaveURL(/\/app\/map$/)

    // From the map's card to the page, and the browser's own Back button returns to the map.
    await expect(page.getByRole('button', { name: `${names.shelter}, Shelter, Open` })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: `${names.shelter}, Shelter, Open` }).click()
    await page.getByRole('region', { name: `${names.shelter} details` }).getByRole('link', { name: 'View Details' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/map/shelters/${ids.shelter}$`))
    await page.goBack()
    await expect(page).toHaveURL(/\/app\/map$/)
    await expect(page.getByRole('button', { name: `${names.shelter}, Shelter, Open` })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('Shelter Detail (deferred) — phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('Navigate Here stays pinned above the bottom edge while scrolling and never hides the last card; the embedded map can be dragged and zoomed; the legend closes', async ({ page }) => {
    await signInCitizen(page, 'srx-phone-detail', ids.provinceA)
    await visit(page, `/app/map/shelters/${ids.shelter}`)
    await expect(page.getByRole('heading', { level: 1, name: names.shelter })).toBeVisible()
    await noHorizontalOverflow(page)

    const navigate = page.getByRole('link', { name: /Navigate Here/ })
    const gapAtTop = 844 - (await navigate.boundingBox().then((b) => b!.y + b!.height))
    expect(gapAtTop).toBeGreaterThanOrEqual(12)
    expect(gapAtTop).toBeLessThanOrEqual(20)

    // Scrolled to the very bottom it is still pinned, and the last card ends above it.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const pinned = (await navigate.boundingBox())!
    expect(844 - (pinned.y + pinned.height)).toBeGreaterThanOrEqual(12)
    expect(844 - (pinned.y + pinned.height)).toBeLessThanOrEqual(20)
    const details = (await page.getByRole('region', { name: 'Details' }).boundingBox())!
    expect(details.y + details.height).toBeLessThanOrEqual(pinned.y + 1)

    // The map inside the Location card: zoom buttons, a drag and the legend all work from a phone.
    await page.getByRole('region', { name: 'Location' }).scrollIntoViewIfNeeded()
    const location = page.getByRole('region', { name: 'Location' })
    const marker = location.getByRole('button', { name: `${names.shelter}, Shelter, Open` })
    const start = (await marker.boundingBox())!
    await location.getByRole('button', { name: 'Zoom in' }).tap()
    await page.waitForTimeout(600)
    const zoomed = (await marker.boundingBox())!
    expect(Math.abs(zoomed.x - start.x) + Math.abs(zoomed.y - start.y)).toBeGreaterThan(0) // the view changed about its centre

    const frame = (await location.locator('.leaflet-container').boundingBox())!
    await page.mouse.move(frame.x + 30, frame.y + 30)
    await page.mouse.down()
    await page.mouse.move(frame.x + 130, frame.y + 90, { steps: 8 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    const dragged = (await marker.boundingBox())!
    expect(Math.abs(dragged.x - zoomed.x) + Math.abs(dragged.y - zoomed.y)).toBeGreaterThan(20)

    await location.getByRole('button', { name: 'Map legend' }).tap()
    const legend = page.getByRole('dialog', { name: 'Map legend' })
    await expect(legend).toBeVisible()
    const close = legend.getByRole('button', { name: 'Close legend' })
    expect(
      await close.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return el === top || el.contains(top)
      }),
    ).toBe(true)
    await close.tap()
    await expect(legend).toHaveCount(0)
    await noHorizontalOverflow(page)
  })
})

/* ────────────────────────────── Resources › Local ────────────────────────────── */

test.describe('Resources (deferred) — who is shown what', () => {
  test('a citizen with no home region is shown everywhere, told how to set one, and led to Edit Profile', async ({ page }) => {
    const email = await register(page.request, 'srx-nohome')
    verifyAndOnboardAccount(email, 'E2E Citizen')
    await logIn(page, email, /\/app\/home$/)
    await visit(page, '/app/resources')
    await expect(page.getByText('Showing everywhere.')).toBeVisible({ timeout: 25_000 })
    // Everywhere is long (every earlier region's places too, and this run's thirty ATMs sort ahead of the pharmacies), so look at the pharmacies.
    await page.getByRole('group', { name: 'Kind of place' }).getByRole('button', { name: /^Pharmacies/ }).click()
    await expect(row(page, names.pharmT)).toBeVisible({ timeout: 25_000 })
    await expect(row(page, names.elsewhere)).toBeVisible()
    await expect(page.getByRole('group', { name: 'Where to look' })).toHaveCount(0) // there is no home to switch to
    await page.getByRole('link', { name: 'Set your home region' }).click()
    await expect(page).toHaveURL(/\/app\/profile\/edit$/)
  })

  test('a home region that is a tehsil, a district or a province each lists what is inside it — and only that', async ({ browser }) => {
    const cases: Array<{ level: string; region: string; regionName: string; expected: string[] }> = [
      { level: 'tehsil', region: ids.tehsil, regionName: names.tehsil, expected: [names.pharmT] },
      { level: 'district', region: ids.district, regionName: names.district, expected: [names.pharmT, names.pharmD] },
      { level: 'province', region: ids.provinceA, regionName: names.provinceA, expected: [names.shelter, names.full, names.zero, names.pharmT, names.pharmD, names.pharmP, names.grocery, names.atm] },
    ]
    for (const { level, region, regionName, expected } of cases) {
      const citizen = await citizenIn(browser, `srx-home-${level}`, region)
      await visit(citizen.page, '/app/resources')
      await expect(citizen.page.getByRole('group', { name: 'Where to look' }).getByRole('button', { name: regionName })).toBeVisible({ timeout: 25_000 })
      await expect.poll(async () => (await listed(citizen.page)).sort(), { timeout: 20_000, message: `a home ${level}` }).toEqual([...expected].sort())
      await citizen.context.close()
    }
  })

  test('a staff account is turned away from /app/resources', async ({ page, request }) => {
    const email = await register(request, 'srx-res-staff')
    promoteToPlatformAdmin(email)
    await logIn(page, email, /\/admin\/dashboard$/)
    await page.goto('/app/resources')
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
  })
})

test.describe('Resources (deferred) — more than one page, and the keyboard', () => {
  test('thirty places show twenty-five, "Show more" reveals the rest, and changing the kind or the scope starts again from twenty-five', async ({ page }) => {
    await signInCitizen(page, 'srx-bulk', ids.bulk)
    await visit(page, '/app/resources')
    await expect(row(page, `${names.bulkPrefix} 01`)).toBeVisible({ timeout: 25_000 })
    await expect.poll(async () => rowCount(page), { timeout: 15_000 }).toBe(25)
    const more = page.getByRole('button', { name: 'Show more (5 more)' })
    await expect(more).toBeVisible()
    await more.click()
    await expect.poll(async () => rowCount(page)).toBe(30)
    await expect(page.getByRole('button', { name: /Show more/ })).toHaveCount(0)

    // Another kind, then back: twenty-five again.
    const chips = page.getByRole('group', { name: 'Kind of place' })
    await chips.getByRole('button', { name: /^Pharmacies/ }).click()
    await expect(page.getByText(/No pharmacies are listed here\./)).toBeVisible()
    await chips.getByRole('button', { name: /^All/ }).click()
    await expect.poll(async () => rowCount(page)).toBe(25)

    // A different scope does the same: show more, switch to Everywhere and back — twenty-five each time it is a fresh list.
    await page.getByRole('button', { name: 'Show more (5 more)' }).click()
    await expect.poll(async () => rowCount(page)).toBe(30)
    await page.getByRole('button', { name: 'Everywhere' }).click()
    await expect(page.getByRole('button', { name: /Show more/ })).toBeVisible({ timeout: 20_000 })
    expect(await rowCount(page)).toBe(25)
    await page.getByRole('button', { name: names.bulk }).click()
    await expect.poll(async () => rowCount(page)).toBe(25)
  })

  test('the tablist works from the keyboard: arrows, Home and End move and select; Tab leads into the panel', async ({ page }) => {
    await signInCitizen(page, 'srx-tabs', ids.provinceA)
    await visit(page, '/app/resources')
    await expect(row(page, names.pharmT)).toBeVisible({ timeout: 25_000 })
    const tab = (name: string) => page.getByRole('tab', { name })

    await tab('Local resources').focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab('Aid requests')).toHaveAttribute('aria-selected', 'true')
    await expect(tab('Aid requests')).toBeFocused()
    await expect(page).toHaveURL(/tab=aid/)
    await page.keyboard.press('End')
    await expect(tab('Missing persons')).toBeFocused()
    await page.keyboard.press('ArrowRight') // wraps
    await expect(tab('Local resources')).toBeFocused()
    await page.keyboard.press('ArrowLeft') // wraps the other way
    await expect(tab('Missing persons')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tab('Local resources')).toBeFocused()
    await expect(tab('Local resources')).toHaveAttribute('aria-selected', 'true')

    // Only the chosen tab is in the tab order, and Tab from it lands inside the panel.
    await expect(tab('Aid requests')).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="tabpanel"]'))).toBe(true)
  })
})

test.describe('Resources (deferred) — the browser will not say where the visitor is', () => {
  test('blocked: says so in terms of the order, leaves the list by name and the button to try again', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => fail({ code: 1, PERMISSION_DENIED: 1, message: 'denied' }) } })
    })
    await signInCitizen(page, 'srx-res-denied', ids.provinceA)
    await visit(page, '/app/resources')
    await expect(row(page, names.pharmT)).toBeVisible({ timeout: 25_000 })
    const byName = [...(await listed(page))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    const ask = page.getByRole('button', { name: 'Nearest first' })
    await ask.click()
    await expect(page.getByRole('status').filter({ hasText: "Location is blocked for this site. Allow it in your browser's site settings to put the nearest places first." })).toBeVisible()
    expect(await listed(page)).toEqual(byName)
    await expect(page.getByText(/km away|\bm away/)).toHaveCount(0)
    await expect(ask).toBeEnabled()
  })
})

test.describe('Resources (deferred) — reporting', () => {
  test('while one report is on its way no other button can be pressed; it files exactly one report', async ({ page }) => {
    await signInCitizen(page, 'srx-busy', ids.provinceA)
    await visit(page, '/app/resources')
    await expect(row(page, names.pharmD)).toBeVisible({ timeout: 25_000 })
    await page.route(`${API}/essential-locations/*/status-reports`, async (route) => {
      if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 1800))
      await route.continue()
    })
    await page.getByRole('button', { name: `Mark ${names.pharmD} as open` }).click()
    // The other rows' buttons are locked while it is in flight…
    await expect(page.getByRole('button', { name: `Mark ${names.pharmP} as open` })).toBeDisabled()
    await expect(page.getByRole('button', { name: `Mark ${names.atm} as closed` })).toBeDisabled()
    // …and free again once it is done, with only the one place reported.
    await expect(page.getByText(`Thanks — ${names.pharmD} is now shown as open.`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: `Mark ${names.pharmP} as open` })).toBeEnabled()
    expect(readEssentialReports(ids.pharmD).map((r) => r.status)).toEqual(['open'])
    expect(readEssentialReports(ids.pharmP)).toEqual([])
    expect(readEssentialReports(ids.atm)).toEqual([])
  })

  test('open, closed, open: three reports are filed in order and the last one is what is shown', async ({ page }) => {
    const email = await signInCitizen(page, 'srx-flip', ids.provinceA)
    await visit(page, '/app/resources')
    await expect(row(page, names.atm)).toBeVisible({ timeout: 25_000 })
    await page.getByRole('button', { name: `Mark ${names.atm} as open` }).click()
    await expect(row(page, names.atm)).toContainText('Open')
    await page.getByRole('button', { name: `Mark ${names.atm} as closed` }).click()
    await expect(row(page, names.atm)).toContainText('Closed')
    await page.getByRole('button', { name: `Mark ${names.atm} as open` }).click()
    await expect(row(page, names.atm)).toContainText('Open')
    expect(readEssentialReports(ids.atm)).toEqual([
      { status: 'open', by: email },
      { status: 'closed', by: email },
      { status: 'open', by: email },
    ])
    await page.reload()
    await expect(row(page, names.atm)).toContainText('Open')
  })

  test('a place outside the home region can be reported from Everywhere', async ({ page }) => {
    const email = await signInCitizen(page, 'srx-away', ids.provinceA)
    await visit(page, '/app/resources')
    await expect(row(page, names.pharmT)).toBeVisible({ timeout: 25_000 })
    await expect(row(page, names.elsewhere)).toHaveCount(0)
    await page.getByRole('button', { name: 'Everywhere' }).click()
    // Everywhere is long (this run's thirty ATMs sort ahead), so look at the pharmacies.
    await page.getByRole('group', { name: 'Kind of place' }).getByRole('button', { name: /^Pharmacies/ }).click()
    await expect(row(page, names.elsewhere)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: `Mark ${names.elsewhere} as closed` }).click()
    await expect(page.getByText(`Thanks — ${names.elsewhere} is now shown as closed.`)).toBeVisible()
    expect(readEssentialReports(ids.elsewhere)).toEqual([{ status: 'closed', by: email }])
  })
})

test.describe('Resources (deferred) — phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the tabs scroll sideways rather than wrapping, the chips wrap, a row fits with its buttons under the name, and a report from a phone lands the same', async ({ page }) => {
    const email = await signInCitizen(page, 'srx-phone-res', ids.provinceA)
    await visit(page, '/app/resources')
    await expect(row(page, names.pharmD)).toBeVisible({ timeout: 25_000 })
    await noHorizontalOverflow(page)

    // Tabs: one line, scrolling sideways; the last one can be reached and chosen.
    const tablist = page.getByRole('tablist', { name: 'Resources' })
    const tabs = await tablist.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrolls: el.scrollWidth > el.clientWidth,
      tops: Array.from(el.querySelectorAll('[role=tab]')).map((tab) => Math.round(tab.getBoundingClientRect().top)),
    }))
    expect(tabs.overflowX).toBe('auto')
    expect(tabs.scrolls).toBe(true)
    expect(new Set(tabs.tops).size).toBe(1) // all on one line
    await page.getByRole('tab', { name: 'Missing persons' }).tap()
    await expect(page).toHaveURL(/tab=missing/)
    await page.getByRole('tab', { name: 'Local resources' }).tap()
    await expect(row(page, names.pharmD)).toBeVisible()

    // Chips wrap inside the screen.
    const chips = page.getByRole('group', { name: 'Kind of place' })
    const chipBoxes = await chips.getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })))
    expect(Math.min(...chipBoxes.map((b) => b.left))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...chipBoxes.map((b) => b.right))).toBeLessThanOrEqual(390)

    // A row with two report buttons: everything stays inside the row and the screen.
    const target = row(page, names.pharmD)
    const rowBox = (await target.boundingBox())!
    for (const button of await target.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(rowBox.x - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1)
    }
    expect(await target.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    await page.getByRole('button', { name: `Mark ${names.pharmD} as closed` }).tap()
    await expect(page.getByText(`Thanks — ${names.pharmD} is now shown as closed.`)).toBeVisible()
    await expect(row(page, names.pharmD)).toContainText('Closed')
    expect(readEssentialReports(ids.pharmD).at(-1)).toEqual({ status: 'closed', by: email })
    await noHorizontalOverflow(page)
  })
})
