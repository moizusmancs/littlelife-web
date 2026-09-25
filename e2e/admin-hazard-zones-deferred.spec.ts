import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { promoteToNgoAdmin, promoteToPlatformAdmin, readHazardZone, readZonesDeclaredBy, seedHazardZone, seedRegion, squareRing, verifyAndOnboardAccount } from './helpers/seed'
import { API, logIn, password, randomWorld, register, visit } from './helpers/citizen'

/**
 * The Hazard Zones deferred tests (plan items 21–26), against the real backend with no stubbed responses (the one route that is delayed, not
 * replaced, is the admin overlay, to see the map keep the previous zones). The world is `E2E HZX …` zones at a random spot: a forecast with a
 * confidence, a milder forecast inside it, a declared zone, and eighteen more declared ones so that today's zones make a table of 21 — two pages of 20.
 * The real table (thousands of pipeline zones) is read with `SELECT count(*)` for the totals.
 */
const { origin, at, rect, tag } = randomWorld()
const modelVersion = `e2e-hzx-${tag}`
const ids = { region: '', high: '', low: '', medium: '', filler: [] as string[] }
const short = (id: string) => id.slice(0, 8)
const today = new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd in this machine's zone, as the date inputs hold it

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const count = (sql: string) => Number(execFileSync('docker', ['exec', 'littlelife_postgres', 'psql', '-U', 'littlelife', '-d', 'littlelife', '-q', '-At', '-c', sql], { encoding: 'utf8' }).trim())
const noHorizontalOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
const row = (page: Page, id: string) => page.locator('li', { has: page.locator(`a[href="/admin/hazard-zones/${id}"]`) })
const showOnMap = (page: Page, id: string) => page.getByRole('button', { name: new RegExp(`^Show .* ${short(id)} on the map$`) })
const resolveButton = (page: Page, id: string) => page.getByRole('button', { name: new RegExp(`^Resolve .* ${short(id)}$`) })
const range = (page: Page) => page.getByText(/\d[\d,]*–\d[\d,]* of [\d,]+/).first()
const rowsShown = (page: Page) => page.getByRole('list', { name: 'Hazard zones' }).getByRole('listitem')

