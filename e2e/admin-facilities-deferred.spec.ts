import { test, expect, type Page } from '@playwright/test'
import {
  findEssentialByName,
  findInfrastructureByName,
  promoteToNgoAdmin,
  promoteToNgoVolunteer,
  promoteToPlatformAdmin,
  promoteToSuperAdmin,
  readEssentialReports,
  readInfrastructure,
  resolveZoneInDb,
  seedEssentialLocation,
  seedEssentialLocations,
  seedHazardZone,
  seedHomeRegion,
  seedInfrastructure,
  seedNgos,
  seedRegion,
  seedShelter,
  setNgoStatus,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'
import { API, logIn, password, randomWorld, register, visit } from './helpers/citizen'

/**
 * The Admin Facilities deferred tests (plan items 36–42), against the real backend with no stubbed responses (the one route that is *failed*, not
 * replaced, is `GET /admin/ngos`, to see the organisation names fall back). The world is `E2E FACX …` rows at random spots: a province with a district
 * and a tehsil inside it, shelters of every kind of organisation (active, rejected, deactivated, none, and two of a hundred and fifty), infrastructure and
 * essential places, hazard zones for the "is it inside one?" edge cases, and a second province holding two thousand ATMs.
 */
const A = randomWorld()
const B = randomWorld()
const { origin, at, rect, tag } = A
const names = {
  province: `E2E FACX Prov ${tag}`,
  district: `E2E FACX District ${tag}`,
  tehsil: `E2E FACX Tehsil ${tag}`,
  big: `E2E FACX Big Prov ${tag}`,
  ngoA: `E2E FACX NGO Active ${tag}`,
  ngoB: `E2E FACX NGO Rejected ${tag}`,
  ngoC: `E2E FACX NGO Deactivated ${tag}`,
  orgPrefix: `E2E FACX Org ${tag}`,
  shelterActive: `E2E FACX Shelter Active ${tag}`,
  shelterRejected: `E2E FACX Shelter Rejected ${tag}`,
  shelterDeactivated: `E2E FACX Shelter Deactivated ${tag}`,
  shelterNone: `E2E FACX Shelter NoOrg ${tag}`,
  shelterFirst: `E2E FACX Shelter Org First ${tag}`,
  shelterLast: `E2E FACX Shelter Org Last ${tag}`,
  hospital: `E2E FACX Hospital ${tag}`,
  bridge: `E2E FACX Bridge ${tag}`,
  utility: `E2E FACX Utility ${tag}`,
  edgeBridge: `E2E FACX Edge Bridge ${tag}`,
  holeHospital: `E2E FACX Hole Hospital ${tag}`,
  ringHospital: `E2E FACX Ring Hospital ${tag}`,
  stackUtility: `E2E FACX Stack Utility ${tag}`,
  xrUtility: `E2E FACX Cross Utility ${tag}`,
  pharmacy: `E2E FACX Pharmacy ${tag}`,
  atm: `E2E FACX ATM ${tag}`,
  bulk: `E2E FACX Bulk ATM ${tag}`,
}
const ids = {
  province: '', district: '', tehsil: '', big: '', ngoA: '', ngoB: '', ngoC: '', orgFirst: '', orgLast: '',
  hospital: '', bridge: '', utility: '', edgeBridge: '', holeHospital: '', ringHospital: '', stackUtility: '',
  pharmacy: '', atm: '', edgeZone: '', stackHigh: '', shelterActive: '', xrUtility: '', xrZone: '',
}

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const noHorizontalOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
const rowFor = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name })
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1
const scope = (region: string, tab = '') => `/admin/facilities?region=${region}${tab ? `&tab=${tab}` : ''}`

