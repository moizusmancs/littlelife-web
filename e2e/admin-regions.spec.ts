import { readFileSync } from 'node:fs'
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import {
  countRegionsNamed,
  promoteToNgoAdmin,
  promoteToPlatformAdmin,
  readRegion,
  readRegionByName,
  seedNgoRegion,
  seedRegion,
  setNgoStatus,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for `/admin/regions` and `/admin/regions/:id`: no spoofing, no stubbed responses.
 * Every region the tests make is named `E2E …` and found through a unique name, so the real regions
 * are never touched, and every claim about what was saved is checked by reading the stored row back
 * from Postgres — including its parent and the boundary as PostGIS holds it. The API has no delete
 * route, so these rows stay behind (harmlessly, and removable by name).
 *
 * What the API lets through and this screen must therefore stop — an open ring, a bow-tie,
 * longitude 200, a MultiPolygon it would answer with a bare 500, a district with no province — is
 * exercised here as "nothing was written".
 */
const API = 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'

async function register(request: APIRequestContext, tag: string) {
  const email = `e2e-reg-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await request.post(`${API}/auth/register`, { data: { email, password } })
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

async function signInAsAdmin(page: Page, request: APIRequestContext, tag: string) {
  const email = await register(request, `${tag}-admin`)
  promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

const unique = (label: string) => `E2E ${label} ${Date.now()}${Math.floor(Math.random() * 1000)}`
const polygon = (x: number, y: number, size = 0.5) => ({ type: 'Polygon', coordinates: [squareRing(x, y, size)] })
const drawer = (page: Page) => page.getByRole('dialog')
const regionLink = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^${name}`) })

async function fillForm(dialog: Locator, fields: { name: string; boundary?: unknown; level?: string; parent?: string }) {
  await dialog.getByLabel('Name').fill(fields.name)
  if (fields.level) await dialog.getByLabel('Level').selectOption(fields.level)
  if (fields.parent) await dialog.getByLabel(/^Parent /).selectOption({ label: fields.parent })
  if (fields.boundary !== undefined) await dialog.getByLabel('Boundary').fill(JSON.stringify(fields.boundary))
}

