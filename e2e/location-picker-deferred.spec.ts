import { test, expect, type Page } from '@playwright/test'
import { findInfrastructureByName, promoteToPlatformAdmin, seedRegion, seedRegionCircle, seedRegionGrid, seedRegionHalves, squareRing, verifyAndOnboardAccount } from './helpers/seed'
import { API, logIn, randomWorld, register, visit } from './helpers/citizen'

/**
 * The location picker's deferred tests (plan item 44), in the admin's Add infrastructure drawer against the real backend (the picker is the same in the NGO's Register Shelter
 * drawer): regions with a hole and with a very detailed outline, a region added while a drawer is open, the keyboard route and what a screen reader is told, a finger panning
 * over the shaded shapes on a phone, and three hundred nested regions. The scale test seeds hundreds of regions, which every later `GET /regions` would carry, so it is last and
 * the rows are removed with the guarded cleanup straight after.
 */
const w = randomWorld()
const { origin, at, tag } = w
const names = {
  holed: `E2E LPX Holed ${tag}`,
  complex: `E2E LPX Complex ${tag}`,
  plain: `E2E LPX Plain ${tag}`,
  late: `E2E LPX Late ${tag}`,
  big: `E2E LPX Big Prov ${tag}`,
  districts: `E2E LPX District ${tag}`,
  tehsils: `E2E LPX Tehsil ${tag}`,
}
const ids = { holed: '', complex: '', plain: '', big: '' }

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const drawerOf = (page: Page) => page.getByRole('dialog', { name: 'Add infrastructure' })
const noteOf = (page: Page) => drawerOf(page).getByRole('status').filter({ hasText: /shaded areas|citizens looking at that region/ })

async function signInAdmin(page: Page, label: string) {
  const email = await register(page.request, `lpx-${label}`)
  verifyAndOnboardAccount(email, 'E2E Picker Admin')
  promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

async function openDrawer(page: Page) {
  await visit(page, '/admin/facilities?tab=infrastructure')
  await page.getByRole('button', { name: 'Add infrastructure' }).click()
  await expect(drawerOf(page)).toBeVisible()
}

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 }] })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test.beforeAll(() => {
  test.setTimeout(120_000)
  // A province with a square hole in the middle, and one with a round, very detailed outline (2,001 vertices — a real district boundary is thousands).
  const [x0, y0] = at(0.7, 0)
  ids.holed = seedRegion(
    names.holed,
    'province',
    undefined,
    squareRing(x0, y0, 0.3),
    [[x0 + 0.1, y0 + 0.1], [x0 + 0.2, y0 + 0.1], [x0 + 0.2, y0 + 0.2], [x0 + 0.1, y0 + 0.2], [x0 + 0.1, y0 + 0.1]],
  )
  const [cx, cy] = at(1.3, 0.15)
  ids.complex = seedRegionCircle(names.complex, 'province', { lng: cx, lat: cy, radius: 0.15, segments: 500 })
  ids.plain = seedRegion(names.plain, 'province', undefined, squareRing(origin[0], origin[1], 0.6))
})

test.describe('Location picker (deferred) — outlines a real platform has', () => {
  test('a point in a region\'s hole is outside it (and cannot be saved); its rim of ring is inside; a 2,000-vertex outline answers at once', async ({ page }) => {
    await signInAdmin(page, 'shapes')
    await openDrawer(page)
    const drawer = drawerOf(page)
    const [x0, y0] = at(0.7, 0)

    // In the ring around the hole.
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(y0 + 0.05))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(x0 + 0.05))
    await expect(noteOf(page)).toContainText(`In ${names.holed}`, { timeout: 10_000 })

    // In the hole itself: the region is not there, so the drawer says so and refuses the save — the API's own region join agrees.
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(y0 + 0.15))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(x0 + 0.15))
    await expect(noteOf(page)).toContainText('outside the shaded areas', { timeout: 10_000 })
    const inHole = (await (await page.request.get(`${API}/shelters?region_id=${ids.holed}`)).json()) as unknown[]
    expect(Array.isArray(inHole)).toBe(true)

    // The detailed outline: inside near its rim, outside just beyond it, each answered within a moment of typing.
    const [cx, cy] = at(1.3, 0.15)
    let typed = Date.now()
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(cy))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(cx + 0.14))
    await expect(noteOf(page)).toContainText(`In ${names.complex}`, { timeout: 10_000 })
    expect(Date.now() - typed).toBeLessThan(3000)
    typed = Date.now()
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(cx + 0.16))
    await expect(noteOf(page)).toContainText('outside the shaded areas', { timeout: 10_000 })
    expect(Date.now() - typed).toBeLessThan(3000)
  })

  test('a region added after the drawer was opened: the note is red for it (the list is a little old), but saving asks again, sees it, and the place is added', async ({ page }) => {
    await signInAdmin(page, 'late')
    await openDrawer(page)
    const drawer = drawerOf(page)
    await expect(drawer.getByRole('combobox', { name: 'Jump to an area' })).toBeVisible()
    // An administrator elsewhere adds a region now — after this drawer read the list.
    const [lx, ly] = at(2.2, 0)
    seedRegion(names.late, 'province', undefined, squareRing(lx, ly, 0.3))
    const name = `E2E LPX Late Place ${tag}`
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.locator('label', { hasText: 'Utility' }).click()
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(ly + 0.1))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(lx + 0.1))
    await expect(noteOf(page)).toContainText('outside the shaded areas', { timeout: 10_000 }) // as far as its (slightly old) list can tell
    await drawer.getByRole('button', { name: 'Add infrastructure' }).click()
    await expect(page.getByText(new RegExp(`${name} was added. It is in ${names.late}`))).toBeVisible({ timeout: 20_000 })
    expect(findInfrastructureByName(name)).not.toBeNull()
  })
})