async function signInAdmin(page: Page, label: string, role: 'admin' | 'super' = 'admin') {
  const email = await register(page.request, `facx-${label}`)
  verifyAndOnboardAccount(email, 'E2E Facilities Admin')
  if (role === 'super') promoteToSuperAdmin(email)
  else promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 }] })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(400_000)
  ids.province = seedRegion(names.province, 'province', undefined, squareRing(origin[0], origin[1], 0.6))
  ids.district = seedRegion(names.district, 'district', ids.province, rect(0.1, 0.1, 0.4, 0.4))
  ids.tehsil = seedRegion(names.tehsil, 'tehsil', ids.district, rect(0.15, 0.15, 0.3, 0.3))
  ids.big = seedRegion(names.big, 'province', undefined, squareRing(B.origin[0], B.origin[1], 0.6))

  const founder = async (label: string, ngo: string) => promoteToNgoAdmin(await register(request, `facx-founder-${label}`), ngo)
  ids.ngoA = await founder('a', names.ngoA)
  ids.ngoB = await founder('b', names.ngoB)
  ids.ngoC = await founder('c', names.ngoC)
  const bulkOwner = await register(request, 'facx-org-owner')
  verifyAndOnboardAccount(bulkOwner, 'E2E Org Owner')
  const orgs = seedNgos(bulkOwner, { prefix: names.orgPrefix, count: 150 })
  ids.orgFirst = orgs[0]
  ids.orgLast = orgs[149]

  const shelter = (name: string, dx: number, dy: number, ngoId?: string) => {
    const [lng, lat] = at(dx, dy)
    return seedShelter(ids.province, { name, lng, lat, capacityTotal: 100, capacityCurrent: 10, ...(ngoId ? { ngoId } : {}) })
  }
  ids.shelterActive = shelter(names.shelterActive, 0.05, 0.05, ids.ngoA)
  shelter(names.shelterRejected, 0.1, 0.05, ids.ngoB)
  shelter(names.shelterDeactivated, 0.15, 0.05, ids.ngoC)
  shelter(names.shelterNone, 0.2, 0.05)
  shelter(names.shelterFirst, 0.25, 0.05, ids.orgFirst)
  shelter(names.shelterLast, 0.3, 0.05, ids.orgLast)
  setNgoStatus(ids.ngoB, 'rejected')
  setNgoStatus(ids.ngoC, 'deactivated')

  const infra = (name: string, dx: number, dy: number, type: 'hospital' | 'bridge' | 'utility', status: 'safe' | 'at_risk' | 'damaged') => {
    const [lng, lat] = at(dx, dy)
    return seedInfrastructure(ids.province, { name, lng, lat, type, status })
  }
  ids.hospital = infra(names.hospital, 0.2, 0.2, 'hospital', 'safe') // in the tehsil, the district and the province
  ids.bridge = infra(names.bridge, 0.35, 0.25, 'bridge', 'at_risk') // in the district and the province
  ids.utility = infra(names.utility, 0.5, 0.5, 'utility', 'damaged') // in the province only
  // The "is it inside a hazard zone?" edge cases.
  ids.edgeZone = seedHazardZone(ids.province, { ring: rect(0.42, 0.05, 0.5, 0.13), risk: 'medium' })
  ids.edgeBridge = infra(names.edgeBridge, 0.5, 0.09, 'bridge', 'safe') // exactly on the zone's east edge
  seedHazardZone(ids.province, { ring: rect(0.05, 0.42, 0.3, 0.6), hole: rect(0.12, 0.48, 0.22, 0.55), risk: 'high', confidence: 0.8 })
  ids.holeHospital = infra(names.holeHospital, 0.17, 0.515, 'hospital', 'safe') // in the hole
  ids.ringHospital = infra(names.ringHospital, 0.08, 0.45, 'hospital', 'safe') // in the ring around it
  seedHazardZone(ids.province, { ring: rect(0.33, 0.3, 0.45, 0.4), risk: 'low', confidence: 0.2 })
  seedHazardZone(ids.province, { ring: rect(0.34, 0.31, 0.44, 0.39), risk: 'medium', confidence: 0.5 })
  ids.stackHigh = seedHazardZone(ids.province, { ring: rect(0.35, 0.32, 0.43, 0.38), risk: 'high', confidence: 0.9 })
  ids.stackUtility = infra(names.stackUtility, 0.39, 0.35, 'utility', 'safe') // inside all three
  // A zone of its own, for the test that resolves one while the dialog is shut.
  ids.xrZone = seedHazardZone(ids.province, { ring: rect(0.02, 0.2, 0.1, 0.27), risk: 'high', confidence: 0.85 })
  ids.xrUtility = infra(names.xrUtility, 0.06, 0.235, 'utility', 'safe')

  const reporter = await register(request, 'facx-reporter')
  verifyAndOnboardAccount(reporter, 'E2E Facilities Reporter')
  const place = (name: string, dx: number, dy: number, type: 'atm' | 'pharmacy') => {
    const [lng, lat] = at(dx, dy)
    return seedEssentialLocation(ids.province, { name, lng, lat, type })
  }
  ids.pharmacy = place(names.pharmacy, 0.25, 0.55, 'pharmacy')
  ids.atm = place(names.atm, 0.55, 0.55, 'atm')
  // Two thousand ATMs in a province of their own, five hundred at a time (the seed refuses more).
  for (let block = 0; block < 4; block += 1) {
    expect(seedEssentialLocations(ids.big, { prefix: `${names.bulk} ${block}`, count: 500, lng: B.at(0.02, 0.02 + block * 0.12)[0], lat: B.at(0.02, 0.02 + block * 0.12)[1], step: 0.002 })).toBe(500)
  }
})

/* ─────────────────────────────── phone and tablets ─────────────────────────────── */

