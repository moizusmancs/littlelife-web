import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  deleteShelter,
  detachFromNgo,
  findShelterByName,
  makeNgoAdminOf,
  promoteToNgoAdmin,
  promoteToNgoVolunteer,
  readShelter,
  seedHazardZone,
  seedRegion,
  seedShelter,
  seedShelters,
  setNgoStatus,
  setShelterNumbers,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'
import { API, logIn, password, randomWorld, register, visit } from './helpers/citizen'

/**
 * The NGO Shelters deferred tests (plan items 28–34), against the real backend with no stubbed responses. The world is `E2E NGOX …` rows at a random
 * spot: two neighbouring provinces that share an edge (for a point on the border), a shelter for each test that changes one (the tests are serial and
 * must not share), organisations for an empty list, a deactivated one and a hundred-shelter one, and a shelter with no organisation at all.
 */
const w = randomWorld()
const { origin, at, tag } = w
const names = {
  left: `E2E NGOX Left ${tag}`,
  right: `E2E NGOX Right ${tag}`,
  ngoA: `E2E NGOX A ${tag}`,
  ngoB: `E2E NGOX B ${tag}`,
  ngoC: `E2E NGOX C ${tag}`,
  ngoD: `E2E NGOX D ${tag}`,
  ngoE: `E2E NGOX E ${tag}`,
  layout: `E2E NGOX Layout ${tag}`,
  occ: `E2E NGOX Occupancy ${tag}`,
  edit: `E2E NGOX Edit ${tag}`,
  gone: `E2E NGOX Gone ${tag}`,
  cross: `E2E NGOX Cross ${tag}`,
  keys: `E2E NGOX Keys ${tag}`,
  orphan: `E2E NGOX Orphan ${tag}`,
  bulk: `E2E NGOX Bulk ${tag}`,
}
const ids = { left: '', right: '', ngoA: '', ngoB: '', ngoC: '', ngoD: '', ngoE: '', layout: '', occ: '', edit: '', gone: '', cross: '', keys: '', orphan: '' }

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const noHorizontalOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
const rowFor = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name })
const drawerOf = (page: Page) => page.getByRole('dialog', { name: 'Register a shelter' })
const insideBox = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1

async function openShelters(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'Shelters' }).click()
  await expect(page).toHaveURL(/\/ngo\/shelters/)
  await expect(page.getByRole('heading', { level: 1, name: 'Shelters' })).toBeVisible()
}

/** A real `ngo_admin` / `ngo_volunteer` of one of the seeded organisations, signed in through the UI and on the NGO dashboard. */
async function signInStaff(page: Page, label: string, ngoId: string, role: 'admin' | 'volunteer' = 'admin') {
  const email = await register(page.request, `ngox-${label}`)
  if (role === 'admin') makeNgoAdminOf(email, ngoId)
  else promoteToNgoVolunteer(email, ngoId)
  await logIn(page, email, /\/ngo\/dashboard$/)
  return email
}

async function staffIn(browser: Browser, label: string, ngoId: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = await signInStaff(page, label, ngoId)
  return { context, page, email }
}

async function tokenOf(page: Page, email: string) {
  const res = await page.request.post(`${API}/auth/login`, { data: { email, password }, timeout: 30_000 })
  return ((await res.json()) as { access_token: string }).access_token
}

/** Touch-drags from one point to another with real touch events (Playwright's own touchscreen can only tap). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 }] })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000)
  ids.left = seedRegion(names.left, 'province', undefined, squareRing(origin[0], origin[1], 0.5))
  ids.right = seedRegion(names.right, 'province', undefined, squareRing(origin[0] + 0.5, origin[1], 0.5))
  const founder = async (label: string, ngo: string) => promoteToNgoAdmin(await register(request, `ngox-founder-${label}`), ngo)
  ids.ngoA = await founder('a', names.ngoA)
  ids.ngoB = await founder('b', names.ngoB)
  ids.ngoC = await founder('c', names.ngoC)
  ids.ngoD = await founder('d', names.ngoD)
  ids.ngoE = await founder('e', names.ngoE)

  const shelter = (name: string, dx: number, dy: number, ngoId: string | undefined, more: Partial<Parameters<typeof seedShelter>[1]> = {}) => {
    const [lng, lat] = at(dx, dy)
    return seedShelter(ids.left, { name, lng, lat, capacityTotal: 200, capacityCurrent: 100, ...(ngoId ? { ngoId } : {}), ...more })
  }
  ids.layout = shelter(names.layout, 0.1, 0.1, ids.ngoA, { capacityTotal: 400, capacityCurrent: 265 })
  ids.occ = shelter(names.occ, 0.15, 0.1, ids.ngoA)
  ids.edit = shelter(names.edit, 0.2, 0.1, ids.ngoA, { certification: 'pending' })
  ids.gone = shelter(names.gone, 0.25, 0.1, ids.ngoA)
  ids.cross = shelter(names.cross, 0.3, 0.1, ids.ngoA, { capacityTotal: 400, capacityCurrent: 120 })
  ids.keys = shelter(names.keys, 0.35, 0.1, ids.ngoA)
  ids.orphan = shelter(names.orphan, 0.4, 0.1, undefined)
  seedHazardZone(ids.left, { ring: [at(0.05, 0.05), at(0.2, 0.05), at(0.2, 0.2), at(0.05, 0.2), at(0.05, 0.05)], risk: 'high', confidence: 0.87 })
  expect(seedShelters(ids.left, { prefix: names.bulk, count: 100, lng: at(0.02, 0.3)[0], lat: at(0.02, 0.3)[1], ngoId: ids.ngoE })).toBe(100)
})

/* ─────────────────────────── layout at 390 (touch), 768 and 1024 ─────────────────────────── */