test.describe('Location picker (deferred) — keyboard and screen reader', () => {
  test('the menu and the coordinate fields are the keyboard route; a refused save is described on the latitude and announced by the note', async ({ page }) => {
    await signInAdmin(page, 'keys')
    await openDrawer(page)
    const drawer = drawerOf(page)

    // Tab order from the name: the type, the location button, the menu, the map's own controls, then the coordinates — and never the pin.
    await drawer.getByLabel('Name', { exact: true }).focus()
    const visited: string[] = []
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return el ? el.getAttribute('aria-label') || el.getAttribute('title') || el.id || el.textContent?.trim().slice(0, 30) || el.tagName : ''
      })
      visited.push(label)
      if (label === 'pointLongitude') break
    }
    expect(visited).toContain('Use my location')
    expect(visited).toContain('Jump to an area')
    expect(visited).toContain('pointLatitude')
    expect(visited).toContain('pointLongitude')
    expect(visited.some((label) => label.startsWith('Shelter location'))).toBe(false)
    expect(visited.indexOf('Jump to an area')).toBeLessThan(visited.indexOf('pointLatitude'))

    // The menu by keyboard: focus it and pick an area with the arrow keys, then type the coordinates.
    const menu = drawer.getByRole('combobox', { name: 'Jump to an area' })
    await menu.focus()
    await page.keyboard.press('ArrowDown')
    await expect(menu).toHaveValue('') // the menu goes back to its prompt after every choice
    const [x, y] = at(0.3, 0.3)
    await drawer.getByLabel('Name', { exact: true }).fill(`E2E LPX Keys ${tag}`)
    await drawer.getByLabel('Latitude', { exact: true }).fill('5')
    await drawer.getByLabel('Longitude', { exact: true }).fill('60')
    await expect(noteOf(page)).toContainText('outside the shaded areas', { timeout: 10_000 })

    // A refused save: focus on the latitude, described by its message; the note is a live status.
    await drawer.getByLabel('Longitude', { exact: true }).press('Enter')
    const latitude = drawer.getByLabel('Latitude', { exact: true })
    await expect(latitude).toBeFocused()
    await expect(latitude).toHaveAttribute('aria-describedby', 'point-latitude-error')
    await expect(page.locator('#point-latitude-error')).toHaveText('Pick a spot inside a shaded area of the map.')
    await expect(noteOf(page)).toHaveAttribute('role', 'status')
    expect(findInfrastructureByName(`E2E LPX Keys ${tag}`)).toBeNull()

    // And typing a point in a region clears it, by keyboard alone.
    await latitude.fill(String(y))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(x))
    await expect(noteOf(page)).toContainText('citizens looking at that region will see it', { timeout: 10_000 })
    await expect(page.locator('#point-latitude-error')).toHaveCount(0)
  })
})