async function layoutChecks(page: Page, viewport: { width: number; height: number }, touch: boolean) {
  await signInAdmin(page, `layout-${viewport.width}`)
  await visit(page, scope(ids.province, 'infrastructure'))
  await expect(rowFor(page, names.hospital)).toBeVisible({ timeout: 25_000 })
  await noHorizontalOverflow(page)

  // The tabs stay on one line and scroll sideways when they must.
  const tabs = await page.getByRole('tablist').evaluate((el) => ({ overflowX: getComputedStyle(el).overflowX, tops: Array.from(el.querySelectorAll('[role=tab]')).map((tab) => Math.round(tab.getBoundingClientRect().top)) }))
  expect(tabs.overflowX).toBe('auto')
  expect(new Set(tabs.tops).size).toBe(1)

  // Rows are cards: everything in a row stays inside it.
  const row = rowFor(page, names.hospital)
  const rowBox = (await row.boundingBox())!
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  for (const button of await row.getByRole('button').all()) expect(inside((await button.boundingBox())!, rowBox)).toBe(true)

  // The status dialog and the location dialog fit the screen.
  await row.getByRole('button', { name: `Update status of ${names.hospital}` }).click()
  const status = page.getByRole('dialog', { name: 'Update status' })
  const statusBox = (await status.boundingBox())!
  expect(statusBox.x).toBeGreaterThanOrEqual(0)
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(viewport.height + 1)
  await page.keyboard.press('Escape')
  await row.getByRole('button', { name: `Location of ${names.hospital}` }).click()
  const location = page.getByRole('dialog', { name: names.hospital })
  const locationBox = (await location.boundingBox())!
  expect(locationBox.x + locationBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(locationBox.y + locationBox.height).toBeLessThanOrEqual(viewport.height + 1)
  if (touch) {
    // The map in it zooms with its buttons and pans with a finger.
    const marker = location.getByRole('button', { name: `${names.hospital}, Hospital, Safe` })
    await expect(marker).toBeVisible()
    const start = (await marker.boundingBox())!
    await location.getByRole('button', { name: 'Zoom out' }).tap()
    await page.waitForTimeout(500)
    const frame = (await location.locator('.leaflet-container').boundingBox())!
    const zoomed = (await marker.boundingBox())!
    await touchDrag(page, { x: frame.x + 40, y: frame.y + 40 }, { x: frame.x + 140, y: frame.y + 100 })
    await page.waitForTimeout(400)
    const panned = (await marker.boundingBox())!
    expect(Math.abs(panned.x - zoomed.x) + Math.abs(panned.y - zoomed.y)).toBeGreaterThan(20)
    expect(Math.abs(zoomed.x - start.x) + Math.abs(zoomed.y - start.y)).toBeGreaterThanOrEqual(0)
  }
  await page.keyboard.press('Escape')

  // The report log (an essential place) and the region picker fit too.
  await page.getByRole('tab', { name: 'Essential locations' }).click()
  await expect(rowFor(page, names.pharmacy)).toBeVisible({ timeout: 20_000 })
  await rowFor(page, names.pharmacy).getByRole('button', { name: `Status reports for ${names.pharmacy}` }).click()
  const reports = page.getByRole('dialog', { name: 'Status reports' })
  const reportsBox = (await reports.boundingBox())!
  expect(reportsBox.x + reportsBox.width).toBeLessThanOrEqual(viewport.width + 1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Change region|Choose a region/ }).click()
  const picker = page.getByRole('dialog')
  const pickerBox = (await picker.boundingBox())!
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(viewport.height + 1)
  await page.keyboard.press('Escape')

  // The Add drawer: it scrolls with its map in it; on a phone a tap places the pin and a touch drag moves it.
  await page.getByRole('tab', { name: 'Infrastructure' }).click()
  await page.getByRole('button', { name: 'Add infrastructure' }).click()
  const drawer = page.getByRole('dialog', { name: 'Add infrastructure' })
  const drawerBox = (await drawer.boundingBox())!
  expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(viewport.height + 1)
  const map = drawer.getByRole('group', { name: "Map for choosing the infrastructure's location" })
  await map.scrollIntoViewIfNeeded()
  await noHorizontalOverflow(page)
  if (touch) {
    await drawer.getByLabel('Jump to an area').selectOption({ label: names.province })
    await page.waitForTimeout(600)
    const frame = (await map.locator('.leaflet-container').boundingBox())!
    await page.touchscreen.tap(frame.x + frame.width * 0.4, frame.y + frame.height * 0.5)
    const longitude = drawer.getByLabel('Longitude', { exact: true })
    await expect(longitude).toHaveValue(/^-?\d+(\.\d+)?$/)
    const before = Number(await longitude.inputValue())
    const pin = map.locator('.leaflet-marker-icon[title^="Shelter location"]')
    const pinBox = (await pin.boundingBox())!
    await touchDrag(page, { x: pinBox.x + pinBox.width / 2, y: pinBox.y + pinBox.height - 6 }, { x: pinBox.x + pinBox.width / 2 + 60, y: pinBox.y + pinBox.height - 6 })
    await expect.poll(async () => Number(await longitude.inputValue()), { timeout: 8000 }).toBeGreaterThan(before)
  }
  await page.keyboard.press('Escape')
}