async function signInAdmin(page: Page, label: string) {
  const email = await register(page.request, `hzx-${label}`)
  verifyAndOnboardAccount(email, 'E2E Hazard Admin')
  promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

const declareDialog = (page: Page) => page.getByRole('dialog', { name: 'Declare a hazard zone' })
const polygon = (x1: number, y1: number, x2: number, y2: number) => [[at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]]

test.beforeAll(async () => {
  test.setTimeout(240_000)
  ids.region = seedRegion(`E2E HZX Prov ${tag}`, 'province', undefined, squareRing(origin[0], origin[1], 0.6))
  ids.high = seedHazardZone(ids.region, { ring: rect(0.1, 0.1, 0.4, 0.4), risk: 'high', confidence: 0.87, modelVersion })
  ids.low = seedHazardZone(ids.region, { ring: rect(0.15, 0.15, 0.35, 0.35), risk: 'low', confidence: 0.2, modelVersion })
  ids.medium = seedHazardZone(ids.region, { ring: rect(0.2, 0.2, 0.45, 0.45), risk: 'medium' })
  for (let i = 0; i < 18; i += 1) ids.filler.push(seedHazardZone(ids.region, { ring: rect(0.02 + i * 0.03, 0.5, 0.035 + i * 0.03, 0.515), risk: 'medium' }))
})

test.describe('Hazard zones (deferred) — paging and filters against the real table', () => {
  test('the totals are the database\'s; Next asks for offset 20; a page size of 50 asks for limit 50; a page past the end says so', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (req) => req.url().startsWith(`${API}/admin/hazard-zones?`) && asked.push(req.url().slice(API.length)))
    await signInAdmin(page, 'paging')
    await visit(page, '/admin/hazard-zones')
    const active = count(`SELECT count(*) FROM hazard_zones WHERE status = 'active'`)
    await expect(range(page)).toContainText(`1–20 of ${String(active)}`, { timeout: 25_000 })
    expect(asked[0]).toBe('/admin/hazard-zones?status=active&limit=20&offset=0')

    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(range(page)).toContainText(`21–40 of ${String(active)}`)
    expect(asked.some((url) => url.endsWith('limit=20&offset=20'))).toBe(true)

    await page.getByLabel('Rows per page').selectOption('50')
    await expect(range(page)).toContainText(`1–50 of ${String(active)}`)
    expect(asked.some((url) => url.endsWith('limit=50&offset=0'))).toBe(true)

    // Resolved has its own total.
    const resolved = count(`SELECT count(*) FROM hazard_zones WHERE status = 'resolved'`)
    await page.getByRole('group', { name: 'Zone status' }).getByRole('button', { name: 'Resolved' }).click()
    if (resolved > 0) await expect(range(page)).toContainText(`of ${String(resolved)}`, { timeout: 20_000 })
    else await expect(page.getByText('No resolved hazard zones.')).toBeVisible({ timeout: 20_000 })

    // A page past the end says so instead of showing an empty table.
    await visit(page, '/admin/hazard-zones?page=99999')
    await expect(page.getByText('There is nothing on this page. Go back to an earlier one.')).toBeVisible({ timeout: 25_000 })
  })

  test('a date range matches exactly today\'s zones (two pages: 20 and 1) and one that matches nothing says so', async ({ page }) => {
    await signInAdmin(page, 'dates')
    await visit(page, `/admin/hazard-zones?from=${today}&to=${today}`)
    await expect(range(page)).toContainText('1–20 of 21', { timeout: 25_000 })
    await expect(rowsShown(page)).toHaveCount(20)
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(range(page)).toContainText('21–21 of 21')
    await expect(rowsShown(page)).toHaveCount(1)

    await visit(page, '/admin/hazard-zones?from=2000-01-01&to=2000-01-02')
    await expect(page.getByText('No active hazard zones in those dates.')).toBeVisible({ timeout: 25_000 })
  })

  test('resolving the only row of the last page steps the table back to the page before', async ({ page }) => {
    await signInAdmin(page, 'lastpage')
    await visit(page, `/admin/hazard-zones?from=${today}&to=${today}&page=2`)
    await expect(range(page)).toContainText('21–21 of 21', { timeout: 25_000 })
    await expect(rowsShown(page)).toHaveCount(1)
    const lastId = (await rowsShown(page).first().locator('a').first().getAttribute('href'))!.split('/').pop()!
    await resolveButton(page, lastId).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Resolve zone' }).click()
    await expect(page.getByText(/is resolved and off the citizen map/)).toBeVisible()
    await expect(range(page)).toContainText('1–20 of 20', { timeout: 20_000 })
    await expect(page).not.toHaveURL(/page=2/)
    await expect(rowsShown(page)).toHaveCount(20)
    expect(readHazardZone(lastId).status).toBe('resolved')
  })
})

test.describe('Hazard zones (deferred) — an NGO admin\'s side of the role split', () => {
  test('declaring is allowed and filed as the organisation\'s (and citizens see it); resolving is refused 403; the page itself is turned away', async ({ page, request }) => {
    const email = await register(request, 'hzx-ngo')
    promoteToNgoAdmin(email, `E2E HZX NGO ${tag}`)
    await logIn(page, email, /\/ngo\/dashboard$/)
    await page.goto('/admin/hazard-zones')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)

    const login = await request.post(`${API}/auth/login`, { data: { email, password }, timeout: 30_000 })
    const token = ((await login.json()) as { access_token: string }).access_token
    const auth = { Authorization: `Bearer ${token}` }
    const declared = await request.post(`${API}/admin/hazard-zones`, {
      headers: auth,
      data: { risk_level: 'medium', boundary: { type: 'Polygon', coordinates: polygon(0.5, 0.05, 0.58, 0.13) } },
    })
    expect(declared.status()).toBe(201)
    const zone = (await declared.json()) as { id: string }
    expect(readHazardZone(zone.id)).toMatchObject({ source: 'manual_ngo', risk: 'medium', status: 'active', createdBy: email })

    const box = `${origin[0]},${origin[1]},${origin[0] + 0.6},${origin[1] + 0.6}`
    const citizen = (await (await request.get(`${API}/map/flood-overlay?bbox=${box}`)).json()) as Array<{ hazard_zone_id: string }>
    expect(citizen.map((entry) => entry.hazard_zone_id)).toContain(zone.id)

    const refused = await request.patch(`${API}/admin/hazard-zones/${zone.id}/resolve`, { headers: auth })
    expect(refused.status()).toBe(403)
    expect(((await refused.json()) as { error: string }).error).toBe('insufficient permissions')
    expect(readHazardZone(zone.id).status).toBe('active')
  })
})