async function layoutChecks(page: Page, viewport: { width: number; height: number }, touch: boolean) {
  await signInStaff(page, `layout-${viewport.width}`, ids.ngoA)
  await visit(page, '/ngo/shelters') // below `md` the sidebar is an off-canvas drawer, so the link is not there to click
  await expect(page.getByRole('heading', { level: 1, name: 'Shelters' })).toBeVisible()
  await expect(rowFor(page, names.layout)).toBeVisible({ timeout: 20_000 })
  await noHorizontalOverflow(page)

  // The row is a card: everything in it stays inside it.
  const row = rowFor(page, names.layout)
  const rowBox = (await row.boundingBox())!
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  for (const button of await row.getByRole('button').all()) expect(insideBox((await button.boundingBox())!, rowBox)).toBe(true)
  for (const link of await row.getByRole('link').all()) expect(insideBox((await link.boundingBox())!, rowBox)).toBe(true)

  // The occupancy editor opens inside the row and fits it.
  await row.getByRole('button', { name: `Update occupancy for ${names.layout}` }).click()
  const editor = row.getByRole('form', { name: `Update occupancy of ${names.layout}` })
  await expect(editor).toBeVisible()
  const editorBox = (await editor.boundingBox())!
  expect(insideBox(editorBox, (await row.boundingBox())!)).toBe(true)
  for (const button of await editor.getByRole('button').all()) expect(insideBox((await button.boundingBox())!, editorBox)).toBe(true)
  await noHorizontalOverflow(page)
  await row.getByRole('button', { name: 'Cancel' }).click()

  // The register drawer fits the screen, scrolls with its map inside it, and the fields and the map are one value.
  await page.getByRole('button', { name: 'Register shelter' }).click()
  const drawer = drawerOf(page)
  await expect(drawer).toBeVisible()
  const drawerBox = (await drawer.boundingBox())!
  expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(viewport.height + 1)
  const map = drawer.getByRole('group', { name: "Map for choosing the shelter's location" })
  await map.scrollIntoViewIfNeeded()
  await noHorizontalOverflow(page)
  const frame = (await map.locator('.leaflet-container').boundingBox())!
  expect(insideBox(frame, drawerBox)).toBe(true)

  if (touch) {
    // A tap places the pin, and a touch drag of the pin moves it: the fields follow.
    await drawer.getByLabel('Jump to an area').selectOption({ label: names.left })
    await page.waitForTimeout(600)
    await page.touchscreen.tap(frame.x + frame.width * 0.4, frame.y + frame.height * 0.5)
    const latitude = drawer.getByLabel('Latitude', { exact: true })
    await expect(latitude).toHaveValue(/^-?\d+(\.\d+)?$/)
    const before = { lat: Number(await latitude.inputValue()), lng: Number(await drawer.getByLabel('Longitude', { exact: true }).inputValue()) }
    const pin = map.locator('.leaflet-marker-icon[title^="Shelter location"]')
    await expect(pin).toBeVisible()
    const pinBox = (await pin.boundingBox())!
    await touchDrag(page, { x: pinBox.x + pinBox.width / 2, y: pinBox.y + pinBox.height - 6 }, { x: pinBox.x + pinBox.width / 2 + 50, y: pinBox.y + pinBox.height - 6 + 40 })
    await expect.poll(async () => Number(await drawer.getByLabel('Longitude', { exact: true }).inputValue()), { timeout: 8000 }).toBeGreaterThan(before.lng)
    await expect.poll(async () => Number(await latitude.inputValue()), { timeout: 8000 }).toBeLessThan(before.lat)
  }
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)

  // The edit drawer and the detail page fit too.
  await page.getByRole('button', { name: `Edit ${names.layout}` }).click()
  const edit = page.getByRole('dialog', { name: 'Edit shelter' })
  const editBox = (await edit.boundingBox())!
  expect(editBox.x + editBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(editBox.y + editBox.height).toBeLessThanOrEqual(viewport.height + 1)
  await page.keyboard.press('Escape')
  await page.goto(`/ngo/shelters/${ids.layout}`)
  await expect(page.getByRole('heading', { level: 1, name: names.layout })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Location' }).locator('.leaflet-container')).toBeVisible()
  await noHorizontalOverflow(page)
}

test.describe('NGO shelters (deferred) — phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('rows are stacked cards, the editor and both drawers fit, a tap places the pin and a touch drag moves it, and the detail page has no overflow', async ({ page }) => {
    await layoutChecks(page, { width: 390, height: 844 }, true)
  })
})