test.describe('Regions — browsing, real backend', () => {
  test('opens from the sidebar with the real hierarchy: a count per level and every top-level region', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'open')
    await page.getByRole('link', { name: 'Regions', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/regions$/)
    await expect(page.getByRole('heading', { name: 'Regions', level: 1 })).toBeVisible()

    const regions: Array<{ level: string; name: string; parent_region_id?: string }> = await (await request.get(`${API}/regions`)).json()
    const count = (level: string) => regions.filter((r) => r.level === level).length
    const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`
    await expect(page.getByText(`${plural(count('province'), 'province')} · ${plural(count('district'), 'district')} · ${plural(count('tehsil'), 'tehsil')}`)).toBeVisible()

    const tree = page.getByRole('list', { name: 'Regions' })
    for (const top of regions.filter((r) => !r.parent_region_id)) {
      await expect(tree.getByRole('link', { name: new RegExp(`^${top.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first()).toBeVisible()
    }
    await expect(page.getByText('Select a region')).toBeVisible()
  })

  test('search and the level filter narrow the tree to a flat list with each region’s parents, and the filter survives selecting one', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(page, request, 'filter')
    const tag = unique('Filter')
    const province = seedRegion(`${tag} Prov`, 'province')
    const districtA = seedRegion(`${tag} DistA`, 'district', province)
    seedRegion(`${tag} DistB`, 'district', province)
    seedRegion(`${tag} Tehsil`, 'tehsil', districtA)

    await page.goto('/admin/regions')
    await page.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    const matches = page.getByRole('list', { name: 'Matching regions' })
    await expect(matches.getByRole('listitem')).toHaveCount(4)
    await expect(matches.getByRole('listitem').filter({ hasText: `${tag} Tehsil` })).toContainText(`${tag} Prov › ${tag} DistA`)
    await expect(page).toHaveURL(new RegExp(`\\?q=${encodeURIComponent(tag).replace(/%20/g, '(\\+|%20)')}`))

    await page.getByRole('button', { name: 'District', exact: true }).click()
    await expect(matches.getByRole('listitem')).toHaveCount(2)
    await page.getByRole('button', { name: 'All', exact: true }).click()

    await matches.locator(`a[href*="${districtA}"]`).click()
    await expect(page.getByRole('heading', { name: `${tag} DistA`, level: 2 })).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/regions\/[0-9a-f-]{36}\?q=/)
    await expect(page.getByRole('searchbox', { name: 'Search regions' })).toHaveValue(tag)

    // Clearing the search returns to the tree, opened to the selected region.
    await page.getByRole('searchbox', { name: 'Search regions' }).fill('')
    await expect(page.getByRole('button', { name: `Collapse ${tag} Prov` })).toBeVisible()
    await expect(regionLink(page, `${tag} DistA`)).toHaveAttribute('aria-current', 'page')
  })

  test('a region’s address opens it directly — ancestors expanded, path and sub-regions shown — and survives a reload', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(page, request, 'deep')
    const tag = unique('Deep')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province, squareRing(68, 25, 1))
    const tehsil = seedRegion(`${tag} Tehsil`, 'tehsil', district)

    await page.goto(`/admin/regions/${tehsil}`)
    await expect(page.getByRole('heading', { name: `${tag} Tehsil`, level: 2 })).toBeVisible()
    await expect(regionLink(page, `${tag} Tehsil`)).toHaveAttribute('aria-current', 'page')
    const path = page.getByRole('navigation', { name: 'Region path' })
    await expect(path.getByRole('link')).toHaveText([`${tag} Prov`, `${tag} Dist`])

    await page.reload()
    await expect(page.getByRole('heading', { name: `${tag} Tehsil`, level: 2 })).toBeVisible()
    await expect(regionLink(page, `${tag} Tehsil`)).toHaveAttribute('aria-current', 'page')

    // Up the path, and a sub-region chip back down.
    await path.getByRole('link', { name: `${tag} Dist` }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/regions/${district}`))
    const subs = page.getByRole('region', { name: /Sub-regions/ })
    await expect(subs).toContainText('1')
    await subs.getByRole('link', { name: `${tag} Tehsil` }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/regions/${tehsil}`))
  })

  test('says so for an address that is not a region', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'missing')
    await page.goto('/admin/regions/00000000-0000-0000-0000-000000000001')
    await expect(page.getByRole('heading', { name: 'Region not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to regions' }).click()
    await expect(page).toHaveURL(/\/admin\/regions$/)
  })

  test('shows the boundary as an outline with its size, and downloads it as GeoJSON that reads back in', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'download')
    const name = unique('Download Me')
    const id = seedRegion(name, 'province', undefined, squareRing(66.5, 25.5, 2))

    await page.goto(`/admin/regions/${id}`)
    await expect(page.getByRole('img', { name: `Outline of ${name}` })).toBeVisible()
    await expect(page.getByText('Polygon · 1 ring · 5 points')).toBeVisible()
    await expect(page.getByText('66.50° to 68.50° E, 25.50° to 27.50° N')).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download GeoJSON' }).click()])
    expect(download.suggestedFilename()).toMatch(/^e2e-download-me-\d+\.geojson$/)
    const saved = JSON.parse(readFileSync((await download.path()) as string, 'utf8'))
    expect(saved).toMatchObject({ type: 'Feature', properties: { name, level: 'province' }, geometry: { type: 'Polygon', coordinates: [squareRing(66.5, 25.5, 2)] } })

    // …and the file goes straight back into the form.
    await page.getByRole('button', { name: 'Edit region' }).click()
    await drawer(page).getByLabel('Upload a GeoJSON file').setInputFiles({ name: 'again.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(saved)) })
    await expect(drawer(page).getByText('Using the polygon inside the Feature.')).toBeVisible()
    await expect(drawer(page).getByText(/Valid polygon: 1 ring, 5 points/)).toBeVisible()
  })
})