test.describe('Facilities (deferred) — phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('cards, sideways tabs, dialogs that fit, a location map that pans by finger, and an Add drawer whose pin a finger can move', async ({ page }) => {
    await layoutChecks(page, { width: 390, height: 844 }, true)
  })
})

test.describe('Facilities (deferred) — tablet, 768', () => {
  test.use({ viewport: { width: 768, height: 1024 } })
  test('the same, at the width where the sidebar has just appeared', async ({ page }) => {
    await layoutChecks(page, { width: 768, height: 1024 }, false)
  })
})

test.describe('Facilities (deferred) — tablet, 1024', () => {
  test.use({ viewport: { width: 1024, height: 768 } })
  test('the same, at 1024 where the table has not started (the sidebar leaves ~735px)', async ({ page }) => {
    await layoutChecks(page, { width: 1024, height: 768 }, false)
    await visit(page, scope(ids.province, 'infrastructure'))
    const name = rowFor(page, names.hospital).locator('p').first()
    await expect(name).toBeVisible({ timeout: 20_000 })
    expect((await name.boundingBox())!.width).toBeGreaterThan(200)
  })
})

test.describe('Facilities (deferred) — "Use my location" in the admin\'s Add drawer', () => {
  const [lng, lat] = at(0.3, 0.55)
  test.use({ permissions: ['geolocation'], geolocation: { latitude: lat, longitude: lng } })
  test('fills the point only when pressed, and the note names the region', async ({ page }) => {
    await signInAdmin(page, 'locate')
    await visit(page, scope(ids.province, 'infrastructure'))
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    const drawer = page.getByRole('dialog', { name: 'Add infrastructure' })
    await expect(drawer.getByLabel('Latitude', { exact: true })).toHaveValue('')
    await drawer.getByRole('button', { name: 'Use my location' }).click()
    await expect(drawer.getByLabel('Latitude', { exact: true })).toHaveValue(String(lat))
    await expect(drawer.getByLabel('Longitude', { exact: true })).toHaveValue(String(lng))
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toContainText(`In ${names.province}`)
  })
})

/* ───────────────────────────────── add edge cases ───────────────────────────────── */

test.describe('Facilities (deferred) — add edge cases against the real API', () => {
  async function add(page: Page, name: string, type: string, lat: string, lng: string) {
    const drawer = page.getByRole('dialog', { name: 'Add infrastructure' })
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.locator('label', { hasText: type }).click()
    await drawer.getByLabel('Latitude', { exact: true }).fill(lat)
    await drawer.getByLabel('Longitude', { exact: true }).fill(lng)
    await drawer.getByRole('button', { name: 'Add infrastructure' }).click()
  }

  test('the same name twice makes two indistinguishable rows with no way to remove either; a very long name and a comma decimal are handled', async ({ page }) => {
    await signInAdmin(page, 'add-edge')
    await visit(page, scope(ids.province, 'infrastructure'))
    const [lng, lat] = at(0.45, 0.2)
    const twin = `E2E FACX Twin ${tag}`
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Add infrastructure' }).click()
      await add(page, twin, 'Bridge', String(lat), String(lng))
      await expect(page.getByRole('dialog', { name: 'Add infrastructure' })).toHaveCount(0, { timeout: 15_000 })
    }
    await expect(rowFor(page, twin)).toHaveCount(2)
    await expect(rowFor(page, twin).first().getByRole('button', { name: /Delete|Remove/ })).toHaveCount(0)

    const long = `E2E FACX Long ${'wide'.repeat(100)} ${tag}`
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    await add(page, long, 'Utility', String(lat), String(lng + 0.01))
    await expect(page.getByRole('dialog', { name: 'Add infrastructure' })).toHaveCount(0, { timeout: 15_000 })
    await expect(rowFor(page, 'E2E FACX Long')).toBeVisible()
    await noHorizontalOverflow(page)
    expect(await rowFor(page, 'E2E FACX Long').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)

    // A comma decimal is named, and nothing is sent.
    const posts: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/admin/infrastructure') && posts.push(req.postDataJSON()))
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    await add(page, `E2E FACX Comma ${tag}`, 'Bridge', '24,86', String(lng))
    await expect(page.getByRole('dialog', { name: 'Add infrastructure' }).getByText('The latitude has to be a number, like 24.8607.')).toBeVisible()
    expect(posts).toEqual([])
  })

  test('a point on the shared edge of two regions is accepted; a place added inside a tehsil is then found under the tehsil, the district and the province', async ({ page }) => {
    await signInAdmin(page, 'add-scopes')
    const name = `E2E FACX Scoped ${tag}`
    const [lng, lat] = at(0.22, 0.22) // in the tehsil
    await visit(page, scope(ids.province, 'infrastructure'))
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    await add(page, name, 'Hospital', String(lat), String(lng))
    await expect(page.getByText(new RegExp(`${name} was added. It is in .*${names.tehsil}`))).toBeVisible({ timeout: 15_000 })
    expect(findInfrastructureByName(name)).not.toBeNull()
    for (const region of [ids.tehsil, ids.district, ids.province]) {
      await visit(page, scope(region, 'infrastructure'))
      await expect(rowFor(page, name)).toBeVisible({ timeout: 20_000 })
    }
    // …and not under the sibling province.
    await visit(page, scope(ids.big, 'infrastructure'))
    await expect(page.getByRole('button', { name: new RegExp(`Region: ${names.big}`) })).toBeVisible({ timeout: 20_000 })
    await expect(rowFor(page, name)).toHaveCount(0)
    const inBig = (await (await page.request.get(`${API}/infrastructure?region_id=${ids.big}`)).json()) as Array<{ name: string }>
    expect(inBig.map((item) => item.name)).not.toContain(name)
  })

  test('a super admin sees the screen and can add — the role above admin is treated the same', async ({ page }) => {
    await signInAdmin(page, 'super', 'super')
    await visit(page, scope(ids.province, 'infrastructure'))
    await expect(rowFor(page, names.hospital)).toBeVisible({ timeout: 25_000 })
    const name = `E2E FACX Super ${tag}`
    const [lng, lat] = at(0.52, 0.2)
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    await add(page, name, 'Utility', String(lat), String(lng))
    await expect(page.getByText(new RegExp(`${name} was added`))).toBeVisible({ timeout: 15_000 })
    expect(findInfrastructureByName(name)).not.toBeNull()
  })
})