test.describe('Hazard zones (deferred) — the map at scale', () => {
  test('the whole country at slider 0 answers in seconds and collapses to one outline per distinct boundary; at 0.34 it shows what citizens see', async ({ page, request }) => {
    const bodies: Array<{ url: string; ms: number; entries: Array<{ hazard_zone_id: string; boundary: unknown }> }> = []
    const started = new Map<string, number>()
    page.on('request', (req) => req.url().includes('/admin/map/flood-overlay') && started.set(req.url(), Date.now()))
    page.on('response', async (res) => {
      if (res.url().includes('/admin/map/flood-overlay') && res.ok()) bodies.push({ url: res.url(), ms: Date.now() - (started.get(res.url()) ?? Date.now()), entries: (await res.json()) as Array<{ hazard_zone_id: string; boundary: unknown }> })
    })
    await signInAdmin(page, 'scale')
    await visit(page, '/admin/hazard-zones')
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0)
    const whole = bodies[bodies.length - 1]
    const [w, , e] = new URL(whole.url).searchParams.get('bbox')!.split(',').map(Number)
    expect(e - w).toBeGreaterThan(15) // the country
    expect(whole.ms).toBeLessThan(15_000)
    expect(whole.entries.length).toBeGreaterThan(500)
    const distinct = new Set(whole.entries.map((entry) => JSON.stringify(entry.boundary))).size
    expect(distinct).toBeLessThan(whole.entries.length)
    await expect.poll(async () => page.locator('path.hazard-zone').count(), { timeout: 20_000 }).toBe(distinct)

    // The slider at 0.34 is the citizen's own floor: the same zones the citizen route returns for the same box.
    const before = bodies.length
    await page.getByRole('slider').fill('0.34')
    await expect.poll(() => bodies.length, { timeout: 15_000 }).toBeGreaterThan(before)
    const floored = bodies[bodies.length - 1]
    expect(new URL(floored.url).searchParams.get('min_confidence')).toBe('0.34')
    const box = new URL(floored.url).searchParams.get('bbox')!
    const citizen = (await (await request.get(`${API}/map/flood-overlay?bbox=${box}`)).json()) as Array<{ hazard_zone_id: string }>
    expect(new Set(floored.entries.map((entry) => entry.hazard_zone_id))).toEqual(new Set(citizen.map((entry) => entry.hazard_zone_id)))
    const flooredDistinct = new Set(floored.entries.map((entry) => JSON.stringify(entry.boundary))).size
    await expect.poll(async () => page.locator('path.hazard-zone').count(), { timeout: 20_000 }).toBe(flooredDistinct)

    // Still responsive: a zoom answers at once, and the previous outlines stay drawn while the next box is on its way.
    await page.route(`${API}/admin/map/flood-overlay*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Zoom in' }).click({ timeout: 3000 })
    await page.waitForTimeout(900)
    expect(await page.locator('path.hazard-zone').count()).toBeGreaterThan(0)
  })
})

test.describe('Hazard zones (deferred) — declaring, edge by edge', () => {
  const declareFrom = async (page: Page, geometry: object, risk: 'low' | 'medium' | 'high') => {
    const dialog = declareDialog(page)
    await dialog.getByLabel('Boundary file').setInputFiles({ name: 'zone.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geometry)) })
    await expect(dialog.getByRole('img', { name: "The zone's outline" })).toBeVisible()
    await dialog.getByLabel('Risk level').selectOption(risk)
    await dialog.getByRole('button', { name: 'Declare zone' }).click()
    await expect(page.getByText(/Hazard zone declared \(#/)).toBeVisible({ timeout: 15_000 })
    await expect(declareDialog(page)).toHaveCount(0)
  }

  test('an uploaded Feature, a FeatureCollection of one, and a ring with altitude are each accepted; a polygon with a hole keeps both its rings; one over an existing zone is a second zone', async ({ page }) => {
    const email = await signInAdmin(page, 'declare')
    await visit(page, `/admin/hazard-zones?from=${today}&to=${today}&size=100`)
    await expect(range(page)).toContainText('of', { timeout: 25_000 })
    const open = () => page.getByRole('button', { name: 'Declare hazard zone' }).click()
    const ring = (x1: number, y1: number, x2: number, y2: number) => polygon(x1, y1, x2, y2)[0].map(([lng, lat]) => [lng, lat])

    await open()
    await declareFrom(page, { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(0.3, 0.3, 0.36, 0.36)] } }, 'medium')
    await open()
    await declareFrom(page, { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(0.37, 0.3, 0.43, 0.36)] } }] }, 'low')
    await open()
    await declareFrom(page, { type: 'Polygon', coordinates: [ring(0.44, 0.3, 0.5, 0.36).map(([lng, lat]) => [lng, lat, 120])] }, 'high')
    await open()
    // A square with a square hole in it.
    await declareFrom(page, { type: 'Polygon', coordinates: [ring(0.5, 0.3, 0.58, 0.38), ring(0.52, 0.32, 0.56, 0.36)] }, 'medium')

    const declared = readZonesDeclaredBy(email) // newest first
    expect(declared).toHaveLength(4)
    const stored = declared.map((id) => readHazardZone(id))
    expect(stored.map((zone) => zone.risk)).toEqual(['medium', 'high', 'low', 'medium'])
    expect(stored.map((zone) => zone.vertices)).toEqual([10, 5, 5, 5]) // the hole is kept (5 + 5 points); altitude is dropped
    expect(stored.every((zone) => zone.source === 'manual_admin' && zone.status === 'active')).toBe(true)

    // Over an existing zone: the same outline as the declared medium zone — a second zone, both listed, and the first untouched.
    await open()
    await declareFrom(page, { type: 'Polygon', coordinates: [ring(0.2, 0.2, 0.45, 0.45)] }, 'high')
    const overExisting = readZonesDeclaredBy(email)[0]
    await expect(row(page, overExisting)).toBeVisible({ timeout: 20_000 })
    await expect(row(page, ids.medium)).toBeVisible()
    expect(readHazardZone(ids.medium).status).toBe('active')
  })

  test('Escape closes the dialog without declaring anything, and it opens empty the next time', async ({ page }) => {
    const email = await signInAdmin(page, 'escape')
    await visit(page, '/admin/hazard-zones')
    await expect(range(page)).toBeVisible({ timeout: 25_000 })
    await page.getByRole('button', { name: 'Declare hazard zone' }).click()
    const dialog = declareDialog(page)
    await dialog.getByLabel('Boundary (GeoJSON Polygon)').fill('{ half typed')
    await dialog.getByLabel('Risk level').selectOption('high')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(readZonesDeclaredBy(email)).toEqual([])
    await page.getByRole('button', { name: 'Declare hazard zone' }).click()
    await expect(declareDialog(page).getByLabel('Boundary (GeoJSON Polygon)')).toHaveValue('')
    await expect(declareDialog(page).getByLabel('Risk level')).toHaveValue('')
  })
})

test.describe('Hazard zones (deferred) — keyboard and screen reader', () => {
  test('the buttons are named, the pills and the slider say their state, and focus returns to the row\'s button after the dialog closes', async ({ page }) => {
    await signInAdmin(page, 'keys')
    await visit(page, `/admin/hazard-zones?from=${today}&to=${today}&size=50`)
    await expect(row(page, ids.medium)).toBeVisible({ timeout: 25_000 })

    // Named icon buttons: "Show <title> <id> on the map" and "Resolve <title> <id>".
    await expect(showOnMap(page, ids.low)).toHaveAttribute('aria-label', `Show Low-risk flood zone ${short(ids.low)} on the map`)
    await expect(resolveButton(page, ids.medium)).toHaveAttribute('aria-label', `Resolve Medium-risk hazard zone ${short(ids.medium)}`)

    // The pills report which is chosen; the slider says what its value means.
    const status = page.getByRole('group', { name: 'Zone status' })
    await expect(status.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true')
    await expect(status.getByRole('button', { name: 'Resolved' })).toHaveAttribute('aria-pressed', 'false')
    const slider = page.getByRole('slider')
    await expect(slider).toHaveAttribute('aria-valuetext', 'Show every model zone')
    await slider.fill('0.5')
    await expect(slider).toHaveAttribute('aria-valuetext', 'At least 50% confidence')
    await slider.fill('0')

    // Keyboard: focus the row's Resolve button, open the dialog with Enter, close it — and focus is back where it was.
    const button = resolveButton(page, ids.medium)
    await button.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Resolve this hazard zone?' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()

    await button.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(button).toBeFocused()
    expect(readHazardZone(ids.medium).status).toBe('active')
  })
})

test.describe('Hazard zones (deferred) — phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('List ⇄ Map keeps the map where it was; Show on map goes to the map; the pane scrolls as one; both dialogs fit; a zone\'s page has no overflow', async ({ page }) => {
    await signInAdmin(page, 'phone')
    await visit(page, `/admin/hazard-zones?from=${today}&to=${today}&size=50`)
    await expect(row(page, ids.medium)).toBeVisible({ timeout: 25_000 })
    await noHorizontalOverflow(page)

    // The pane scrolls as one: the filters go up with the rows (they are not pinned above them).
    const pane = page.getByRole('region', { name: 'Hazard zones' })
    expect(await pane.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')
    const filtersTop = async () => (await page.getByRole('group', { name: 'Zone status' }).boundingBox())!.y
    const beforeScroll = await filtersTop()
    await pane.evaluate((el) => el.scrollBy(0, 250))
    await page.waitForTimeout(200)
    expect(await filtersTop()).toBeLessThan(beforeScroll - 100)
    await pane.evaluate((el) => el.scrollTo(0, 0))

    // Show on map: the Map pane comes up with the zone drawn.
    await showOnMap(page, ids.medium).tap()
    const view = page.getByRole('group', { name: 'View' })
    await expect(view.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    const outline = page.locator('path.hazard-zone.hazard-medium').first()
    await expect(outline).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => {
        const first = await outline.boundingBox()
        await page.waitForTimeout(700)
        const second = await outline.boundingBox()
        return !!first && !!second && Math.abs(first.x - second.x) < 1 && Math.abs(first.y - second.y) < 1
      }, { timeout: 15_000 })
      .toBe(true)

    // List and back: the map is where it was.
    const before = (await outline.boundingBox())!
    await view.getByRole('button', { name: 'List' }).tap()
    await expect(row(page, ids.medium)).toBeVisible()
    await view.getByRole('button', { name: 'Map' }).tap()
    await expect(outline).toBeVisible()
    await page.waitForTimeout(700)
    const after = (await outline.boundingBox())!
    expect(Math.abs(after.x - before.x)).toBeLessThan(2)
    expect(Math.abs(after.y - before.y)).toBeLessThan(2)

    // Both dialogs fit the screen.
    await page.getByRole('button', { name: 'Declare hazard zone' }).tap()
    const declare = declareDialog(page)
    await expect(declare).toBeVisible()
    const declareBox = (await declare.boundingBox())!
    expect(declareBox.x).toBeGreaterThanOrEqual(0)
    expect(declareBox.x + declareBox.width).toBeLessThanOrEqual(390)
    expect(declareBox.y + declareBox.height).toBeLessThanOrEqual(844)
    await noHorizontalOverflow(page)
    await page.keyboard.press('Escape')
    await expect(declare).toHaveCount(0)

    await view.getByRole('button', { name: 'List' }).tap()
    await resolveButton(page, ids.medium).tap()
    const resolve = page.getByRole('dialog', { name: 'Resolve this hazard zone?' })
    await expect(resolve).toBeVisible()
    const resolveBox = (await resolve.boundingBox())!
    expect(resolveBox.x).toBeGreaterThanOrEqual(0)
    expect(resolveBox.x + resolveBox.width).toBeLessThanOrEqual(390)
    expect(resolveBox.y + resolveBox.height).toBeLessThanOrEqual(844)
    await resolve.getByRole('button', { name: 'Cancel' }).tap()

    await page.goto(`/admin/hazard-zones/${ids.medium}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Medium-risk hazard zone' })).toBeVisible()
    await noHorizontalOverflow(page)
  })
})