test.describe('Regions — adding, real backend', () => {
  test('builds a province, a district from the province’s page, and a tehsil from the toolbar — each stored with the right parent and boundary', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(page, request, 'build')
    const province = unique('Prov')
    const district = unique('Dist')
    const tehsil = unique('Tehsil')

    await page.goto('/admin/regions')
    await page.getByRole('button', { name: 'Add region' }).click()
    await expect(page.getByRole('heading', { name: 'Add region' })).toBeVisible()
    await expect(drawer(page).getByLabel('Parent')).toBeDisabled()
    await fillForm(drawer(page), { name: province, boundary: polygon(70, 30) })
    await expect(drawer(page).getByText(/Valid polygon: 1 ring, 5 points/)).toBeVisible()
    await expect(drawer(page).getByRole('img', { name: 'Outline of the boundary you entered' })).toBeVisible()
    await drawer(page).getByRole('button', { name: 'Add region' }).click()

    await expect(page.getByRole('heading', { name: province, level: 2 })).toBeVisible()
    await expect(page.getByText(`Added ${province}.`)).toBeVisible()
    const storedProvince = readRegionByName(province)!
    expect(storedProvince).toMatchObject({ level: 'province', parentId: null })
    expect(storedProvince.boundary).toEqual({ type: 'Polygon', coordinates: [squareRing(70, 30)] })
    await expect(page).toHaveURL(new RegExp(`/admin/regions/${storedProvince.id}$`))

    // From the province's own page the level and parent are already chosen.
    await page.getByRole('button', { name: 'Add district' }).click()
    await expect(drawer(page).getByLabel('Level')).toHaveValue('district')
    await expect(drawer(page).getByLabel('Parent province')).toHaveValue(storedProvince.id)
    await fillForm(drawer(page), { name: district, boundary: polygon(70.1, 30.1, 0.2) })
    await drawer(page).getByRole('button', { name: 'Add region' }).click()
    await expect(page.getByRole('heading', { name: district, level: 2 })).toBeVisible()
    const storedDistrict = readRegionByName(district)!
    expect(storedDistrict).toMatchObject({ level: 'district', parentId: storedProvince.id })
    // The new district appears under its province, which opened to show it.
    await expect(page.getByRole('button', { name: `Collapse ${province}` })).toBeVisible()
    await expect(regionLink(page, district)).toHaveAttribute('aria-current', 'page')

    // A tehsil from the toolbar: pick the level, and the parent list offers only districts.
    await page.getByRole('button', { name: 'Add region' }).click()
    await drawer(page).getByLabel('Level').selectOption('tehsil')
    const parentOptions = await drawer(page).getByLabel('Parent district').locator('option').allTextContents()
    expect(parentOptions[0]).toBe('Choose a district…')
    expect(parentOptions).toContain(`${province} › ${district}`)
    expect(parentOptions).not.toContain(province)
    await fillForm(drawer(page), { name: tehsil, parent: `${province} › ${district}`, boundary: polygon(70.12, 30.12, 0.05) })
    await drawer(page).getByRole('button', { name: 'Add region' }).click()
    await expect(page.getByRole('heading', { name: tehsil, level: 2 })).toBeVisible()
    expect(readRegionByName(tehsil)).toMatchObject({ level: 'tehsil', parentId: storedDistrict.id })

    // The public read shows the same hierarchy.
    const listed: Array<{ name: string; parent_region_id?: string }> = await (await request.get(`${API}/regions`)).json()
    expect(listed.find((r) => r.name === tehsil)?.parent_region_id).toBe(storedDistrict.id)
  })

  test('refuses what the API would accept: every boundary problem is named and nothing is written', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'blocked')
    await page.goto('/admin/regions')

    const cases: Array<[string, unknown, RegExp]> = [
      ['open ring', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }, /isn't closed/],
      ['bow-tie', { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] }, /crosses or touches itself/],
      ['longitude 200', polygon(200, 10), /outside longitude ±180 or latitude ±90/],
      ['multipolygon', { type: 'MultiPolygon', coordinates: [[squareRing(1, 1)], [squareRing(5, 5)]] }, /MultiPolygon can't be saved/],
      ['point', { type: 'Point', coordinates: [1, 2] }, /Expected a Polygon, but this is a Point/],
    ]
    for (const [label, boundary, message] of cases) {
      const name = unique(`Bad ${label}`)
      await page.getByRole('button', { name: 'Add region' }).click()
      await fillForm(drawer(page), { name, boundary })
      await expect(drawer(page).getByRole('alert')).toContainText(message)
      await expect(drawer(page).getByRole('img', { name: 'Outline of the boundary you entered' })).toHaveCount(0)
      await drawer(page).getByRole('button', { name: 'Add region' }).click()
      // Validation ran (the field was focused back), the drawer is still open, and nothing was saved.
      await expect(drawer(page).getByLabel('Boundary')).toBeFocused()
      await expect(drawer(page)).toBeVisible()
      expect(countRegionsNamed(name)).toBe(0)
      await drawer(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(drawer(page)).toHaveCount(0)
    }
  })

  test('will not save a nameless region, a district without a province, or any region without a boundary', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'required')
    await page.goto('/admin/regions')
    await page.getByRole('button', { name: 'Add region' }).click()
    await drawer(page).getByLabel('Level').selectOption('district')
    await drawer(page).getByRole('button', { name: 'Add region' }).click()

    await expect(drawer(page).getByText('Enter the name of the region.')).toBeVisible()
    await expect(drawer(page).getByText('Choose the province this district belongs to.')).toBeVisible()
    await expect(drawer(page).getByText('Add the region’s boundary as a GeoJSON polygon.')).toBeVisible()

    // Changing the level throws away a parent that no longer fits.
    await drawer(page).getByLabel('Level').selectOption('province')
    await expect(drawer(page).getByLabel('Parent')).toBeDisabled()
    await expect(drawer(page).getByLabel('Parent')).toHaveValue('')
  })

  test('accepts a GeoJSON Feature from a .geojson file and stores the polygon inside it, without its altitude', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'file')
    const name = unique('From File')
    const feature = {
      type: 'Feature',
      properties: { name: 'ignored' },
      geometry: { type: 'Polygon', coordinates: [squareRing(72, 28).map(([x, y]) => [x, y, 120])] },
    }
    await page.goto('/admin/regions')
    await page.getByRole('button', { name: 'Add region' }).click()
    await drawer(page).getByLabel('Name').fill(name)
    await drawer(page).getByLabel('Upload a GeoJSON file').setInputFiles({ name: 'boundary.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(feature)) })

    await expect(drawer(page).getByLabel('Boundary')).toHaveValue(/"type":"Feature"/)
    await expect(drawer(page).getByText('Using the polygon inside the Feature.')).toBeVisible()
    await expect(drawer(page).getByText('Altitude values were dropped — a boundary is flat.')).toBeVisible()
    await drawer(page).getByRole('button', { name: 'Add region' }).click()

    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
    expect(readRegionByName(name)!.boundary).toEqual({ type: 'Polygon', coordinates: [squareRing(72, 28)] })
  })

  test('the drawer is a real modal: Escape closes it without saving, and clicking outside does not throw away the form', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'modal')
    const name = unique('Never Saved')
    await page.goto('/admin/regions')
    await page.getByRole('button', { name: 'Add region' }).click()
    await drawer(page).getByLabel('Name').fill(name)

    await page.mouse.click(20, 400)
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByLabel('Name')).toHaveValue(name)

    await page.keyboard.press('Escape')
    await expect(drawer(page)).toHaveCount(0)
    expect(countRegionsNamed(name)).toBe(0)

    // Opening it again starts blank.
    await page.getByRole('button', { name: 'Add region' }).click()
    await expect(drawer(page).getByLabel('Name')).toHaveValue('')
  })
})