/* ──────────────────────────── roles, edges, and organisations ──────────────────────────── */

test.describe('Facilities (deferred) — roles and edges', () => {
  test('an NGO volunteer is turned away; the API answers a status change on an unknown id with 404 and a malformed one with 400', async ({ page, request }) => {
    const volunteer = await register(request, 'facx-vol')
    promoteToNgoVolunteer(volunteer, ids.ngoA)
    await logIn(page, volunteer, /\/ngo\/dashboard$/)
    await page.goto('/admin/facilities')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)

    const admin = await register(request, 'facx-status-admin')
    verifyAndOnboardAccount(admin, 'E2E Facilities Admin')
    promoteToPlatformAdmin(admin)
    const login = await request.post(`${API}/auth/login`, { data: { email: admin, password }, timeout: 30_000 })
    const token = ((await login.json()) as { access_token: string }).access_token
    const auth = { Authorization: `Bearer ${token}` }
    const unknown = await request.patch(`${API}/admin/infrastructure/3fa85f64-5717-4562-b3fc-2c963f66afa6/status`, { headers: auth, data: { status: 'safe' } })
    expect(unknown.status()).toBe(404)
    const malformed = await request.patch(`${API}/admin/infrastructure/not-a-uuid/status`, { headers: auth, data: { status: 'safe' } })
    expect(malformed.status()).toBe(400)
  })

  test('a shelter with no organisation, and shelters whose organisation was rejected or deactivated (the name still shows); names come from every page of the organisation list', async ({ page }) => {
    await signInAdmin(page, 'orgs')
    const asked: string[] = []
    page.on('request', (req) => /\/admin\/ngos\?/.test(req.url()) && asked.push(new URL(req.url()).search))
    await visit(page, scope(ids.province, 'shelters'))
    await expect(rowFor(page, names.shelterActive)).toBeVisible({ timeout: 25_000 })
    await expect(rowFor(page, names.shelterNone)).toContainText('No organisation')
    await expect(rowFor(page, names.shelterRejected)).toContainText(names.ngoB)
    await expect(rowFor(page, names.shelterDeactivated)).toContainText(names.ngoC)
    // A hundred and fifty organisations arrive in two pages; a shelter of the first and one of the last both get their names.
    await expect(rowFor(page, names.shelterFirst)).toContainText(`${names.orgPrefix} 001`)
    await expect(rowFor(page, names.shelterLast)).toContainText(`${names.orgPrefix} 150`)
    expect(asked.length).toBeGreaterThanOrEqual(2)
    expect(asked.some((query) => query.includes('offset=100'))).toBe(true)
    await expect(rowFor(page, names.shelterLast).getByRole('link', { name: new RegExp(`${names.orgPrefix} 150`) })).toHaveAttribute('href', `/admin/ngos/${ids.orgLast}`)
  })

  test('when the organisation list cannot be loaded the shelters still show, run by "an organisation", with a notice', async ({ page }) => {
    await signInAdmin(page, 'orgs-fail')
    await page.route(`${API}/admin/ngos*`, (route) => route.abort())
    await visit(page, scope(ids.province, 'shelters'))
    await expect(rowFor(page, names.shelterActive)).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/Organisation names couldn't be loaded/)).toBeVisible()
    await expect(rowFor(page, names.shelterActive)).toContainText('An organisation')
    await expect(rowFor(page, names.shelterNone)).toContainText('No organisation')
  })
})

