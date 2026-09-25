import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  deleteInfrastructure,
  findEssentialByName,
  findInfrastructureByName,
  makeNgoAdminOf,
  promoteToNgoAdmin,
  promoteToPlatformAdmin,
  readEssentialReportStatuses,
  readInfrastructure,
  readShelter,
  seedEssentialLocation,
  seedEssentialReportLog,
  seedHazardZone,
  seedInfrastructure,
  seedRegion,
  seedShelter,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for the admin's Facilities screen (/admin/facilities), against the real backend with no stubbed responses. The world is `E2E …` rows in Postgres: a province,
 * two organisations with shelters, three infrastructure items (one inside a forecast flood zone, one inside a *low-confidence* zone citizens are never shown, one in neither), and three
 * essential locations (one with a log of reports). Every claim about what the page shows is compared with the stored row, every write is read back from the database, and what citizens
 * are shown is read from the public routes they use.
 */
const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`

// A random 0.6° square at 16–21°N, 70–78°E each run: clear of the real regions and south of the flood pipeline's grid, so the only zones here are ours and an earlier run's rows
// can never join this run's world. Lists are read *through the province* (`?region=`) so leftovers elsewhere can't change what a test counts.
const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
const ORIGIN: [number, number] = [70 + jitter(8), 16 + jitter(5)]
const at = (dx: number, dy: number): [number, number] => [Number((ORIGIN[0] + dx).toFixed(4)), Number((ORIGIN[1] + dy).toFixed(4))]
const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]

const names = {
  province: `E2E Facilities Prov ${tag}`,
  ngoA: `E2E Facilities NGO A ${tag}`,
  ngoB: `E2E Facilities NGO B ${tag}`,
  shelterOpen: `E2E Fac Shelter Open ${tag}`,
  shelterFull: `E2E Fac Shelter Full ${tag}`,
  shelterClosed: `E2E Fac Shelter Closed ${tag}`,
  hospital: `E2E Fac Hospital ${tag}`,
  bridge: `E2E Fac Bridge ${tag}`,
  utility: `E2E Fac Utility ${tag}`,
  pharmacy: `E2E Fac Pharmacy ${tag}`,
  atm: `E2E Fac ATM ${tag}`,
  grocery: `E2E Fac Grocery ${tag}`,
}
const ids = { province: '', ngoA: '', ngoB: '', shelterOpen: '', shelterFull: '', shelterClosed: '', hospital: '', bridge: '', utility: '', pharmacy: '', atm: '', grocery: '', highZone: '', lowZone: '' }

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function register(api: APIRequestContext, label: string) {
  const email = `e2e-facilities-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
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