test.describe('NGO shelters (deferred) — tablet, 768', () => {
  test.use({ viewport: { width: 768, height: 1024 } })
  test('rows are two-column cards with the actions at the top right; nothing overflows', async ({ page }) => {
    await layoutChecks(page, { width: 768, height: 1024 }, false)
    // The actions sit at the top right of the card, beside the name, not under it.
    await page.goto('/ngo/shelters')
    const row = rowFor(page, names.layout)
    await expect(row).toBeVisible({ timeout: 20_000 })
    const view = (await row.getByRole('link', { name: `View ${names.layout}` }).boundingBox())!
    const rowBox = (await row.boundingBox())!
    expect(view.x).toBeGreaterThan(rowBox.x + rowBox.width / 2)
    expect(view.y).toBeLessThan(rowBox.y + rowBox.height / 2)
  })
})

test.describe('NGO shelters (deferred) — tablet, 1024', () => {
  test.use({ viewport: { width: 1024, height: 768 } })
  test('the table has not started yet (the sidebar leaves ~735px): still cards, nothing crushed', async ({ page }) => {
    await layoutChecks(page, { width: 1024, height: 768 }, false)
    await page.goto('/ngo/shelters')
    const name = rowFor(page, names.layout).locator('p').first()
    await expect(name).toBeVisible({ timeout: 20_000 })
    expect((await name.boundingBox())!.width).toBeGreaterThan(200) // the name column is not crushed to a few letters
  })
})

test.describe('NGO shelters (deferred) — "Use my location" in the register drawer', () => {
  const [lng, lat] = at(0.3, 0.3)
  test.use({ permissions: ['geolocation'], geolocation: { latitude: lat, longitude: lng } })

  test('fills the point from the browser only when pressed, moves the map there, and the note names the region', async ({ page }) => {
    await signInStaff(page, 'locate', ids.ngoA)
    await openShelters(page)
    await page.getByRole('button', { name: 'Register shelter' }).click()
    const drawer = drawerOf(page)
    await expect(drawer.getByLabel('Latitude', { exact: true })).toHaveValue('')
    await drawer.getByRole('button', { name: 'Use my location' }).click()
    await expect(drawer.getByLabel('Latitude', { exact: true })).toHaveValue(String(lat))
    await expect(drawer.getByLabel('Longitude', { exact: true })).toHaveValue(String(lng))
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toContainText(`In ${names.left}`)
    await expect(drawer.getByRole('group', { name: "Map for choosing the shelter's location" }).locator('.leaflet-marker-icon[title^="Shelter location"]')).toBeVisible()
  })
})

/* ───────────────────────────────── register edge cases ───────────────────────────────── */