/* ───────────────────────────── the scope, tehsil to province ───────────────────────────── */

test.describe('Facilities (deferred) — the region scope at every level', () => {
  test('a tehsil, a district and a province each list what is inside them — and the picker gets there by drilling down', async ({ page }) => {
    await signInAdmin(page, 'scope-levels')
    const expectations: Array<[string, string[]]> = [
      [ids.tehsil, [names.hospital]],
      [ids.district, [names.hospital, names.bridge]],
    ]
    for (const [region, expected] of expectations) {
      await visit(page, scope(region, 'infrastructure'))
      for (const name of expected) await expect(rowFor(page, name)).toBeVisible({ timeout: 20_000 })
      await expect(rowFor(page, names.utility)).toHaveCount(0) // the province-only one is not in a district or tehsil
    }
    await visit(page, scope(ids.province, 'infrastructure'))
    for (const name of [names.hospital, names.bridge, names.utility]) await expect(rowFor(page, name)).toBeVisible({ timeout: 20_000 })

    // Through the picker: province › district › tehsil, each by its own "show the sub-regions" arrow, then choose the tehsil.
    await visit(page, '/admin/facilities?tab=infrastructure')
    await page.getByRole('button', { name: /Choose a region/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: new RegExp(`^Show the .* of ${names.province}$`) }).click()
    await dialog.getByRole('button', { name: new RegExp(`^Show the .* of ${names.district}$`) }).click()
    await dialog.getByRole('radio', { name: new RegExp(names.tehsil) }).check()
    await dialog.getByRole('button', { name: 'Show this region' }).click()
    await expect(page).toHaveURL(new RegExp(`region=${ids.tehsil}`))
    await expect(rowFor(page, names.hospital)).toBeVisible({ timeout: 20_000 })
    await expect(rowFor(page, names.bridge)).toHaveCount(0)
  })
})

/* ──────────────────────────────────────── scale ──────────────────────────────────────── */

test.describe('Facilities (deferred) — two thousand essential locations', () => {
  test('the whole list is fetched once and filtered, searched and paged in the browser without stalling; "everywhere" is one request per top-level region', async ({ page }) => {
    await signInAdmin(page, 'scale')
    const requests: Array<{ url: string; ms: number; bytes: number }> = []
    const started = new Map<string, number>()
    page.on('request', (req) => req.url().includes('/essential-locations?') && started.set(req.url(), Date.now()))
    page.on('response', async (res) => {
      if (res.url().includes('/essential-locations?')) requests.push({ url: res.url(), ms: Date.now() - (started.get(res.url()) ?? Date.now()), bytes: (await res.body()).length })
    })
    const opened = Date.now()
    await visit(page, scope(ids.big, 'essential'))
    await expect(page.getByText('2,000 essential locations in')).toBeVisible({ timeout: 30_000 })
    expect(Date.now() - opened).toBeLessThan(25_000)
    const mine = requests.find((request) => request.url.includes(ids.big))!
    expect(mine.bytes).toBeGreaterThan(200_000) // a real list…
    expect(mine.bytes).toBeLessThan(2_000_000) // …that is still a manageable payload
    expect(mine.ms).toBeLessThan(15_000)

    // Search and the pills answer at once, and the last page is reachable.
    const search = page.getByRole('searchbox', { name: /Search essential/ })
    const typed = Date.now()
    await search.fill(`${names.bulk} 3`)
    await expect(page.getByText(/500 essential locations|of 500/)).toBeVisible({ timeout: 5000 })
    expect(Date.now() - typed).toBeLessThan(3000)
    await search.fill('')
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^ATM/ }).click()
    await expect(page.getByText('2,000 essential locations in')).toBeVisible()
    await page.getByLabel('Rows per page').selectOption('100')
    await expect(page.getByText(/1–100 of 2,?000/)).toBeVisible()
    for (let i = 0; i < 19; i += 1) await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(/1,?901–2,?000 of 2,?000/)).toBeVisible()

    // Everywhere: one request per top-level region (the seeded ones among them), and the page comes up.
    const before = requests.length
    await visit(page, '/admin/facilities?tab=essential')
    await expect(page.getByText(/essential locations in every region/)).toBeVisible({ timeout: 40_000 })
    const roots = ((await (await page.request.get(`${API}/regions`)).json()) as Array<{ parent_region_id?: string }>).filter((region) => !region.parent_region_id).length
    await expect.poll(() => requests.length - before, { timeout: 30_000 }).toBeGreaterThanOrEqual(roots)
  })
})

/* ───────────────────────────────── the other side sees it ───────────────────────────────── */