test.describe('Regions — editing, real backend', () => {
  test('renames a region and, separately, replaces its boundary — each change touching only its own column', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'edit')
    const tag = unique('Edit')
    const province = seedRegion(`${tag} Prov`, 'province')
    const districtId = seedRegion(`${tag} Dist`, 'district', province, squareRing(68, 25))
    const before = readRegion(districtId)

    await page.goto(`/admin/regions/${districtId}`)
    await page.getByRole('button', { name: 'Edit region' }).click()
    await expect(drawer(page).getByLabel('Name')).toHaveValue(`${tag} Dist`)
    await expect(drawer(page).getByLabel('Level')).toHaveValue('district')
    await expect(drawer(page).getByLabel('Parent province')).toHaveValue(province)
    await expect(drawer(page).getByLabel('Boundary')).toHaveValue('')
    await expect(drawer(page).getByText(/Currently 1 ring, 5 points/)).toBeVisible()

    await drawer(page).getByLabel('Name').fill(`${tag} Renamed`)
    await drawer(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: `${tag} Renamed`, level: 2 })).toBeVisible()
    await expect(page.getByText(`Saved changes to ${tag} Renamed.`)).toBeVisible()

    const renamed = readRegion(districtId)
    expect(renamed.name).toBe(`${tag} Renamed`)
    expect(renamed.parentId).toBe(province)
    expect(renamed.boundary).toEqual(before.boundary)
    expect(renamed.updatedAt).not.toBe(before.updatedAt)

    await page.getByRole('button', { name: 'Edit region' }).click()
    await drawer(page).getByLabel('Boundary').fill(JSON.stringify(polygon(69, 26, 1)))
    await expect(drawer(page).getByText(/Valid polygon: 1 ring, 5 points/)).toBeVisible()
    await drawer(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`Saved changes to ${tag} Renamed.`)).toBeVisible()
    await expect(page.getByText('69.00° to 70.00° E, 26.00° to 27.00° N')).toBeVisible()

    const reshaped = readRegion(districtId)
    expect(reshaped.boundary).toEqual({ type: 'Polygon', coordinates: [squareRing(69, 26, 1)] })
    expect(reshaped.name).toBe(`${tag} Renamed`)
    expect(reshaped.parentId).toBe(province)
  })

  test('moves a district to another province', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'move')
    const tag = unique('Move')
    const from = seedRegion(`${tag} From`, 'province')
    const to = seedRegion(`${tag} To`, 'province', undefined, squareRing(71, 24))
    const districtId = seedRegion(`${tag} Dist`, 'district', from)

    await page.goto(`/admin/regions/${districtId}`)
    await expect(page.getByRole('navigation', { name: 'Region path' }).getByRole('link')).toHaveText([`${tag} From`])
    await page.getByRole('button', { name: 'Edit region' }).click()
    await drawer(page).getByLabel('Parent province').selectOption({ label: `${tag} To` })
    await drawer(page).getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByRole('navigation', { name: 'Region path' }).getByRole('link')).toHaveText([`${tag} To`])
    expect(readRegion(districtId).parentId).toBe(to)
    expect(readRegion(districtId).name).toBe(`${tag} Dist`)
  })

  test('a parent loop that only someone else’s edit makes possible is refused by the real API, explained, and the list refreshed', async ({ page, request }) => {
    const adminEmail = await signInAsAdmin(page, request, 'loop')
    const tag = unique('Loop')
    const p1 = seedRegion(`${tag} P1`, 'province')
    const p2 = seedRegion(`${tag} P2`, 'province', undefined, squareRing(70, 25))
    const b = seedRegion(`${tag} B`, 'district', p1)

    await page.goto(`/admin/regions/${b}`)
    await page.getByRole('button', { name: 'Edit region' }).click()
    const parent = drawer(page).getByLabel('Parent province')
    await expect(parent.locator('option', { hasText: `${tag} P2` })).toHaveCount(1)

    // Behind the page's back another admin makes P2 a district *under* B — so choosing P2 as B's parent is now a loop.
    const login = await request.post(`${API}/auth/login`, { data: { email: adminEmail, password } })
    const { access_token: token } = await login.json()
    const behind = await request.patch(`${API}/admin/regions/${p2}`, { headers: { Authorization: `Bearer ${token}` }, data: { level: 'district', parent_region_id: b } })
    expect(behind.status()).toBe(200)

    await parent.selectOption({ label: `${tag} P2` })
    await drawer(page).getByRole('button', { name: 'Save changes' }).click()

    await expect(drawer(page).getByRole('alert')).toContainText('parent_region_id would create a loop')
    await expect(drawer(page).getByRole('alert')).toContainText('it has been refreshed')
    expect(readRegion(b).parentId).toBe(p1)
    // The list refreshed under the open drawer: P2 is no longer a province, so it's no longer offered, and the stale choice is gone.
    await expect(parent.locator('option', { hasText: `${tag} P2` })).toHaveCount(0)
    await expect(parent).toHaveValue('')
  })

  test('a save with nothing changed is caught before it becomes the API’s 400', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'nochange')
    const id = seedRegion(unique('Unchanged'), 'province')
    const before = readRegion(id)

    await page.goto(`/admin/regions/${id}`)
    await page.getByRole('button', { name: 'Edit region' }).click()
    await drawer(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(drawer(page).getByRole('alert')).toHaveText('Nothing has changed yet.')
    expect(readRegion(id).updatedAt).toBe(before.updatedAt)
  })

  test('a region with sub-regions cannot change level, and offers no cycle: its own descendants are never parent choices', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'lock')
    const tag = unique('Lock')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    const leaf = seedRegion(`${tag} Leaf`, 'district', province)
    seedRegion(`${tag} Tehsil`, 'tehsil', district)

    await page.goto(`/admin/regions/${province}`)
    await page.getByRole('button', { name: 'Edit region' }).click()
    await expect(drawer(page).getByLabel('Level')).toBeDisabled()
    await expect(drawer(page).getByText(`${tag} Prov has sub-regions, so its level can't change.`)).toBeVisible()
    await drawer(page).getByRole('button', { name: 'Cancel' }).click()

    // A district with no sub-regions can change level — and then may only sit under a district.
    await page.goto(`/admin/regions/${leaf}`)
    await page.getByRole('button', { name: 'Edit region' }).click()
    await expect(drawer(page).getByLabel('Level')).toBeEnabled()
    await drawer(page).getByLabel('Level').selectOption('tehsil')
    const options = await drawer(page).getByLabel('Parent district').locator('option').allTextContents()
    expect(options).toContain(`${tag} Prov › ${tag} Dist`)
    expect(options).not.toContain(`${tag} Prov › ${tag} Leaf`)
    await expect(drawer(page).getByLabel('Parent district')).toHaveValue('')
    await drawer(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(drawer(page).getByText('Choose the district this tehsil belongs to.')).toBeVisible()
    expect(readRegion(leaf).level).toBe('district')
  })
})