/** A real platform admin, logged in through the UI and on /admin/dashboard. */
async function signInAsAdmin(page: Page, label: string) {
  const email = await register(page.request, label)
  promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

async function tokenFor(api: APIRequestContext, email: string) {
  const res = await api.post(`${API}/auth/login`, { data: { email, password }, timeout: 30_000 })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { access_token: string }).access_token
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/** The page scoped to the seeded province — so a leftover E2E row elsewhere can never change what a test counts. */
const inProvince = (tab = '') => `/admin/facilities?region=${ids.province}${tab ? `&tab=${tab}` : ''}`

const rowFor = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name })
const percent = (current: number, total: number) => String(Math.round((current / total) * 100))
const rowNames = (page: Page) => page.getByRole('main').getByRole('listitem').locator('p:first-child')

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000)
  ids.province = seedRegion(names.province, 'province', undefined, squareRing(ORIGIN[0], ORIGIN[1], 0.6))

  const founderA = await register(request, 'founder-a')
  ids.ngoA = promoteToNgoAdmin(founderA, names.ngoA)
  const founderB = await register(request, 'founder-b')
  ids.ngoB = promoteToNgoAdmin(founderB, names.ngoB)
  const reporter = await register(request, 'reporter')
  verifyAndOnboardAccount(reporter, 'E2E Fac Reporter')

  const shelter = (name: string, dx: number, dy: number, more: Partial<Parameters<typeof seedShelter>[1]>) => {
    const [lng, lat] = at(dx, dy)
    return seedShelter(ids.province, { name, lng, lat, capacityTotal: 100, capacityCurrent: 0, ...more })
  }
  ids.shelterOpen = shelter(names.shelterOpen, 0.2, 0.3, { capacityTotal: 400, capacityCurrent: 265, ngoId: ids.ngoA })
  ids.shelterFull = shelter(names.shelterFull, 0.3, 0.1, { capacityTotal: 300, capacityCurrent: 300, ngoId: ids.ngoB })
  ids.shelterClosed = shelter(names.shelterClosed, 0.45, 0.25, { capacityTotal: 200, capacityCurrent: 20, status: 'closed', type: 'relief_center', certification: 'pending' })

  const infra = (name: string, dx: number, dy: number, more: Partial<Parameters<typeof seedInfrastructure>[1]>) => {
    const [lng, lat] = at(dx, dy)
    return seedInfrastructure(ids.province, { name, lng, lat, ...more })
  }
  ids.hospital = infra(names.hospital, 0.15, 0.15, { type: 'hospital', status: 'safe' })
  ids.bridge = infra(names.bridge, 0.42, 0.42, { type: 'bridge', status: 'at_risk' })
  ids.utility = infra(names.utility, 0.1, 0.5, { type: 'utility', status: 'damaged' })

  const essential = (name: string, dx: number, dy: number, more: Partial<Parameters<typeof seedEssentialLocation>[1]>) => {
    const [lng, lat] = at(dx, dy)
    return seedEssentialLocation(ids.province, { name, lng, lat, ...more })
  }
  ids.pharmacy = essential(names.pharmacy, 0.3, 0.2, { type: 'pharmacy' })
  seedEssentialReportLog(ids.pharmacy, reporter, [
    { status: 'open', minutesAgo: 30 },
    { status: 'closed', minutesAgo: 20 },
    { status: 'open', minutesAgo: 10 },
  ])
  ids.atm = essential(names.atm, 0.25, 0.55, { type: 'atm' })
  ids.grocery = essential(names.grocery, 0.5, 0.15, { type: 'grocery_store', report: { by: reporter, status: 'closed' } })

  // A forecast zone around the bridge, and a *low-confidence* one around the hospital — which the citizen overlay never returns.
  ids.highZone = seedHazardZone(ids.province, { ring: rect(0.35, 0.35, 0.5, 0.5), risk: 'high', confidence: 0.87 })
  ids.lowZone = seedHazardZone(ids.province, { ring: rect(0.1, 0.1, 0.2, 0.2), risk: 'low', confidence: 0.2 })
})