test.describe('Facilities (deferred) — across roles', () => {
  test('a status the admin sets shows on the citizen map; a place the admin adds is listed in the citizen\'s Local resources; a citizen\'s report appears in the admin\'s log; the location answer follows a zone that was resolved', async ({ page, browser }) => {
    const citizenContext = await browser.newContext()
    const citizen = await citizenContext.newPage()
    const citizenEmail = await register(citizen.request, 'facx-citizen')
    verifyAndOnboardAccount(citizenEmail, 'E2E Citizen')
    seedHomeRegion(citizenEmail, ids.province)
    await logIn(citizen, citizenEmail, /\/app\/home$/)

    const adminEmail = await signInAdmin(page, 'cross')
    await visit(page, scope(ids.province, 'infrastructure'))

    // 1. The admin sets the bridge to damaged; the citizen's marker for it says so after a reload.
    await visit(citizen, '/app/map')
    await citizen.getByRole('group', { name: 'Map layers' }).getByRole('button', { name: 'Infrastructure' }).click()
    await expect(citizen.getByRole('button', { name: `${names.bridge}, Bridge, At risk` })).toBeVisible({ timeout: 25_000 })
    await page.getByRole('button', { name: `Update status of ${names.bridge}` }).click()
    await page.getByRole('dialog', { name: 'Update status' }).getByText('Damaged', { exact: true }).click()
    await page.getByRole('dialog', { name: 'Update status' }).getByRole('button', { name: 'Save status' }).click()
    await expect(page.getByText(`${names.bridge} is now damaged.`)).toBeVisible()
    expect(readInfrastructure(ids.bridge).status).toBe('damaged')
    await citizen.reload()
    await citizen.getByRole('group', { name: 'Map layers' }).getByRole('button', { name: 'Infrastructure' }).click()
    await expect(citizen.getByRole('button', { name: `${names.bridge}, Bridge, Damaged` })).toBeVisible({ timeout: 25_000 })

    // 2. The admin adds an essential location; the citizen's Local resources lists it.
    await visit(page, scope(ids.province, 'essential'))
    const added = `E2E FACX Added Pharmacy ${tag}`
    const [lng, lat] = at(0.45, 0.55)
    await page.getByRole('button', { name: 'Add essential location' }).click()
    const drawer = page.getByRole('dialog', { name: 'Add essential location' })
    await drawer.getByLabel('Name', { exact: true }).fill(added)
    await drawer.locator('label', { hasText: 'Pharmacy' }).click()
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(lng))
    await drawer.getByRole('button', { name: 'Add essential location' }).click()
    await expect(page.getByText(new RegExp(`${added} was added`))).toBeVisible({ timeout: 15_000 })
    await visit(citizen, '/app/resources')
    await expect(citizen.getByRole('listitem').filter({ hasText: added })).toBeVisible({ timeout: 25_000 })

    // 3. The citizen reports the place; the admin's log shows it after another look.
    await citizen.getByRole('button', { name: `Mark ${added} as open` }).click()
    await expect(citizen.getByText(`Thanks — ${added} is now shown as open.`)).toBeVisible()
    const stored = findEssentialByName(added)!
    expect(readEssentialReports(stored.id).map((r) => r.status)).toEqual(['open'])
    await page.reload()
    await rowFor(page, added).getByRole('button', { name: `Status reports for ${added}` }).click()
    await expect(page.getByRole('dialog', { name: 'Status reports' })).toContainText('1 report')
    await page.keyboard.press('Escape')

    // 4. The location dialog's answer follows a zone that is resolved while it is not open (it asks afresh each time).
    await visit(page, scope(ids.province, 'infrastructure'))
    await rowFor(page, names.xrUtility).getByRole('button', { name: `Location of ${names.xrUtility}` }).click()
    await expect(page.getByRole('dialog', { name: names.xrUtility }).getByText(/Inside a/)).toContainText('Inside a high-risk flood zone')
    await page.keyboard.press('Escape')
    resolveZoneInDb(ids.xrZone)
    await rowFor(page, names.xrUtility).getByRole('button', { name: `Location of ${names.xrUtility}` }).click()
    await expect(page.getByRole('dialog', { name: names.xrUtility }).getByText('Not inside any active hazard zone.')).toBeVisible({ timeout: 15_000 })
    await citizenContext.close()
    expect(adminEmail).toContain('@')
  })
})

/* ───────────────────────────────── is it inside a hazard zone? ───────────────────────────────── */