test.describe('NGO shelters (deferred) — register edge cases against the real API', () => {
  async function fill(page: Page, name: string, capacity: string, lat: string, lng: string) {
    const drawer = drawerOf(page)
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.getByLabel('Capacity', { exact: true }).fill(capacity)
    await drawer.getByLabel('Latitude', { exact: true }).fill(lat)
    await drawer.getByLabel('Longitude', { exact: true }).fill(lng)
  }
  const submit = (page: Page) => drawerOf(page).getByRole('button', { name: 'Register shelter' }).click()

  test('a capacity of exactly 2,147,483,647 is a real 201; one more never leaves the browser; a comma decimal is refused as "has to be a number"', async ({ page }) => {
    await signInStaff(page, 'edge-cap', ids.ngoA)
    await openShelters(page)
    const posts: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/ngo/shelters') && posts.push(req.postDataJSON()))
    await page.getByRole('button', { name: 'Register shelter' }).click()
    const [lng, lat] = at(0.3, 0.2)

    await fill(page, `E2E NGOX Over ${tag}`, '2147483648', String(lat), String(lng))
    await submit(page)
    await expect(drawerOf(page).getByText('The largest capacity is 2,147,483,647.')).toBeVisible()
    expect(posts).toEqual([])

    await fill(page, `E2E NGOX Comma ${tag}`, '10', '24,86', String(lng))
    await submit(page)
    await expect(drawerOf(page).getByText('The latitude has to be a number, like 24.8607.')).toBeVisible()
    expect(posts).toEqual([])

    await fill(page, `E2E NGOX Max ${tag}`, '2147483647', String(lat), String(lng))
    await submit(page)
    await expect(page.getByText(`E2E NGOX Max ${tag} is registered.`)).toBeVisible({ timeout: 15_000 })
    expect(posts).toHaveLength(1)
    expect(findShelterByName(`E2E NGOX Max ${tag}`)).toMatchObject({ capacityTotal: 2147483647, capacityCurrent: 0 })
    expect(findShelterByName(`E2E NGOX Over ${tag}`)).toBeNull()
  })

  test('a very long name is accepted by the API and shown without breaking the list or the detail page; the same name twice makes two shelters', async ({ page }) => {
    await signInStaff(page, 'edge-name', ids.ngoA)
    await openShelters(page)
    const long = `E2E NGOX Long ${'wide'.repeat(100)} ${tag}`
    const [lng, lat] = at(0.32, 0.2)
    await page.getByRole('button', { name: 'Register shelter' }).click()
    await fill(page, long, '30', String(lat), String(lng))
    await submit(page)
    await expect(page.getByText(/is registered\./)).toBeVisible({ timeout: 15_000 })
    const stored = findShelterByName(long)!
    expect(stored).not.toBeNull()
    await expect(rowFor(page, 'E2E NGOX Long')).toBeVisible()
    await noHorizontalOverflow(page)
    expect(await rowFor(page, 'E2E NGOX Long').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    await noHorizontalOverflow(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    // Twice: both are created and both are listed — the API allows it, and nothing tells them apart but the row.
    const twin = `E2E NGOX Twin ${tag}`
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Register shelter' }).click()
      await fill(page, twin, '30', String(lat), String(lng))
      await submit(page)
      await expect(drawerOf(page)).toHaveCount(0, { timeout: 15_000 })
    }
    await expect(rowFor(page, twin)).toHaveCount(2)
  })

  test('a point exactly on the border between two regions is accepted by the drawer — and the API lists it for both regions', async ({ page, request }) => {
    await signInStaff(page, 'edge-border', ids.ngoA)
    await openShelters(page)
    const border = `E2E NGOX Border ${tag}`
    const [lng, lat] = at(0.5, 0.25) // the shared edge of the two provinces
    await page.getByRole('button', { name: 'Register shelter' }).click()
    await fill(page, border, '30', String(lat), String(lng))
    // It is in a region as far as the drawer is concerned (a point on an edge belongs to the region), so it can be saved.
    await expect(drawerOf(page).getByText(/citizens looking at that region will see it/)).toBeVisible({ timeout: 10_000 })
    await expect(drawerOf(page).getByText(/outside the shaded areas/)).toHaveCount(0)
    await submit(page)
    await expect(page.getByText(`${border} is registered.`)).toBeVisible({ timeout: 15_000 })

    for (const region of [ids.left, ids.right]) {
      const listed = (await (await request.get(`${API}/shelters?region_id=${region}`)).json()) as Array<{ name: string }>
      expect(listed.map((s) => s.name)).toContain(border)
    }
  })

  test('a point in no region: the API takes it (201) and lists it for the organisation, but no region query and no citizen ever returns it', async ({ page, request }) => {
    const email = await signInStaff(page, 'edge-outside', ids.ngoA)
    const token = await tokenOf(page, email)
    const name = `E2E NGOX Nowhere ${tag}`
    const [lng, lat] = at(3, 3)
    const created = await request.post(`${API}/ngo/shelters`, { headers: { Authorization: `Bearer ${token}` }, data: { name, type: 'shelter', capacity_total: 10, location: { type: 'Point', coordinates: [lng, lat] } } })
    expect(created.status()).toBe(201)
    const mine = (await (await request.get(`${API}/ngo/shelters`, { headers: { Authorization: `Bearer ${token}` } })).json()) as Array<{ name: string }>
    expect(mine.map((s) => s.name)).toContain(name)
    const regions = (await (await request.get(`${API}/regions`)).json()) as Array<{ id: string }>
    for (const region of regions) {
      const listed = (await (await request.get(`${API}/shelters?region_id=${region.id}`)).json()) as Array<{ name: string }>
      expect(listed.map((s) => s.name), `region ${region.id}`).not.toContain(name)
    }
    // …and the drawer would not have let it through.
    await openShelters(page)
    await page.getByRole('button', { name: 'Register shelter' }).click()
    await fill(page, `E2E NGOX Nowhere UI ${tag}`, '10', String(lat), String(lng))
    await expect(drawerOf(page).getByText(/outside the shaded areas/)).toBeVisible({ timeout: 10_000 })
    await submit(page)
    await expect(drawerOf(page).getByText('Pick a spot inside a shaded area of the map.')).toBeVisible()
    expect(findShelterByName(`E2E NGOX Nowhere UI ${tag}`)).toBeNull()
  })
})

/* ──────────────────────────── roles and organisations ──────────────────────────── */

test.describe('NGO shelters (deferred) — roles and organisations', () => {
  test('an organisation with no shelters: a volunteer is told who can register one; an admin is offered it and registers the first from the empty state', async ({ page, browser }) => {
    await signInStaff(page, 'empty-vol', ids.ngoC, 'volunteer')
    await openShelters(page)
    await expect(page.getByRole('heading', { name: 'No shelters yet' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Your organisation hasn't registered a shelter yet. An organisation admin can register one")).toBeVisible()
    await expect(page.getByRole('button', { name: /Register (a )?shelter/ })).toHaveCount(0)

    const admin = await staffIn(browser, 'empty-admin', ids.ngoC)
    await openShelters(admin.page)
    await expect(admin.page.getByRole('heading', { name: 'No shelters yet' })).toBeVisible({ timeout: 20_000 })
    await admin.page.getByRole('button', { name: 'Register a shelter' }).click()
    const drawer = drawerOf(admin.page)
    const [lng, lat] = at(0.4, 0.4)
    await drawer.getByLabel('Name', { exact: true }).fill(`E2E NGOX First ${tag}`)
    await drawer.getByLabel('Capacity', { exact: true }).fill('50')
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(lng))
    await drawer.getByRole('button', { name: 'Register shelter' }).click()
    await expect(admin.page.getByText(`E2E NGOX First ${tag} is registered.`)).toBeVisible({ timeout: 15_000 })
    await expect(rowFor(admin.page, `E2E NGOX First ${tag}`)).toBeVisible()
    expect(findShelterByName(`E2E NGOX First ${tag}`)).toMatchObject({ ngoId: ids.ngoC })
    await admin.context.close()
  })

  test('a shelter with no managing organisation, opened by an admin, is read-only with the notice', async ({ page }) => {
    await signInStaff(page, 'no-org', ids.ngoA)
    await page.goto(`/ngo/shelters/${ids.orphan}`)
    await expect(page.getByRole('heading', { level: 1, name: names.orphan })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/run by another organisation/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit shelter' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Update occupancy' })).toHaveCount(0)
  })

  test('staff of a deactivated organisation can still register and update (the API has no guard — a recorded gap), and the screen does not pretend otherwise', async ({ page }) => {
    setNgoStatus(ids.ngoD, 'deactivated')
    await signInStaff(page, 'deactivated', ids.ngoD)
    await openShelters(page)
    await expect(page.getByRole('heading', { name: 'No shelters yet' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Register a shelter' }).click()
    const [lng, lat] = at(0.42, 0.42)
    const name = `E2E NGOX Deactivated ${tag}`
    await drawerOf(page).getByLabel('Name', { exact: true }).fill(name)
    await drawerOf(page).getByLabel('Capacity', { exact: true }).fill('40')
    await drawerOf(page).getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawerOf(page).getByLabel('Longitude', { exact: true }).fill(String(lng))
    await drawerOf(page).getByRole('button', { name: 'Register shelter' }).click()
    await expect(page.getByText(`${name} is registered.`)).toBeVisible({ timeout: 15_000 })
    expect(findShelterByName(name)).toMatchObject({ ngoId: ids.ngoD })
    await rowFor(page, name).getByRole('button', { name: `Update occupancy for ${name}` }).click()
    await rowFor(page, name).getByRole('textbox', { name: `People currently at ${name}` }).fill('12')
    await rowFor(page, name).getByRole('button', { name: 'Save occupancy' }).click()
    await expect(page.getByText(`Occupancy at ${name} is now 12 / 40.`)).toBeVisible()
    setNgoStatus(ids.ngoD, 'active')
  })

  test('an NGO admin with no organisation gets the real 403 on the page, in words, with a way to try again', async ({ page, request }) => {
    const email = await register(request, 'ngox-orphan-admin')
    promoteToNgoAdmin(email, `E2E NGOX Detached ${tag}`)
    detachFromNgo(email)
    await logIn(page, email, /\/ngo\/dashboard$/)
    await openShelters(page)
    await expect(page.getByRole('alert')).toContainText('account is not affiliated with an ngo', { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    // The header still offers Register (the page cannot know why the list failed); trying it gets the API's own refusal, in the drawer, and nothing is created.
    const name = `E2E NGOX Detached ${tag}`
    const [lng, lat] = at(0.45, 0.45)
    await page.getByRole('button', { name: 'Register shelter' }).click()
    await drawerOf(page).getByLabel('Name', { exact: true }).fill(name)
    await drawerOf(page).getByLabel('Capacity', { exact: true }).fill('10')
    await drawerOf(page).getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawerOf(page).getByLabel('Longitude', { exact: true }).fill(String(lng))
    await drawerOf(page).getByRole('button', { name: 'Register shelter' }).click()
    await expect(drawerOf(page).getByRole('alert')).toContainText('account is not affiliated with an ngo', { timeout: 15_000 })
    expect(findShelterByName(name)).toBeNull()
  })
})

/* ─────────────────────────────────── concurrency ─────────────────────────────────── */

test.describe('NGO shelters (deferred) — two people at once', () => {
  test('two admins editing the same shelter: each sends only what they changed, so neither overwrites the other', async ({ page, browser }) => {
    await signInStaff(page, 'conc-1', ids.ngoA)
    await openShelters(page)
    const second = await staffIn(browser, 'conc-2', ids.ngoA)
    await openShelters(second.page)
    await expect(rowFor(second.page, names.edit)).toBeVisible({ timeout: 20_000 })

    // Both open the editor while the shelter is Open and pending certification.
    await page.getByRole('button', { name: `Edit ${names.edit}` }).click()
    await second.page.getByRole('button', { name: `Edit ${names.edit}` }).click()
    const first = page.getByRole('dialog', { name: 'Edit shelter' })
    const other = second.page.getByRole('dialog', { name: 'Edit shelter' })
    await expect(other.getByRole('radio', { name: /^Open/ })).toBeChecked()

    const patches: unknown[] = []
    second.page.on('request', (req) => req.method() === 'PATCH' && patches.push(req.postDataJSON()))
    await first.locator('label', { hasText: 'Closed' }).click()
    await first.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`${names.edit} was updated.`)).toBeVisible()
    expect(readShelter(ids.edit).status).toBe('closed')

    // The second admin's form still says Open — it is a stale picture — but they only change the certification.
    await expect(other.getByRole('radio', { name: /^Open/ })).toBeChecked()
    await other.locator('label', { hasText: 'Certified' }).first().click()
    await other.getByRole('button', { name: 'Save changes' }).click()
    await expect(second.page.getByText(`${names.edit} was updated.`)).toBeVisible()
    expect(patches).toEqual([{ certification_status: 'certified' }])
    expect(readShelter(ids.edit)).toMatchObject({ status: 'closed', certification: 'certified' }) // the first admin's change survived
    await expect(rowFor(second.page, names.edit)).toContainText('Closed') // and the list caught up
    await second.context.close()
  })

  test('occupancy changed elsewhere while an editor is open: coming back to the tab refreshes the row, but what was typed is kept', async ({ page }) => {
    await signInStaff(page, 'conc-occ', ids.ngoA)
    await openShelters(page)
    const row = rowFor(page, names.occ)
    await expect(row).toContainText('Capacity', { timeout: 20_000 }).catch(() => undefined)
    await row.getByRole('button', { name: `Update occupancy for ${names.occ}` }).click()
    const field = row.getByRole('textbox', { name: `People currently at ${names.occ}` })
    await field.fill('77')
    await expect(row).toContainText('was 100')

    // Someone else changes the number; the page's copy is fresh for 30 s, so wait it out, then "come back to the tab".
    setShelterNumbers(ids.occ, { capacityCurrent: 150 })
    await page.waitForTimeout(31_000)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true })) // TanStack Query listens on the window
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true })) // TanStack Query listens on the window
    })
    await expect(row).toContainText('was 150', { timeout: 15_000 })
    await expect(field).toHaveValue('77')
    await row.getByRole('button', { name: 'Cancel' }).click()
  })

  test('an edit for a shelter that has just been removed is refused with the real words, in the drawer, and nothing is left half-saved', async ({ page }) => {
    await signInStaff(page, 'conc-gone', ids.ngoA)
    await openShelters(page)
    await expect(rowFor(page, names.gone)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: `Edit ${names.gone}` }).click()
    const drawer = page.getByRole('dialog', { name: 'Edit shelter' })
    deleteShelter(ids.gone) // behind the open drawer
    await drawer.locator('label', { hasText: 'Closed' }).click()
    await drawer.getByRole('button', { name: 'Save changes' }).click()
    // Either the drawer closes with a notice that it is gone, or it stays with the server's own words — never a silent success.
    await expect(page.getByText(/no longer exists|not found|has been removed|isn't listed/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(`${names.gone} was updated.`)).toHaveCount(0)
  })
})