test.describe('Facilities — shelters (oversight), real backend', () => {
  test('lists the province\'s shelters read-only, each compared with its stored row, with the organisation named and linked — and nothing to change', async ({ page }) => {
    await signInAsAdmin(page, 'shelters')
    const requests: string[] = []
    page.on('request', (req) => req.method() === 'GET' && /\/shelters\?region_id=/.test(req.url()) && requests.push(new URL(req.url()).searchParams.get('region_id') ?? ''))
    await page.getByRole('navigation').getByRole('link', { name: 'Facilities' }).click()
    await expect(page).toHaveURL(/\/admin\/facilities/)
    await expect(page.getByRole('heading', { level: 1, name: 'Facilities' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Shelters' })).toHaveAttribute('aria-selected', 'true')

    await page.goto(inProvince())
    await expect(page.getByText('3 shelters in')).toBeVisible()
    // Closed, Full, Open — by name.
    await expect(rowNames(page)).toHaveText([names.shelterClosed, names.shelterFull, names.shelterOpen])
    expect(requests).toContain(ids.province)

    for (const [id, ngo] of [[ids.shelterOpen, [names.ngoA, ids.ngoA]], [ids.shelterFull, [names.ngoB, ids.ngoB]]] as const) {
      const stored = readShelter(id)
      const row = rowFor(page, stored.name)
      await expect(row.getByRole('progressbar', { name: `Occupancy of ${stored.name}` })).toHaveAttribute('aria-valuenow', percent(stored.capacityCurrent, stored.capacityTotal))
      await expect(row).toContainText(`${stored.lat.toFixed(4)}° N, ${stored.lng.toFixed(4)}° E`)
      await expect(row.getByRole('link', { name: ngo[0] })).toHaveAttribute('href', `/admin/ngos/${ngo[1]}`)
    }
    await expect(rowFor(page, names.shelterClosed)).toContainText('No organisation')
    await expect(rowFor(page, names.shelterClosed)).toContainText('Closed')
    await expect(rowFor(page, names.shelterClosed)).toContainText('Pending certification')

    // Oversight only: no Add, and the only action on a row is its location.
    await expect(page.getByRole('button', { name: /^Add/ })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('button', { name: /^Location of/ })).toHaveCount(3)
    await expect(page.getByRole('button', { name: /^Edit|^Update/ })).toHaveCount(0)
  })

  test('the status pills and the search — by organisation name too — narrow the list, and the view survives a reload', async ({ page }) => {
    await signInAsAdmin(page, 'shelter-filter')
    await page.goto(inProvince())
    const status = page.getByRole('group', { name: 'Status' })
    await expect(status.getByRole('button', { name: /^All/ })).toContainText('3')

    await status.getByRole('button', { name: /^At capacity/ }).click()
    await expect(page).toHaveURL(/status=full/)
    await expect(rowNames(page)).toHaveText([names.shelterFull])
    await page.reload()
    await expect(status.getByRole('button', { name: /^At capacity/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(rowNames(page)).toHaveText([names.shelterFull])

    await status.getByRole('button', { name: /^All/ }).click()
    await page.getByRole('searchbox', { name: 'Search shelters' }).fill(names.ngoA)
    await expect(rowNames(page)).toHaveText([names.shelterOpen])
    await page.getByRole('searchbox', { name: 'Search shelters' }).fill('nothing-matches-this')
    await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search and filters' }).click()
    await expect(rowNames(page)).toHaveCount(3)
  })

  test('the region scope: chosen in the shared picker it narrows the requests to that region, and clearing it goes back to every top-level region', async ({ page }) => {
    await signInAsAdmin(page, 'scope')
    const requested: string[] = []
    page.on('request', (req) => req.method() === 'GET' && /\/shelters\?region_id=/.test(req.url()) && requested.push(new URL(req.url()).searchParams.get('region_id') ?? ''))
    await page.goto('/admin/facilities')
    await expect(page.getByRole('button', { name: /Region: all regions/ })).toBeVisible()
    await expect.poll(() => requested.length).toBeGreaterThan(1)
    // Every top-level region — and the seeded province is one, since it has no parent.
    expect(requested).toContain(ids.province)

    requested.length = 0
    await page.getByRole('button', { name: /Choose a region/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Choose a region' })
    await dialog.getByRole('searchbox', { name: 'Search regions' }).fill(names.province)
    await dialog.getByRole('radio', { name: new RegExp(names.province) }).check({ force: true })
    await dialog.getByRole('button', { name: 'Show this region' }).click()
    await expect(page).toHaveURL(new RegExp(`region=${ids.province}`))
    await expect(rowNames(page)).toHaveText([names.shelterClosed, names.shelterFull, names.shelterOpen])
    await expect(page.getByRole('button', { name: `Region: ${names.province}. Change region` })).toBeVisible()
    await expect(page.getByText(`3 shelters in ${names.province}`)).toBeVisible()

    await page.getByRole('button', { name: 'Show all regions' }).click()
    await expect(page).not.toHaveURL(/region=/)
    await expect(page.getByRole('button', { name: /Region: all regions/ })).toBeVisible()
    // A region id that is not one is never sent to the API.
    const seen: string[] = []
    page.on('request', (req) => /region_id=not-a-region/.test(req.url()) && seen.push(req.url()))
    await page.goto('/admin/facilities?region=not-a-region')
    await expect(page.getByText(/That region isn't on the platform, so every region is shown/)).toBeVisible()
    expect(seen).toEqual([])
  })
})

test.describe('Facilities — infrastructure, real backend', () => {
  test('lists the province\'s infrastructure from the database, and the type and status pills and the search narrow it', async ({ page }) => {
    await signInAsAdmin(page, 'infra')
    await page.goto(inProvince('infrastructure'))
    await expect(rowNames(page)).toHaveText([names.bridge, names.hospital, names.utility])
    for (const id of [ids.hospital, ids.bridge, ids.utility]) {
      const stored = readInfrastructure(id)
      const row = rowFor(page, stored.name)
      await expect(row).toContainText(`${stored.lat.toFixed(4)}° N, ${stored.lng.toFixed(4)}° E`)
      await expect(row).toContainText(stored.status === 'at_risk' ? 'At risk' : stored.status === 'safe' ? 'Safe' : 'Damaged')
    }
    await expect(page.getByRole('button', { name: 'Add infrastructure' })).toBeVisible()

    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^At risk/ }).click()
    await expect(rowNames(page)).toHaveText([names.bridge])
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^All/ }).click()
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Utility/ }).click()
    await expect(rowNames(page)).toHaveText([names.utility])
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^All/ }).click()
    await page.getByRole('searchbox', { name: 'Search infrastructure items' }).fill('hospital')
    await expect(rowNames(page)).toHaveText([names.hospital])
  })

  test('updating a status — the request carries only the status, Postgres and the public route agree — and confirming the same one really does move "last updated"', async ({ page, request }) => {
    await signInAsAdmin(page, 'status')
    await page.goto(inProvince('infrastructure'))
    const patches: Array<{ url: string; body: unknown }> = []
    page.on('request', (req) => req.method() === 'PATCH' && patches.push({ url: req.url(), body: req.postDataJSON() }))

    await page.getByRole('button', { name: `Update status of ${names.hospital}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Update status' })
    await expect(dialog.getByRole('radio', { name: /Safe \(current\)/ })).toBeChecked()
    await dialog.locator('label', { hasText: 'At risk' }).click()
    await dialog.getByRole('button', { name: 'Save status' }).click()

    await expect(page.getByText(`${names.hospital} is now at risk.`)).toBeVisible()
    expect(patches).toEqual([{ url: `${API}/admin/infrastructure/${ids.hospital}/status`, body: { status: 'at_risk' } }])
    const changed = readInfrastructure(ids.hospital)
    expect(changed.status).toBe('at_risk')
    await expect(rowFor(page, names.hospital)).toContainText('At risk')
    // What a citizen is shown is the same status — the public route reads the row the admin just changed.
    const listed = (await (await request.get(`${API}/infrastructure?region_id=${ids.province}`)).json()) as Array<{ id: string; status: string }>
    expect(listed.find((item) => item.id === ids.hospital)?.status).toBe('at_risk')

    // Saving the status it already has is a real 200 that moves last_status_update.
    await page.getByRole('button', { name: `Update status of ${names.hospital}` }).click()
    await expect(page.getByText(/already its status. Saving it again just refreshes when it was last updated/)).toBeVisible()
    await page.getByRole('dialog', { name: 'Update status' }).getByRole('button', { name: 'Confirm status' }).click()
    await expect(page.getByText(`${names.hospital} was confirmed as at risk.`)).toBeVisible()
    const confirmed = readInfrastructure(ids.hospital)
    expect(confirmed.status).toBe('at_risk')
    expect(new Date(confirmed.lastStatusUpdate).getTime()).toBeGreaterThan(new Date(changed.lastStatusUpdate).getTime())
    expect(patches[1]).toEqual({ url: `${API}/admin/infrastructure/${ids.hospital}/status`, body: { status: 'at_risk' } })

    // And back.
    await page.getByRole('button', { name: `Update status of ${names.hospital}` }).click()
    await page.getByRole('dialog', { name: 'Update status' }).locator('label', { hasText: 'Safe' }).click()
    await page.getByRole('dialog', { name: 'Update status' }).getByRole('button', { name: 'Save status' }).click()
    await expect(page.getByText(`${names.hospital} is now safe.`)).toBeVisible()
    expect(readInfrastructure(ids.hospital).status).toBe('safe')
  })

  test('an item deleted from under the open page: the real 404 is reported as "gone", the dialog closes and the list refreshes', async ({ page }) => {
    await signInAsAdmin(page, 'status-gone')
    const [lng, lat] = at(0.05, 0.05)
    const doomed = seedInfrastructure(ids.province, { name: `E2E Fac Doomed ${tag}`, lng, lat, type: 'utility' })
    await page.goto(inProvince('infrastructure'))
    await page.getByRole('button', { name: `Update status of E2E Fac Doomed ${tag}` }).click()
    await page.getByRole('dialog', { name: 'Update status' }).getByText('Damaged', { exact: true }).click()

    deleteInfrastructure(doomed)
    await page.getByRole('dialog', { name: 'Update status' }).getByRole('button', { name: 'Save status' }).click()
    await expect(page.getByText(`E2E Fac Doomed ${tag} no longer exists, so its status wasn't changed. The list has been refreshed.`)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(rowFor(page, `E2E Fac Doomed ${tag}`)).toHaveCount(0)
  })

  test('adding infrastructure: every gap and bad coordinate named with no POST sent; then a real row — safe, the typed point, in the province — that the public route returns and the list shows', async ({ page, request }) => {
    await signInAsAdmin(page, 'add-infra')
    await page.goto(inProvince('infrastructure'))
    const posts: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/admin/infrastructure') && posts.push(req.postDataJSON()))

    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    const drawer = page.getByRole('dialog', { name: 'Add infrastructure' })
    await expect(drawer).toContainText('It starts as Safe')
    await expect(drawer).toContainText("can't be changed afterwards, and there is no way to remove it")
    await drawer.getByRole('button', { name: 'Add infrastructure' }).click()
    await expect(drawer.getByText('Enter the name.')).toBeVisible()
    await expect(drawer.getByText('Enter the latitude, or click the map.')).toBeVisible()
    await drawer.getByLabel('Name', { exact: true }).fill('E2E bad point')
    await drawer.getByLabel('Latitude', { exact: true }).fill('95')
    await drawer.getByLabel('Longitude', { exact: true }).fill('200')
    await drawer.getByRole('button', { name: 'Add infrastructure' }).click()
    await expect(drawer.getByText('Latitude is between −90 and 90.', { exact: true })).toBeVisible()
    await expect(drawer.getByText('Longitude is between −180 and 180.')).toBeVisible()
    expect(posts).toEqual([])

    const name = `E2E Fac New Bridge ${tag}`
    const [lng, lat] = at(0.3, 0.45)
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.locator('label', { hasText: 'Bridge' }).click()
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(lng))
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toContainText('In E2E')
    await drawer.getByRole('button', { name: 'Add infrastructure' }).click()

    await expect(page.getByText(new RegExp(`${name} was added. It is in E2E`))).toBeVisible()
    await expect(drawer).toHaveCount(0)
    expect(posts).toEqual([{ name, type: 'bridge', location: { type: 'Point', coordinates: [lng, lat] } }])
    const stored = findInfrastructureByName(name)!
    expect(stored).toMatchObject({ type: 'bridge', status: 'safe' })
    expect(stored.lat).toBeCloseTo(lat, 5)
    expect(stored.lng).toBeCloseTo(lng, 5)
    await expect(rowFor(page, name)).toBeVisible()
    await expect(rowFor(page, name)).toContainText('Safe')

    // The region query citizens' map uses now returns it.
    const listed = (await (await request.get(`${API}/infrastructure?region_id=${ids.province}`)).json()) as Array<{ name: string; status: string }>
    expect(listed.find((item) => item.name === name)?.status).toBe('safe')
  })

  test('a point in no region is refused — the drawer says so before saving, the latitude says why when saving is tried, and nothing is created', async ({ page }) => {
    await signInAsAdmin(page, 'add-outside')
    await page.goto('/admin/facilities?tab=infrastructure')
    const name = `E2E Fac Sea Platform ${tag}`
    const posts: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/admin/infrastructure') && posts.push(req.postDataJSON()))
    await page.getByRole('button', { name: 'Add infrastructure' }).click()
    const drawer = page.getByRole('dialog', { name: 'Add infrastructure' })
    await expect(drawer.getByText('Places can only be added inside the shaded areas.')).toBeVisible()
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.getByLabel('Latitude', { exact: true }).fill('5')
    await drawer.getByLabel('Longitude', { exact: true }).fill('60')
    await expect(drawer.getByText(/outside the shaded areas/)).toContainText('To cover a new area, add a region under Regions first.')
    await drawer.getByRole('button', { name: 'Add infrastructure' }).click()
    await expect(drawer.getByText('Pick a spot inside a shaded area of the map.')).toBeVisible()
    await expect(drawer.getByLabel('Latitude', { exact: true })).toBeFocused()

    // Nothing was sent, nothing was stored, and the drawer is still there to fix it in.
    expect(posts).toEqual([])
    expect(findInfrastructureByName(name)).toBeNull()
    await expect(drawer).toBeVisible()
  })
})

test.describe('Facilities — essential locations, real backend', () => {
  test('lists the province\'s places with the latest reported status — "Status unknown" for a place nobody has reported on — and the type and status pills narrow it', async ({ page }) => {
    await signInAsAdmin(page, 'essential')
    await page.goto(inProvince('essential'))
    await expect(rowNames(page)).toHaveText([names.atm, names.grocery, names.pharmacy])
    await expect(rowFor(page, names.pharmacy)).toContainText('Open')
    await expect(rowFor(page, names.grocery)).toContainText('Closed')
    await expect(rowFor(page, names.atm)).toContainText('Status unknown')
    await expect(rowFor(page, names.atm)).toContainText('No reports yet')
    await expect(rowFor(page, names.pharmacy)).toContainText(/Last report .* ago/)

    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^Status unknown/ }).click()
    await expect(rowNames(page)).toHaveText([names.atm])
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^All/ }).click()
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Pharmacy/ }).click()
    await expect(rowNames(page)).toHaveText([names.pharmacy])
    await expect(page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Bridge/ })).toHaveCount(0)
  })

  test('a place\'s report log is what the table holds, newest first, with the one citizens see marked — and it never says who reported', async ({ page }) => {
    await signInAsAdmin(page, 'reports')
    await page.goto(inProvince('essential'))
    await page.getByRole('button', { name: `Status reports for ${names.pharmacy}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Status reports' })
    const stored = readEssentialReportStatuses(ids.pharmacy)
    expect(stored).toEqual(['open', 'closed', 'open'])
    await expect(dialog).toContainText('3 reports')
    const entries = dialog.getByRole('listitem')
    await expect(entries).toHaveCount(3)
    for (const [index, status] of stored.entries()) await expect(entries.nth(index)).toContainText(status === 'open' ? 'Open' : 'Closed')
    await expect(entries.first()).toContainText('shown now')
    await expect(dialog).toContainText("Reports don't say who made them")
    await expect(dialog).not.toContainText('e2e-facilities-reporter')
    await dialog.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: `Status reports for ${names.atm}` }).click()
    await expect(page.getByText(/No one has reported on this place yet/)).toBeVisible()
  })

  test('adding an essential location creates a real row with no status and no reports, in the province, that the list then shows as "Status unknown"', async ({ page, request }) => {
    await signInAsAdmin(page, 'add-essential')
    await page.goto(inProvince('essential'))
    const name = `E2E Fac New Pharmacy ${tag}`
    const [lng, lat] = at(0.2, 0.45)
    const posts: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/admin/essential-locations') && posts.push(req.postDataJSON()))

    await page.getByRole('button', { name: 'Add essential location' }).click()
    const drawer = page.getByRole('dialog', { name: 'Add essential location' })
    await expect(drawer).toContainText('manual fallback')
    await expect(drawer.locator('label', { hasText: 'Grocery store' })).toBeVisible()
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.locator('label', { hasText: 'Pharmacy' }).click()
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(lng))
    await drawer.getByRole('button', { name: 'Add essential location' }).click()

    await expect(page.getByText(new RegExp(`${name} was added. It is in E2E`))).toBeVisible()
    expect(posts).toEqual([{ name, type: 'pharmacy', location: { type: 'Point', coordinates: [lng, lat] } }])
    const stored = findEssentialByName(name)!
    expect(stored).toMatchObject({ type: 'pharmacy', reports: 0 })
    await expect(rowFor(page, name)).toContainText('Status unknown')
    const listed = (await (await request.get(`${API}/essential-locations?region_id=${ids.province}`)).json()) as Array<{ name: string; current_status?: string }>
    const created = listed.find((item) => item.name === name)
    expect(created).toBeDefined()
    expect(created).not.toHaveProperty('current_status')
  })
})

test.describe('Facilities — a place on the map, real backend', () => {
  test('a bridge inside a forecast zone says so — with the model\'s confidence — and links to that zone\'s page', async ({ page }) => {
    await signInAsAdmin(page, 'loc-high')
    await page.goto(inProvince('infrastructure'))
    await page.getByRole('button', { name: `Location of ${names.bridge}` }).click()
    const dialog = page.getByRole('dialog', { name: names.bridge })
    await expect(dialog.getByRole('button', { name: `${names.bridge}, Bridge, At risk` })).toBeVisible()
    await expect(dialog.getByText(/Inside a/)).toContainText('Inside a high-risk flood zone — 87% model confidence.')
    await expect(dialog.getByText(/citizens looking at that region will see it/)).toContainText('In E2E')
    await expect(dialog.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })
    await dialog.getByRole('link', { name: 'View zone' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/hazard-zones/${ids.highZone}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('a hospital inside a *low-confidence* zone — which citizens are never shown — is told so: the admin overlay is what is asked, not the citizen\'s', async ({ page, request }) => {
    await signInAsAdmin(page, 'loc-low')
    const overlayRoutes: string[] = []
    page.on('request', (req) => /\/map\/flood-overlay/.test(req.url()) && overlayRoutes.push(new URL(req.url()).pathname))
    await page.goto(inProvince('infrastructure'))
    await page.getByRole('button', { name: `Location of ${names.hospital}` }).click()
    const dialog = page.getByRole('dialog', { name: names.hospital })
    await expect(dialog.getByText(/Inside a/)).toContainText('Inside a low-risk flood zone — 20% model confidence.')
    expect(overlayRoutes.length).toBeGreaterThan(0)
    expect(overlayRoutes.every((path) => path.endsWith('/admin/map/flood-overlay'))).toBe(true)

    // The same box asked of the public route (what a citizen sees) does not contain that zone.
    const [w, s] = at(0.05, 0.05)
    const [e, n] = at(0.3, 0.3)
    const publicZones = (await (await request.get(`${API}/map/flood-overlay?bbox=${w},${s},${e},${n}`)).json()) as Array<{ hazard_zone_id: string }>
    expect(publicZones.some((zone) => zone.hazard_zone_id === ids.lowZone)).toBe(false)
  })

  test('a utility in no zone, and a shelter, each say so — the check reads the point, not what happens to be in view', async ({ page }) => {
    await signInAsAdmin(page, 'loc-clear')
    await page.goto(inProvince('infrastructure'))
    await page.getByRole('button', { name: `Location of ${names.utility}` }).click()
    await expect(page.getByRole('dialog', { name: names.utility }).getByText('Not inside any active hazard zone.')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('tab', { name: 'Shelters' }).click()
    await page.getByRole('button', { name: `Location of ${names.shelterOpen}` }).click()
    const dialog = page.getByRole('dialog', { name: names.shelterOpen })
    await expect(dialog.getByRole('button', { name: `${names.shelterOpen}, Shelter, Open` })).toBeVisible()
    await expect(dialog.getByText('Not inside any active hazard zone.')).toBeVisible()
  })
})

test.describe('Facilities — who may, real backend', () => {
  test('a citizen is turned away from the page, and the real API refuses every admin write', async ({ page, request }) => {
    const email = await register(page.request, 'citizen')
    verifyAndOnboardAccount(email, 'E2E Fac Citizen')
    await logIn(page, email, /\/app\/home$/)
    await page.goto('/admin/facilities')
    await expect(page).toHaveURL(/\/app\/home$/)

    const headers = bearer(await tokenFor(request, email))
    const point = { type: 'Point', coordinates: at(0.2, 0.2) }
    const add = await request.post(`${API}/admin/infrastructure`, { headers, data: { name: `E2E Fac Nope ${tag}`, type: 'bridge', location: point } })
    expect(add.status()).toBe(403)
    expect((await add.json()).error).toBe('insufficient permissions')
    expect((await request.post(`${API}/admin/essential-locations`, { headers, data: { name: `E2E Fac Nope ${tag}`, type: 'atm', location: point } })).status()).toBe(403)
    const before = readInfrastructure(ids.bridge)
    expect((await request.patch(`${API}/admin/infrastructure/${ids.bridge}/status`, { headers, data: { status: 'damaged' } })).status()).toBe(403)
    expect(readInfrastructure(ids.bridge)).toEqual(before)
    expect(findInfrastructureByName(`E2E Fac Nope ${tag}`)).toBeNull()
  })

  test('an NGO admin is bounced from the page and refused by the real API too — infrastructure is the platform admin\'s, not an organisation\'s', async ({ page, request }) => {
    const email = await register(page.request, 'ngo-admin')
    makeNgoAdminOf(email, ids.ngoA)
    await logIn(page, email, /\/ngo\/dashboard$/)
    await page.goto('/admin/facilities')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)

    const headers = bearer(await tokenFor(request, email))
    const before = readInfrastructure(ids.utility)
    const res = await request.patch(`${API}/admin/infrastructure/${ids.utility}/status`, { headers, data: { status: 'safe' } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('insufficient permissions')
    expect(readInfrastructure(ids.utility)).toEqual(before)
  })
})