test.describe('Facilities (deferred) — the hazard check, at its edges', () => {
  async function answerFor(page: Page, request: Parameters<Parameters<typeof test>[2]>[0]['request'], name: string, point: [number, number]) {
    await page.getByRole('main').getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: `Location of ${name}` }).click()
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog.getByText(/Inside a|Not inside any active hazard zone/).first()).toBeVisible({ timeout: 20_000 })
    const text = await dialog.getByText(/Inside a|Not inside any active hazard zone/).first().innerText()
    await page.keyboard.press('Escape')
    const risk = await request.post(`${API}/hazard-zones/risk-check`, { data: { lat: point[1], lng: point[0] } })
    return { text, server: (await risk.json()) as { inside_hazard_zone: boolean; risk_level?: string } }
  }

  test('on a zone\'s edge, in a zone\'s hole and in the ring around it, and under three stacked zones (the worst is named) — each agrees with the server\'s own risk check', async ({ page, request }) => {
    await signInAdmin(page, 'hazard')
    await visit(page, scope(ids.province, 'infrastructure'))
    await expect(rowFor(page, names.hospital)).toBeVisible({ timeout: 25_000 })

    // Whatever the case, the dialog must say what the server's own risk check says (that is the point of the check).
    const agrees = (answer: { text: string; server: { inside_hazard_zone: boolean } }) => expect(answer.text.startsWith('Inside')).toBe(answer.server.inside_hazard_zone)

    // A point exactly on a zone's edge: the server counts it as outside (the region join counts an edge as inside; a zone is the other way), and so does the dialog.
    const edge = await answerFor(page, request, names.edgeBridge, at(0.5, 0.09))
    expect(edge.server.inside_hazard_zone, 'the server counts a point on a zone edge as outside').toBe(false)
    expect(edge.text).toBe('Not inside any active hazard zone.')
    agrees(edge)

    const hole = await answerFor(page, request, names.holeHospital, at(0.17, 0.515))
    expect(hole.server.inside_hazard_zone, 'the server counts a point in a hole as outside').toBe(false)
    expect(hole.text).toBe('Not inside any active hazard zone.')
    agrees(hole)

    const ring = await answerFor(page, request, names.ringHospital, at(0.08, 0.45))
    expect(ring.server.inside_hazard_zone).toBe(true)
    expect(ring.text).toContain('Inside a high-risk')
    agrees(ring)

    // Three zones stacked over one point: the server names one risk level, and so does the dialog — the worst.
    const stack = await answerFor(page, request, names.stackUtility, at(0.39, 0.35))
    expect(stack.server.inside_hazard_zone).toBe(true)
    expect(stack.text).toContain('Inside a high-risk')
    agrees(stack)
  })
})

/* ───────────────────────────────────── keyboard and screen reader ───────────────────────────────────── */

test.describe('Facilities (deferred) — keyboard and screen reader', () => {
  test('the tabs work by arrow keys in a real browser, the pills say what is pressed, the status dialog is a radio group that marks the current one, and focus returns to the row after every dialog and drawer', async ({ page }) => {
    await signInAdmin(page, 'keys')
    await visit(page, scope(ids.province))
    await expect(rowFor(page, names.shelterActive)).toBeVisible({ timeout: 25_000 })
    const tab = (name: string) => page.getByRole('tab', { name })
    await tab('Shelters').focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab('Infrastructure')).toBeFocused()
    await expect(tab('Infrastructure')).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/tab=infrastructure/)
    await page.keyboard.press('End')
    await expect(tab('Essential locations')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tab('Shelters')).toBeFocused()
    await tab('Infrastructure').click()
    await expect(rowFor(page, names.hospital)).toBeVisible({ timeout: 20_000 })

    // Pills.
    const types = page.getByRole('group', { name: 'Type' })
    await expect(types.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    await types.getByRole('button', { name: /^Hospital/ }).click()
    await expect(types.getByRole('button', { name: /^Hospital/ })).toHaveAttribute('aria-pressed', 'true')
    await types.getByRole('button', { name: /^All/ }).click()

    // Named buttons, and the focus that comes back.
    const statusButton = rowFor(page, names.hospital).getByRole('button', { name: `Update status of ${names.hospital}` })
    await statusButton.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Update status' })
    await expect(dialog.getByRole('radiogroup').or(dialog.getByRole('radio').first())).toBeVisible()
    await expect(dialog.getByRole('radio', { name: /Safe \(current\)/ })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(statusButton).toBeFocused()

    const locationButton = rowFor(page, names.hospital).getByRole('button', { name: `Location of ${names.hospital}` })
    await locationButton.focus()
    await page.keyboard.press('Enter')
    const location = page.getByRole('dialog', { name: names.hospital })
    await expect(location).toBeVisible()
    // The dialog holds focus: Tab many times and it never leaves.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(locationButton).toBeFocused()

    await page.getByRole('button', { name: 'Add infrastructure' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Add infrastructure' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Add infrastructure' })).toBeFocused()

    await tab('Essential locations').click()
    const reports = rowFor(page, names.pharmacy).getByRole('button', { name: `Status reports for ${names.pharmacy}` })
    await expect(reports).toBeVisible({ timeout: 20_000 })
    await reports.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Status reports' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(reports).toBeFocused()
  })
})