/* ─────────────────────────── cross-role: the citizen sees it ─────────────────────────── */

test.describe('NGO shelters (deferred) — the organisation changes it, the citizen sees it', () => {
  test('occupancy and closing show on the citizen\'s shelter page and map after their next look', async ({ page, browser }) => {
    const citizenContext = await browser.newContext()
    const citizen = await citizenContext.newPage()
    const citizenEmail = await register(citizen.request, 'ngox-citizen')
    verifyAndOnboardAccount(citizenEmail, 'E2E Citizen')
    await logIn(citizen, citizenEmail, /\/app\/home$/)
    await visit(citizen, `/app/map/shelters/${ids.cross}`)
    await expect(citizen.getByRole('region', { name: 'Capacity' })).toContainText('Capacity 120 / 400', { timeout: 20_000 })
    await expect(citizen.getByText('Open', { exact: true }).first()).toBeVisible()

    await signInStaff(page, 'cross', ids.ngoA)
    await openShelters(page)
    await rowFor(page, names.cross).getByRole('button', { name: `Update occupancy for ${names.cross}` }).click()
    await rowFor(page, names.cross).getByRole('textbox', { name: `People currently at ${names.cross}` }).fill('300')
    await rowFor(page, names.cross).getByRole('button', { name: 'Save occupancy' }).click()
    await expect(page.getByText(`Occupancy at ${names.cross} is now 300 / 400.`)).toBeVisible()
    await page.getByRole('button', { name: `Edit ${names.cross}` }).click()
    await page.getByRole('dialog', { name: 'Edit shelter' }).locator('label', { hasText: 'Closed' }).click()
    await page.getByRole('dialog', { name: 'Edit shelter' }).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`${names.cross} was updated.`)).toBeVisible()

    // The citizen's next look: the page reads the new numbers and the closed status…
    await citizen.reload()
    await expect(citizen.getByRole('region', { name: 'Capacity' })).toContainText('Capacity 300 / 400', { timeout: 20_000 })
    await expect(citizen.getByRole('region', { name: 'Capacity' })).toContainText('This shelter is closed right now.')
    // …and the map's marker for it is now a closed one, with its card saying the same.
    await citizen.goto('/app/map')
    const marker = citizen.getByRole('button', { name: `${names.cross}, Shelter, Closed` })
    await expect(marker).toBeVisible({ timeout: 25_000 })
    // (Shelters seeded 0.05° apart overlap at the opening zoom, so the card is opened from the search results.)
    await citizen.getByLabel('Search the map').fill(names.cross)
    await citizen.getByRole('region', { name: 'Places matching your search' }).getByRole('button', { name: new RegExp(`^${names.cross}`) }).click()
    await expect(citizen.getByRole('region', { name: `${names.cross} details` })).toContainText('300')
    await citizenContext.close()
  })
})