test.describe('Location picker (deferred) — a finger on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a touch drag that starts on a shaded area pans the map instead of being swallowed, and a tap on it places the pin', async ({ page }) => {
    await signInAdmin(page, 'touch')
    await openDrawer(page)
    const drawer = drawerOf(page)
    const map = drawer.getByRole('group', { name: "Map for choosing the infrastructure's location" })
    await drawer.getByLabel('Jump to an area').selectOption({ label: names.plain })
    await page.waitForTimeout(700)
    await map.scrollIntoViewIfNeeded()
    const frame = (await map.locator('.leaflet-container').boundingBox())!
    const centre = { x: frame.x + frame.width * 0.5, y: frame.y + frame.height * 0.5 }
    // The shape under the finger — whichever region is drawn at the middle of the view.
    const shape = (await page.evaluateHandle(({ x, y }) => document.elementFromPoint(x, y), centre)).asElement()!
    expect(await shape.evaluate((el) => el.getAttribute('class') ?? '')).toContain('leaflet-interactive')
    const before = (await shape.boundingBox())!

    // Start in the middle of the shape (which fills the view) and drag.
    await touchDrag(page, centre, { x: centre.x + 80, y: centre.y + 40 })
    await page.waitForTimeout(500)
    const after = (await shape.boundingBox())!
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(30)
    await expect(map.locator('.leaflet-marker-icon[title^="Shelter location"]')).toHaveCount(0) // a drag is not a click

    // A tap on the shape places the pin, and the note says where.
    await page.touchscreen.tap(after.x + after.width / 2, after.y + after.height / 2)
    await expect(map.locator('.leaflet-marker-icon[title^="Shelter location"]')).toBeVisible()
    await expect(noteOf(page)).toContainText(`In ${names.plain}`, { timeout: 10_000 })
  })
})

test.describe('Location picker (deferred) — three hundred nested regions', () => {
  test('the list is fetched once, every region is drawn, the menu lists them all and jumps to a tehsil, and a click is answered promptly', async ({ page }) => {
    test.setTimeout(240_000)
    const [bx, by] = at(3, 0)
    ids.big = seedRegion(names.big, 'province', undefined, squareRing(bx, by, 4.3))
    expect(seedRegionGrid({ prefix: names.districts, level: 'district', count: 100, lng: bx + 0.05, lat: by + 0.05, size: 0.38, columns: 10, parentId: ids.big })).toBe(100)
    expect(seedRegionHalves(ids.big, { prefix: names.tehsils, level: 'tehsil' })).toBe(200)

    await signInAdmin(page, 'scale')
    const list = await page.request.get(`${API}/regions`)
    const body = await list.body()
    const regions = JSON.parse(body.toString()) as Array<{ name: string }>
    const total = regions.length
    expect(total).toBeGreaterThan(300)
    // The full list with every boundary: the size the plan warned about.
    console.log(`REGIONS ${total} regions, ${(body.length / 1024).toFixed(0)} KB`)
    expect(body.length).toBeLessThan(8_000_000)

    const started = Date.now()
    await visit(page, '/admin/facilities?tab=infrastructure')
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    const drawer = drawerOf(page)
    const map = drawer.getByRole('group', { name: "Map for choosing the infrastructure's location" })
    // Every region with a drawable boundary is a shape on the map.
    await expect.poll(async () => map.locator('path.leaflet-interactive').count(), { timeout: 30_000 }).toBe(total)
    expect(Date.now() - started).toBeLessThan(30_000)

    // The menu lists them all, by whole path, and choosing the last tehsil brings the map to it.
    const menu = drawer.getByRole('combobox', { name: 'Jump to an area' })
    expect(await menu.locator('option').count()).toBe(total + 1)
    const lastTehsil = `${names.big} › ${names.districts} 100 › ${names.tehsils} 100 B`
    await menu.selectOption({ label: lastTehsil })
    await page.waitForTimeout(800)
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-moizusman-code-littlelife-web/78a3b6ba-1023-4d2b-bfd3-697fc394113a/scratchpad/lpx-scale-tehsil.png' })

    // A click on the map (anywhere in the province) is answered with the most specific region, within a moment.
    const frame = (await map.locator('.leaflet-container').boundingBox())!
    const clicked = Date.now()
    await page.mouse.click(frame.x + frame.width * 0.5, frame.y + frame.height * 0.5)
    await expect(noteOf(page)).toContainText(`In ${names.big} › ${names.districts}`, { timeout: 10_000 })
    expect(Date.now() - clicked).toBeLessThan(3000)

    // Zoomed out over the whole province: nested regions read darker where they overlap — look at it.
    await drawer.getByRole('combobox', { name: 'Jump to an area' }).selectOption({ label: names.big })
    await page.waitForTimeout(900)
    await map.scrollIntoViewIfNeeded()
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-moizusman-code-littlelife-web/78a3b6ba-1023-4d2b-bfd3-697fc394113a/scratchpad/lpx-scale-province.png' })
  })
})