test.describe('Regions — access, real backend', () => {
  test('a citizen is turned away from the screen, and the API refuses their writes too', async ({ page, request }) => {
    const email = await register(request, 'citizen')
    verifyAndOnboardAccount(email, 'Regions Citizen')
    await logIn(page, email, /\/app\/home$/)

    await page.goto('/admin/regions')
    await expect(page).toHaveURL(/\/app\/home$/)
    await expect(page.getByRole('heading', { name: 'Regions', level: 1 })).toHaveCount(0)

    const login = await request.post(`${API}/auth/login`, { data: { email, password } })
    const { access_token: token } = await login.json()
    const name = unique('Citizen Region')
    const res = await request.post(`${API}/admin/regions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, level: 'province', boundary: polygon(1, 1) },
    })
    expect(res.status()).toBe(403)
    expect(countRegionsNamed(name)).toBe(0)
  })
})

test.describe('Regions — on a phone, real backend', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('shows the tree, then one region with a way back, and adds a region from a full-width drawer', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'phone')
    const tag = unique('Phone')
    const province = seedRegion(`${tag} Prov`, 'province')
    seedRegion(`${tag} Dist`, 'district', province)

    await page.goto('/admin/regions')
    await page.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    await expect(page.getByText('Select a region')).toBeHidden()
    await page.getByRole('list', { name: 'Matching regions' }).getByRole('link', { name: new RegExp(`${tag} Dist`) }).click()

    await expect(page.getByRole('heading', { name: `${tag} Dist`, level: 2 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Region hierarchy' })).toBeHidden()
    await page.getByRole('link', { name: 'All regions' }).click()
    await expect(page.getByRole('region', { name: 'Region hierarchy' })).toBeVisible()
    await expect(page.getByRole('heading', { name: `${tag} Dist`, level: 2 })).toBeHidden()

    const name = `${tag} Added`
    await page.getByRole('button', { name: 'Add region' }).click()
    await expect(drawer(page)).toBeVisible()
    const box = await drawer(page).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(388)
    await fillForm(drawer(page), { name, boundary: polygon(73, 29) })
    await drawer(page).getByRole('button', { name: 'Add region' }).click()
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
    expect(readRegionByName(name)).toMatchObject({ level: 'province' })

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBe(0)
  })
})


test.describe('Regions — NGO coverage, real backend', () => {
  /** A registered account made the admin of a new `E2E …` NGO that covers the given regions. */
  async function coveringNgo(request: APIRequestContext, name: string, regions: string[], status: 'active' | 'pending_approval' = 'active') {
    const email = await register(request, `ngo-${Math.floor(Math.random() * 1e6)}`)
    const ngoId = promoteToNgoAdmin(email, name)
    for (const region of regions) seedNgoRegion(ngoId, region)
    if (status !== 'active') setNgoStatus(ngoId, status)
    return ngoId
  }

  test('lists the organisations assigned to a region — direct assignments only, with their status — and links to each', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'coverage')
    const tag = unique('Cover')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    const lonely = seedRegion(`${tag} Lonely`, 'district', province)
    const both = await coveringNgo(request, `${tag} Both`, [province, district])
    await coveringNgo(request, `${tag} Waiting`, [district], 'pending_approval')
    await coveringNgo(request, `${tag} ProvinceOnly`, [province])

    // The district: two organisations, one of them still pending — and not the one that only covers the province.
    await page.goto(`/admin/regions/${district}`)
    const card = page.getByRole('heading', { name: /NGOs covering this region/ }).locator('xpath=ancestor::section')
    await expect(card.getByRole('listitem')).toHaveCount(2)
    await expect(card.getByRole('listitem').filter({ hasText: `${tag} Both` })).toContainText('Active')
    await expect(card.getByRole('listitem').filter({ hasText: `${tag} Both` })).toContainText('covers 2 regions')
    await expect(card.getByRole('listitem').filter({ hasText: `${tag} Waiting` })).toContainText('Pending approval')
    await expect(card).not.toContainText(`${tag} ProvinceOnly`)
    await expect(card).toContainText("One assigned to a parent region isn't listed here")

    // The province is covered by two organisations: the one that covers both regions, and the province-only one.
    await page.goto(`/admin/regions/${province}`)
    await expect(card.getByRole('listitem')).toHaveCount(2)
    await expect(card).not.toContainText(`${tag} Waiting`)

    // A region nobody covers says so.
    await page.goto(`/admin/regions/${lonely}`)
    await expect(card.getByText('No organisation has been assigned to this region.')).toBeVisible()

    // Each organisation links through to its own page.
    await page.goto(`/admin/regions/${district}`)
    await card.getByRole('link', { name: `${tag} Both` }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/ngos/${both}$`))
    await expect(page.getByRole('heading', { name: `${tag} Both`, level: 1 })).toBeVisible()
  })

  test('the card follows the selected region: moving between regions asks again for each', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'coverage2')
    const tag = unique('Cover Two')
    const a = seedRegion(`${tag} A`, 'province')
    const b = seedRegion(`${tag} B`, 'province', undefined, squareRing(70, 25))
    await coveringNgo(request, `${tag} OnlyA`, [a])

    await page.goto(`/admin/regions/${a}`)
    const card = page.getByRole('heading', { name: /NGOs covering this region/ }).locator('xpath=ancestor::section')
    await expect(card.getByRole('link', { name: `${tag} OnlyA` })).toBeVisible()

    await page.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    await page.getByRole('list', { name: 'Matching regions' }).locator(`a[href*="${b}"]`).click()
    await expect(page.getByRole('heading', { name: `${tag} B`, level: 2 })).toBeVisible()
    await expect(card.getByText('No organisation has been assigned to this region.')).toBeVisible()
    await expect(card.getByRole('link', { name: `${tag} OnlyA` })).toHaveCount(0)
  })

  test('the route itself is admin-only: a citizen is refused with the real 403, and an unknown region is a real 404', async ({ page, request }) => {
    const admin = await signInAsAdmin(page, request, 'coverage403')
    const citizen = await register(request, 'coverage-citizen')
    verifyAndOnboardAccount(citizen, 'Coverage Citizen')

    const tokenFor = async (email: string) => (await (await request.post(`${API}/auth/login`, { data: { email, password } })).json()).access_token as string
    const region = seedRegion(unique('Cover 403'), 'province')
    const asCitizen = await request.get(`${API}/admin/regions/${region}/ngos`, { headers: { Authorization: `Bearer ${await tokenFor(citizen)}` } })
    expect(asCitizen.status()).toBe(403)
    const unknown = await request.get(`${API}/admin/regions/00000000-0000-0000-0000-000000000001/ngos`, { headers: { Authorization: `Bearer ${await tokenFor(admin)}` } })
    expect(unknown.status()).toBe(404)
  })
})