/* ──────────────────────────── keyboard and screen reader ──────────────────────────── */

test.describe('NGO shelters (deferred) — keyboard and screen reader', () => {
  test('the buttons are named, the state is announced, the editor describes and flags its field, and the register drawer can be filled by keyboard alone', async ({ page }) => {
    await signInStaff(page, 'keys', ids.ngoA)
    await openShelters(page)
    const row = rowFor(page, names.keys)
    await expect(row).toBeVisible({ timeout: 20_000 })

    // Named icon buttons.
    await expect(row.getByRole('link', { name: `View ${names.keys}` })).toBeVisible()
    const update = row.getByRole('button', { name: `Update occupancy for ${names.keys}` })
    await expect(row.getByRole('button', { name: `Edit ${names.keys}` })).toBeVisible()
    // The filter pills report which is chosen.
    const pills = page.getByRole('group', { name: 'Filter shelters' })
    await expect(pills.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    await pills.getByRole('button', { name: /^Open/ }).click()
    await expect(pills.getByRole('button', { name: /^Open/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(pills.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
    await pills.getByRole('button', { name: /^All/ }).click()

    // The occupancy button says whether its editor is open; the field is described by its hint and flagged when invalid.
    await expect(update).toHaveAttribute('aria-expanded', 'false')
    await update.focus()
    await page.keyboard.press('Enter')
    await expect(update).toHaveAttribute('aria-expanded', 'true')
    const field = row.getByRole('textbox', { name: `People currently at ${names.keys}` })
    await expect(field).toBeFocused()
    const hintId = (await field.getAttribute('aria-describedby'))!
    expect(hintId).toBeTruthy()
    await expect(page.locator(`#${hintId}`)).toContainText('of 200')
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    await field.fill('999')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator(`#${hintId}`)).toContainText("It can't be more than the shelter's capacity of 200.")
    await page.keyboard.press('Escape')
    await expect(update).toBeFocused()
    await expect(update).toHaveAttribute('aria-expanded', 'false')

    // The register drawer by keyboard: Tab reaches every field and the pin is never a stop (it cannot be moved from the keyboard).
    await page.getByRole('button', { name: 'Register shelter' }).focus()
    await page.keyboard.press('Enter')
    const drawer = drawerOf(page)
    await expect(drawer.getByLabel('Name', { exact: true })).toBeFocused()
    const visited = new Set<string>()
    for (let i = 0; i < 40; i += 1) {
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return el ? el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLInputElement).id || el.textContent?.trim().slice(0, 30) || el.tagName : ''
      })
      visited.add(label)
      if (label === 'pointLongitude') break
      await page.keyboard.press('Tab')
    }
    expect(visited).toContain('shelterCapacity')
    expect(visited).toContain('pointLatitude')
    expect(visited).toContain('pointLongitude')
    expect([...visited].some((label) => label.startsWith('Shelter location'))).toBe(false) // the pin is not a tab stop
    // An outside click does not close the drawer (it would lose the form); Escape does.
    await drawer.getByLabel('Name', { exact: true }).fill('Half done')
    await page.mouse.click(5, 300)
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Register shelter' })).toBeFocused() // and focus goes back to the button that opened it
  })
})

/* ───────────────────────────────────────── scale ───────────────────────────────────────── */

test.describe('NGO shelters (deferred) — a hundred shelters', () => {
  test('the list loads, the search and the pills are instant, and opening an editor moves nothing above the row', async ({ page }) => {
    await signInStaff(page, 'scale', ids.ngoE)
    const started = Date.now()
    await openShelters(page)
    await expect(rowFor(page, `${names.bulk} 100`)).toBeVisible({ timeout: 20_000 })
    expect(Date.now() - started).toBeLessThan(15_000)
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(100)

    // Search narrows at once.
    const search = page.getByRole('searchbox', { name: 'Search shelters' })
    const typed = Date.now()
    await search.fill(`${names.bulk} 05`)
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(10) // 050–059
    expect(Date.now() - typed).toBeLessThan(2000)
    await search.fill('')
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(100)

    // The pills count within the search and switch instantly.
    const pills = page.getByRole('group', { name: 'Filter shelters' })
    await pills.getByRole('button', { name: /^Open/ }).click()
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(100)
    await pills.getByRole('button', { name: /^Closed/ }).click()
    await expect(page.getByRole('heading', { name: 'No shelters match' })).toBeVisible()
    await page.getByRole('button', { name: 'Show all shelters' }).click()
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(100)

    // An editor opening in a row in the middle of the list moves nothing above it.
    const above = rowFor(page, `${names.bulk} 040`)
    const target = rowFor(page, `${names.bulk} 050`)
    await target.scrollIntoViewIfNeeded()
    const [aboveBefore, targetBefore] = [(await above.boundingBox())!, (await target.boundingBox())!]
    await target.getByRole('button', { name: `Update occupancy for ${names.bulk} 050` }).click()
    await expect(target.getByRole('textbox')).toBeVisible()
    const [aboveAfter, targetAfter] = [(await above.boundingBox())!, (await target.boundingBox())!]
    expect(aboveAfter.y).toBeCloseTo(aboveBefore.y, 0)
    expect(targetAfter.y).toBeCloseTo(targetBefore.y, 0)
    expect(targetAfter.height).toBeGreaterThan(targetBefore.height) // it grew downwards
  })
})
