import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  deleteShelter,
  findShelterByName,
  makeNgoAdminOf,
  promoteToNgoAdmin,
  promoteToNgoVolunteer,
  readShelter,
  seedHazardZone,
  seedRegion,
  seedShelter,
  setShelterNumbers,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for the organisation's shelters (/ngo/shelters and /ngo/shelters/:id), against the real backend with no stubbed
 * responses. The world is `E2E …` rows in Postgres: two organisations, a province, and shelters managed by the first (one inside a forecast
 * flood zone) and one managed by the second. Every claim about what the page shows is compared with the stored row, every write is read
 * back from the database, and what citizens are shown is read from the public routes they use.
 */
const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`

// A random 0.6° square at 16–21°N, 70–78°E each run: clear of the real regions and south of the flood pipeline's grid, so the only zone near
// these shelters is ours, and an earlier run's rows can never join this run's world.
const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
const ORIGIN: [number, number] = [70 + jitter(8), 16 + jitter(5)]
const at = (dx: number, dy: number): [number, number] => [Number((ORIGIN[0] + dx).toFixed(4)), Number((ORIGIN[1] + dy).toFixed(4))]
const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]

const names = {
  province: `E2E NGO Shelter Prov ${tag}`,
  ngo: `E2E NGO Shelters A ${tag}`,
  otherNgo: `E2E NGO Shelters B ${tag}`,
  open: `E2E NGO Shelter Open ${tag}`,
  full: `E2E NGO Shelter Full ${tag}`,
  closed: `E2E NGO Shelter Closed ${tag}`,
  occ: `E2E NGO Shelter Occ ${tag}`,
  stale: `E2E NGO Shelter Stale ${tag}`,
  gone: `E2E NGO Shelter Gone ${tag}`,
  edit: `E2E NGO Shelter Edit ${tag}`,
  foreign: `E2E NGO Shelter Foreign ${tag}`,
}
const ids = { province: '', ngo: '', otherNgo: '', open: '', full: '', closed: '', occ: '', stale: '', gone: '', edit: '', foreign: '' }
/** Everything organisation A manages, in the order the list shows it (by name). */
const listed = () => [ids.closed, ids.edit, ids.full, ids.gone, ids.occ, ids.open, ids.stale]

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function register(api: APIRequestContext, label: string) {
  const email = `e2e-ngoshelter-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
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

/** A real `ngo_admin` of organisation A (the state a real approval leaves), logged in through the UI and on /ngo/dashboard. */
async function signInAsAdmin(page: Page, label: string) {
  const email = await register(page.request, label)
  makeNgoAdminOf(email, ids.ngo)
  await logIn(page, email, /\/ngo\/dashboard$/)
  return email
}

async function signInAsVolunteer(page: Page, label: string) {
  const email = await register(page.request, label)
  promoteToNgoVolunteer(email, ids.ngo)
  await logIn(page, email, /\/ngo\/dashboard$/)
  return email
}

/** A real access token, from a standalone client — never `page.request`, whose cookie jar is the signed-in page's. */
async function tokenFor(api: APIRequestContext, email: string) {
  const res = await api.post(`${API}/auth/login`, { data: { email, password }, timeout: 30_000 })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { access_token: string }).access_token
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

async function openShelters(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'Shelters' }).click()
  await expect(page).toHaveURL(/\/ngo\/shelters/)
  await expect(page.getByRole('heading', { level: 1, name: 'Shelters' })).toBeVisible()
}

const rowFor = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name })
const percent = (current: number, total: number) => String(Math.round((current / total) * 100))

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000)
  ids.province = seedRegion(names.province, 'province', undefined, squareRing(ORIGIN[0], ORIGIN[1], 0.6))

  const founderA = await register(request, 'founder-a')
  ids.ngo = promoteToNgoAdmin(founderA, names.ngo)
  const founderB = await register(request, 'founder-b')
  ids.otherNgo = promoteToNgoAdmin(founderB, names.otherNgo)

  const place = (name: string, dx: number, dy: number, more: Partial<Parameters<typeof seedShelter>[1]>, ngoId = ids.ngo) => {
    const [lng, lat] = at(dx, dy)
    return seedShelter(ids.province, { name, lng, lat, capacityTotal: 100, capacityCurrent: 0, ngoId, ...more })
  }
  ids.open = place(names.open, 0.2, 0.2, { capacityTotal: 400, capacityCurrent: 265 })
  ids.full = place(names.full, 0.3, 0.15, { capacityTotal: 300, capacityCurrent: 300 })
  ids.closed = place(names.closed, 0.45, 0.4, { capacityTotal: 200, capacityCurrent: 20, status: 'closed', type: 'relief_center', certification: 'pending' })
  ids.occ = place(names.occ, 0.1, 0.35, { capacityTotal: 200, capacityCurrent: 100 })
  ids.stale = place(names.stale, 0.5, 0.1, { capacityTotal: 400, capacityCurrent: 50 })
  ids.gone = place(names.gone, 0.15, 0.5, { capacityTotal: 100, capacityCurrent: 10 })
  ids.edit = place(names.edit, 0.4, 0.5, { capacityTotal: 100, capacityCurrent: 0, certification: 'pending' })
  ids.foreign = place(names.foreign, 0.05, 0.45, { capacityTotal: 500, capacityCurrent: 100 }, ids.otherNgo)
  seedHazardZone(ids.province, { ring: rect(0.05, 0.05, 0.35, 0.35), risk: 'high', confidence: 0.87 })
})

test.describe('NGO shelters list — real backend', () => {
  test("lists exactly this organisation's shelters by name, with the figures the database holds — and asks for no region", async ({ page }) => {
    await signInAsAdmin(page, 'list')
    const requests: string[] = []
    page.on('request', (req) => {
      if (/\/(ngo\/)?shelters/.test(req.url()) && req.method() === 'GET') requests.push(req.url())
    })
    await openShelters(page)

    const stored = listed().map(readShelter)
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(stored.length)
    await expect(page.getByRole('main').getByRole('listitem').locator('p:first-child')).toHaveText(stored.map((s) => s.name))
    await expect(page.getByText(names.foreign)).toHaveCount(0)

    const capacity = stored.reduce((sum, s) => sum + s.capacityTotal, 0)
    const occupied = stored.reduce((sum, s) => sum + s.capacityCurrent, 0)
    await expect(page.getByText(`${stored.length} registered · ${occupied.toLocaleString('en-US')} / ${capacity.toLocaleString('en-US')} occupied · 1 closed`)).toBeVisible()
    const totals = page.getByLabel('Shelter totals')
    await expect(totals.getByText('Total capacity').locator('xpath=following-sibling::dd')).toHaveText(capacity.toLocaleString('en-US'))
    await expect(totals.getByText('At capacity').locator('xpath=following-sibling::dd')).toHaveText('1')
    await expect(totals.getByText('Pending certification').locator('xpath=following-sibling::dd')).toHaveText('2')

    for (const shelter of stored) {
      const row = rowFor(page, shelter.name)
      await expect(row.getByRole('progressbar', { name: `Occupancy of ${shelter.name}` })).toHaveAttribute('aria-valuenow', percent(shelter.capacityCurrent, shelter.capacityTotal))
      await expect(row).toContainText(shelter.status === 'open' ? 'Open' : 'Closed')
      await expect(row).toContainText(`${shelter.lat.toFixed(4)}° N, ${shelter.lng.toFixed(4)}° E`)
    }
    await expect(rowFor(page, names.closed)).toContainText('Relief center')
    await expect(rowFor(page, names.closed)).toContainText('Pending certification')

    // A direct filter on the organisation, not a spatial join: no region was asked for anywhere.
    expect(requests.some((url) => url.endsWith('/ngo/shelters'))).toBe(true)
    expect(requests.filter((url) => url.includes('region_id'))).toEqual([])
  })

  test('the pills and the search narrow the list, the view lives in the URL, and a reload keeps it', async ({ page }) => {
    await signInAsAdmin(page, 'filter')
    await openShelters(page)
    const group = page.getByRole('group', { name: 'Filter shelters' })

    await group.getByRole('button', { name: /^At capacity/ }).click()
    await expect(page).toHaveURL(/show=full/)
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)
    await expect(rowFor(page, names.full)).toBeVisible()

    await page.reload()
    await expect(group.getByRole('button', { name: /^At capacity/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)

    await group.getByRole('button', { name: /^All/ }).click()
    await page.getByRole('searchbox', { name: 'Search shelters' }).fill('relief')
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1)
    await expect(rowFor(page, names.closed)).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search shelters' }).fill('nothing-matches-this')
    await expect(page.getByRole('heading', { name: 'No shelters match' })).toBeVisible()
    await page.getByRole('button', { name: 'Show all shelters' }).click()
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(listed().length)
  })

  test('a citizen is turned away from the page, and the real API refuses them', async ({ page, request }) => {
    const email = await register(page.request, 'citizen')
    verifyAndOnboardAccount(email, 'E2E Shelter Citizen')
    await logIn(page, email, /\/app\/home$/)
    await page.goto('/ngo/shelters')
    await expect(page).toHaveURL(/\/app\/home$/)

    const res = await request.get(`${API}/ngo/shelters`, { headers: bearer(await tokenFor(request, email)) })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('account is not affiliated with an ngo')
  })
})

test.describe('NGO shelters — occupancy, real backend', () => {
  test('an admin updates occupancy inside the row: the database, the public route and a reload all agree', async ({ page, request }) => {
    await signInAsAdmin(page, 'occ')
    await openShelters(page)
    const patches: Array<{ method: string; url: string; body: unknown }> = []
    page.on('request', (req) => {
      if (req.method() === 'PATCH') patches.push({ method: req.method(), url: req.url(), body: req.postDataJSON() })
    })

    const row = rowFor(page, names.occ)
    await row.getByRole('button', { name: `Update occupancy for ${names.occ}` }).click()
    const field = row.getByRole('textbox', { name: `People currently at ${names.occ}` })
    await expect(field).toHaveValue('100')
    await field.fill('150')
    await expect(row).toContainText('of 200 · was 100 · 75% after save')
    await row.getByRole('button', { name: 'Save occupancy' }).click()

    await expect(page.getByText(`Occupancy at ${names.occ} is now 150 / 200.`)).toBeVisible()
    expect(readShelter(ids.occ).capacityCurrent).toBe(150)
    expect(patches).toEqual([{ method: 'PATCH', url: `${API}/shelters/${ids.occ}/occupancy`, body: { capacity_current: 150 } }])
    await expect(row.getByRole('textbox')).toHaveCount(0)
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
    // The editor closed, so the keyboard is back on the button that opened it (an inline editor has no drawer to do that for it).
    await expect(row.getByRole('button', { name: `Update occupancy for ${names.occ}` })).toBeFocused()

    // What a citizen is shown is the same number — the public route reads the row the organisation just changed.
    const shown = await request.get(`${API}/shelters/${ids.occ}`)
    expect((await shown.json()).capacity_current).toBe(150)
    await page.reload()
    await expect(rowFor(page, names.occ).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })

  test('a number the API would refuse never leaves the browser, and Cancel changes nothing', async ({ page }) => {
    await signInAsAdmin(page, 'occ-guard')
    await openShelters(page)
    const patches: string[] = []
    page.on('request', (req) => req.method() === 'PATCH' && patches.push(req.url()))

    const row = rowFor(page, names.occ)
    await row.getByRole('button', { name: `Update occupancy for ${names.occ}` }).click()
    const field = row.getByRole('textbox', { name: `People currently at ${names.occ}` })
    const save = row.getByRole('button', { name: 'Save occupancy' })
    const before = readShelter(ids.occ).capacityCurrent

    await field.fill('201')
    await expect(row).toContainText("It can't be more than the shelter's capacity of 200.")
    await expect(save).toBeDisabled()
    await field.fill('12.5')
    await expect(row).toContainText('Use a whole number, like 87.')
    await field.fill('')
    await expect(row).toContainText('Enter how many people are there now.')
    await field.press('Enter')

    // The stepper works one person at a time.
    await field.fill('10')
    await row.getByRole('button', { name: 'One more person' }).click()
    await expect(field).toHaveValue('11')

    await row.getByRole('button', { name: 'Cancel' }).click()
    await expect(row.getByRole('textbox')).toHaveCount(0)
    await expect(row.getByRole('button', { name: `Update occupancy for ${names.occ}` })).toBeFocused()
    expect(patches).toEqual([])
    expect(readShelter(ids.occ).capacityCurrent).toBe(before)
  })

  test("a volunteer can update occupancy but is offered nothing else — and the real API refuses what they can't do", async ({ page, request }) => {
    const email = await signInAsVolunteer(page, 'volunteer')
    await openShelters(page)
    await expect(page.getByRole('button', { name: /Register shelter/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(listed().length)

    const row = rowFor(page, names.occ)
    await row.getByRole('button', { name: `Update occupancy for ${names.occ}` }).click()
    await row.getByRole('textbox').fill('175')
    await row.getByRole('button', { name: 'Save occupancy' }).click()
    await expect(page.getByText(`Occupancy at ${names.occ} is now 175 / 200.`)).toBeVisible()
    expect(readShelter(ids.occ).capacityCurrent).toBe(175)

    // The detail page has the same split.
    await page.goto(`/ngo/shelters/${ids.occ}`)
    await expect(page.getByRole('heading', { level: 1, name: names.occ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Update occupancy' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit shelter' })).toHaveCount(0)

    // …and the API behind it agrees: registering and editing are admin-only.
    const headers = bearer(await tokenFor(request, email))
    const edit = await request.patch(`${API}/shelters/${ids.occ}`, { headers, data: { status: 'closed' } })
    expect(edit.status()).toBe(403)
    expect((await edit.json()).error).toBe('insufficient permissions')
    const create = await request.post(`${API}/ngo/shelters`, { headers, data: { name: `E2E NGO Shelter Nope ${tag}`, type: 'shelter', location: { type: 'Point', coordinates: at(0.2, 0.2) }, capacity_total: 5 } })
    expect(create.status()).toBe(403)
    expect(findShelterByName(`E2E NGO Shelter Nope ${tag}`)).toBeNull()
    expect(readShelter(ids.occ).status).toBe('open')
  })

  test("a stale page's number is refused by the real API, and the list then corrects itself", async ({ page }) => {
    await signInAsAdmin(page, 'stale')
    await openShelters(page)
    const row = rowFor(page, names.stale)
    await row.getByRole('button', { name: `Update occupancy for ${names.stale}` }).click()
    const field = row.getByRole('textbox', { name: `People currently at ${names.stale}` })

    // Behind the open page, the capacity shrinks: the page still believes 400.
    setShelterNumbers(ids.stale, { capacityTotal: 250 })
    await field.fill('300')
    await row.getByRole('button', { name: 'Save occupancy' }).click()
    await expect(row.getByRole('alert')).toHaveText('capacity_current must be between 0 and capacity_total')
    expect(readShelter(ids.stale).capacityCurrent).toBe(50)

    // The failure refetched the list, so the editor now knows the real capacity and says so before another try.
    await expect(row).toContainText("It can't be more than the shelter's capacity of 250.")
    await field.fill('200')
    await row.getByRole('button', { name: 'Save occupancy' }).click()
    await expect(page.getByText(`Occupancy at ${names.stale} is now 200 / 250.`)).toBeVisible()
    expect(readShelter(ids.stale).capacityCurrent).toBe(200)
  })

  test('a shelter that has gone from under the page is reported as gone — the real 404 — and leaves the list', async ({ page }) => {
    await signInAsAdmin(page, 'gone')
    await openShelters(page)
    const row = rowFor(page, names.gone)
    await row.getByRole('button', { name: `Update occupancy for ${names.gone}` }).click()
    await row.getByRole('textbox').fill('20')

    deleteShelter(ids.gone)
    await row.getByRole('button', { name: 'Save occupancy' }).click()
    await expect(page.getByText(`${names.gone} no longer exists, so its occupancy wasn't saved. The list has been refreshed.`)).toBeVisible()
    await expect(rowFor(page, names.gone)).toHaveCount(0)
    await expect(page.getByRole('textbox')).toHaveCount(0)
  })
})

test.describe('NGO shelters — editing, real backend', () => {
  test('an admin closes and certifies a shelter — only what changed is sent — and citizens see the same', async ({ page, request }) => {
    await signInAsAdmin(page, 'edit')
    await openShelters(page)
    const patches: unknown[] = []
    page.on('request', (req) => req.method() === 'PATCH' && patches.push(req.postDataJSON()))

    await page.getByRole('button', { name: `Edit ${names.edit}` }).click()
    const drawer = page.getByRole('dialog', { name: 'Edit shelter' })
    await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await expect(drawer.getByRole('radio', { name: /^Open/ })).toBeChecked()
    await expect(drawer.getByRole('radio', { name: 'Pending certification' })).toBeChecked()
    await expect(drawer).toContainText("can't be changed once it is registered")

    await drawer.locator('label', { hasText: 'Closed' }).click()
    await drawer.locator('label', { hasText: 'Certified' }).first().click()
    await drawer.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`${names.edit} was updated.`)).toBeVisible()
    await expect(drawer).toHaveCount(0)
    expect(patches).toEqual([{ status: 'closed', certification_status: 'certified' }])
    expect(readShelter(ids.edit)).toMatchObject({ status: 'closed', certification: 'certified' })
    await expect(rowFor(page, names.edit)).toContainText('Closed')
    await expect(rowFor(page, names.edit)).toContainText('Certified')

    // A second edit changes one thing, and sends one thing.
    await page.getByRole('button', { name: `Edit ${names.edit}` }).click()
    await page.getByRole('dialog', { name: 'Edit shelter' }).locator('label', { hasText: 'Not certified' }).click()
    await page.getByRole('dialog', { name: 'Edit shelter' }).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`${names.edit} was updated.`)).toBeVisible()
    expect(patches[1]).toEqual({ certification_status: 'uncertified' })

    const shown = await (await request.get(`${API}/shelters/${ids.edit}`)).json()
    expect(shown).toMatchObject({ status: 'closed', certification_status: 'uncertified' })
  })

  test("another organisation's admin is refused by the real API for both writes, and nothing changes", async ({ request }) => {
    const outsider = await register(request, 'outsider')
    makeNgoAdminOf(outsider, ids.otherNgo)
    const headers = bearer(await tokenFor(request, outsider))
    const before = readShelter(ids.open)

    const occupancy = await request.patch(`${API}/shelters/${ids.open}/occupancy`, { headers, data: { capacity_current: 1 } })
    expect(occupancy.status()).toBe(403)
    expect((await occupancy.json()).error).toBe('this shelter is not managed by your ngo')
    const edit = await request.patch(`${API}/shelters/${ids.open}`, { headers, data: { status: 'closed' } })
    expect(edit.status()).toBe(403)
    expect((await edit.json()).error).toBe('this shelter is not managed by your ngo')
    expect(readShelter(ids.open)).toEqual(before)
  })
})

test.describe('NGO shelters — registering, real backend', () => {
  test('the form checks what the API does not — every gap named, the coordinates and capacity in range — and sends nothing until it is valid', async ({ page }) => {
    await signInAsAdmin(page, 'reg-check')
    await openShelters(page)
    const posts: string[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/ngo/shelters') && posts.push(req.url()))

    await page.getByRole('button', { name: 'Register shelter' }).click()
    const drawer = page.getByRole('dialog', { name: 'Register a shelter' })
    await expect(drawer).toContainText("can't be changed afterwards")
    await drawer.getByRole('button', { name: 'Register shelter' }).click()
    await expect(drawer.getByText('Enter the name of the shelter.')).toBeVisible()
    await expect(drawer.getByText('Enter how many people it can hold.')).toBeVisible()
    await expect(drawer.getByText('Enter the latitude, or click the map.')).toBeVisible()
    await expect(drawer.getByText('Enter the longitude, or click the map.')).toBeVisible()

    // What the real API stores without complaint (verified: longitude 200 and a swapped pair are 201) is refused here.
    await drawer.getByLabel('Name', { exact: true }).fill(`E2E NGO Shelter Bad ${tag}`)
    await drawer.getByLabel('Capacity', { exact: true }).fill('0')
    await drawer.getByLabel('Latitude', { exact: true }).fill('95')
    await drawer.getByLabel('Longitude', { exact: true }).fill('200')
    await drawer.getByRole('button', { name: 'Register shelter' }).click()
    await expect(drawer.getByText('It has to hold at least one person.')).toBeVisible()
    await expect(drawer.getByText('Latitude is between −90 and 90.', { exact: true })).toBeVisible()
    await expect(drawer.getByText('Longitude is between −180 and 180.')).toBeVisible()
    await drawer.getByLabel('Capacity', { exact: true }).fill('2147483648')
    await drawer.getByLabel('Latitude', { exact: true }).fill('120')
    await drawer.getByLabel('Longitude', { exact: true }).fill('30')
    await drawer.getByRole('button', { name: 'Register shelter' }).click()
    await expect(drawer.getByText('The largest capacity is 2,147,483,647.')).toBeVisible()
    await expect(drawer.getByText('Latitude is between −90 and 90. The two may be the wrong way round.')).toBeVisible()

    expect(posts).toEqual([])
    expect(findShelterByName(`E2E NGO Shelter Bad ${tag}`)).toBeNull()
    await drawer.getByRole('button', { name: 'Cancel' }).click()
    await expect(drawer).toHaveCount(0)
  })

  test('the map and the fields are one value: a click fills them, typing moves the pin, dragging the pin edits them — and the region note says whether citizens will see it', async ({ page }) => {
    await signInAsAdmin(page, 'reg-map')
    await openShelters(page)
    await page.getByRole('button', { name: 'Register shelter' }).click()
    const drawer = page.getByRole('dialog', { name: 'Register a shelter' })
    const map = drawer.getByRole('group', { name: "Map for choosing the shelter's location" })
    const latitude = drawer.getByLabel('Latitude', { exact: true })
    const longitude = drawer.getByLabel('Longitude', { exact: true })
    const pin = map.locator('.leaflet-marker-icon[title^="Shelter location"]')

    await expect(pin).toHaveCount(0)
    await map.locator('.leaflet-container').click()
    await expect(latitude).toHaveValue(/^-?\d+(\.\d+)?$/)
    await expect(longitude).toHaveValue(/^-?\d+(\.\d+)?$/)
    await expect(pin).toBeVisible()

    // Typing a point inside the seeded province: the map brings it into view and the note names the region.
    const [lng, lat] = at(0.3, 0.3)
    await latitude.fill(String(lat))
    await longitude.fill(String(lng))
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toContainText('In E2E')

    // Drag the pin: the fields follow it.
    await expect(pin).toBeVisible()
    const box = (await pin.boundingBox())!
    const start = { x: box.x + box.width / 2, y: box.y + box.height - 4 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => Number(await latitude.inputValue())).toBeLessThan(lat)
    await expect.poll(async () => Number(await longitude.inputValue())).toBeGreaterThan(lng)

    // A point in the sea is in no region — the API would store it happily, and no citizen would ever be shown it, so the form says it can't be saved.
    await latitude.fill('5')
    await longitude.fill('60')
    await expect(drawer.getByText(/outside the shaded areas/)).toContainText("can't be saved")
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toHaveCount(0)
  })

  test('the regions are shaded on the map, a menu jumps to one, and a spot outside every region is refused — nothing is created', async ({ page, request }) => {
    await signInAsAdmin(page, 'reg-areas')
    await openShelters(page)
    const posts: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/ngo/shelters') && posts.push(req.postDataJSON()))
    await page.getByRole('button', { name: 'Register shelter' }).click()
    const drawer = page.getByRole('dialog', { name: 'Register a shelter' })
    const map = drawer.getByRole('group', { name: "Map for choosing the shelter's location" })
    const latitude = drawer.getByLabel('Latitude', { exact: true })

    // Every region the platform has is a shaded shape on the map, and the map says what they are for.
    const regionCount = ((await (await request.get(`${API}/regions`)).json()) as unknown[]).length
    await expect(map.locator('path.leaflet-interactive')).toHaveCount(regionCount)
    await expect(drawer.getByText('Places can only be added inside the shaded areas.')).toBeVisible()

    // The menu lists them by name; choosing ours brings the map to it, so a click in the middle of the map is inside it.
    const menu = drawer.getByLabel('Jump to an area')
    await expect(menu.getByRole('option', { name: names.province })).toHaveCount(1)
    await menu.selectOption({ label: names.province })
    await expect(menu).toHaveValue('')
    await map.locator('.leaflet-container').click()
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toContainText(`In ${names.province}`)

    // A spot in the sea: the note says it can't be saved, the map shows where the shaded areas are, and saving it is refused with nothing sent.
    const name = `E2E NGO Shelter Refused ${tag}`
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.getByLabel('Capacity', { exact: true }).fill('60')
    await latitude.fill('5')
    await drawer.getByLabel('Longitude', { exact: true }).fill('60')
    await expect(drawer.getByText(/outside the shaded areas/)).toContainText("can't be saved")
    await drawer.getByRole('button', { name: 'Register shelter' }).click()
    await expect(drawer.getByText('Pick a spot inside a shaded area of the map.')).toBeVisible()
    await expect(latitude).toBeFocused()
    expect(posts).toEqual([])
    expect(findShelterByName(name)).toBeNull()
    await expect(drawer).toBeVisible()
  })

  test('registering creates a real shelter of this organisation — open, empty, pending — that citizens are then shown', async ({ page, request }) => {
    await signInAsAdmin(page, 'reg-ok')
    await openShelters(page)
    const name = `E2E NGO Shelter New ${tag}`
    const [lng, lat] = at(0.25, 0.42)
    const before = await (await request.get(`${API}/shelters?region_id=${ids.province}`)).json()
    expect((before as Array<{ name: string }>).some((s) => s.name === name)).toBe(false)

    const posted: unknown[] = []
    page.on('request', (req) => req.method() === 'POST' && req.url().endsWith('/ngo/shelters') && posted.push(req.postDataJSON()))
    await page.getByRole('button', { name: 'Register shelter' }).click()
    const drawer = page.getByRole('dialog', { name: 'Register a shelter' })
    await drawer.getByLabel('Name', { exact: true }).fill(name)
    await drawer.locator('label', { hasText: 'Relief center' }).click()
    await drawer.getByLabel('Capacity', { exact: true }).fill('120')
    await drawer.getByLabel('Latitude', { exact: true }).fill(String(lat))
    await drawer.getByLabel('Longitude', { exact: true }).fill(String(lng))
    await drawer.getByRole('button', { name: 'Register shelter' }).click()

    await expect(page.getByText(`${name} is registered. It starts open, with nobody in it, and pending certification.`)).toBeVisible()
    await expect(drawer).toHaveCount(0)
    // The request carries the point in GeoJSON order and never says which organisation — the server resolves that from the account.
    expect(posted).toEqual([{ name, type: 'relief_center', location: { type: 'Point', coordinates: [lng, lat] }, capacity_total: 120 }])

    const stored = findShelterByName(name)!
    expect(stored).toMatchObject({ ngoId: ids.ngo, type: 'relief_center', status: 'open', certification: 'pending', capacityTotal: 120, capacityCurrent: 0 })
    expect(stored.lat).toBeCloseTo(lat, 5)
    expect(stored.lng).toBeCloseTo(lng, 5)

    const row = rowFor(page, name)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Relief center')
    await expect(row).toContainText('Pending certification')
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    // It is inside the province, so the region query citizens' map uses now returns it.
    const after = (await (await request.get(`${API}/shelters?region_id=${ids.province}`)).json()) as Array<{ name: string; managed_by_ngo_id?: string }>
    expect(after.find((s) => s.name === name)?.managed_by_ngo_id).toBe(ids.ngo)
  })
})

test.describe('NGO shelters — using the browser position, real backend', () => {
  const me: [number, number] = [at(0.3, 0.3)[1], at(0.3, 0.3)[0]] // [lat, lng], inside the seeded province
  test.use({ permissions: ['geolocation'], geolocation: { latitude: me[0], longitude: me[1] } })

  test('"Use my location" fills the point from the browser — only when pressed — and the note says it is in a region', async ({ page }) => {
    await signInAsAdmin(page, 'reg-locate')
    await openShelters(page)
    await page.getByRole('button', { name: 'Register shelter' }).click()
    const drawer = page.getByRole('dialog', { name: 'Register a shelter' })
    await expect(drawer.getByLabel('Latitude', { exact: true })).toHaveValue('')

    await drawer.getByRole('button', { name: 'Use my location' }).click()
    await expect(drawer.getByLabel('Latitude', { exact: true })).toHaveValue(String(Number(me[0].toFixed(6))))
    await expect(drawer.getByLabel('Longitude', { exact: true })).toHaveValue(String(Number(me[1].toFixed(6))))
    await expect(drawer.locator('.leaflet-marker-icon[title^="Shelter location"]')).toBeVisible()
    await expect(drawer.getByText(/citizens looking at that region will see it/)).toContainText('In E2E')
  })
})

test.describe('NGO shelter detail — real backend', () => {
  test("opens from the list with the stored values, the shelter on a map inside its flood zone and whether citizens see it; occupancy updates from the card; Back keeps the list's view", async ({ page }) => {
    await signInAsAdmin(page, 'detail')
    await openShelters(page)
    await page.getByRole('group', { name: 'Filter shelters' }).getByRole('button', { name: /^Open/ }).click()
    await expect(page).toHaveURL(/show=open/)
    await page.getByRole('link', { name: `View ${names.open}` }).click()
    await expect(page).toHaveURL(new RegExp(`/ngo/shelters/${ids.open}$`))

    const stored = readShelter(ids.open)
    await expect(page.getByRole('heading', { level: 1, name: stored.name })).toBeVisible()
    const occupancy = page.getByRole('region', { name: 'Occupancy' })
    await expect(occupancy).toContainText(`Capacity ${stored.capacityCurrent} / ${stored.capacityTotal}`)
    await expect(occupancy.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', percent(stored.capacityCurrent, stored.capacityTotal))
    const details = page.getByRole('region', { name: 'Details' })
    await expect(details).toContainText('Shelter')
    await expect(details).toContainText('Certified')
    await expect(details).toContainText('Your organisation')

    const location = page.getByRole('region', { name: 'Location' })
    await expect(location.getByRole('button', { name: `${names.open}, Shelter, Open` })).toBeVisible()
    await expect(location.locator('path.hazard-zone.hazard-high').first()).toBeVisible({ timeout: 20_000 })
    await expect(location).toContainText(`${stored.lat.toFixed(4)}° N, ${stored.lng.toFixed(4)}° E`)
    await expect(location.getByText(/citizens looking at that region will see it/)).toContainText('In E2E')

    await page.getByRole('button', { name: 'Update occupancy' }).click()
    await page.getByRole('textbox', { name: `People currently at ${names.open}` }).fill('300')
    await page.getByRole('button', { name: 'Save occupancy' }).click()
    await expect(page.getByText(`Occupancy at ${names.open} is now 300 / 400.`)).toBeVisible()
    expect(readShelter(ids.open).capacityCurrent).toBe(300)
    await expect(occupancy).toContainText('Capacity 300 / 400')
    await expect(occupancy.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')

    await page.getByRole('link', { name: 'Back to shelters' }).click()
    await expect(page).toHaveURL(/\/ngo\/shelters\?show=open$/)
    await expect(page.getByRole('group', { name: 'Filter shelters' }).getByRole('button', { name: /^Open/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(rowFor(page, names.open).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })

  test('an admin edits from the detail page too', async ({ page }) => {
    await signInAsAdmin(page, 'detail-edit')
    await page.goto(`/ngo/shelters/${ids.full}`)
    await expect(page.getByRole('heading', { level: 1, name: names.full })).toBeVisible()
    await page.getByRole('button', { name: 'Edit shelter' }).click()
    await page.getByRole('dialog', { name: 'Edit shelter' }).locator('label', { hasText: 'Closed' }).click()
    await page.getByRole('dialog', { name: 'Edit shelter' }).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`${names.full} was updated.`)).toBeVisible()
    expect(readShelter(ids.full).status).toBe('closed')
    await expect(page.getByRole('region', { name: 'Occupancy' })).toContainText('Closed — citizens see this shelter as closed.')
  })

  test("another organisation's shelter is shown read-only — and the real API refuses the admin's writes to it", async ({ page, request }) => {
    const email = await signInAsAdmin(page, 'foreign')
    await page.goto(`/ngo/shelters/${ids.foreign}`)
    await expect(page.getByRole('heading', { level: 1, name: names.foreign })).toBeVisible()
    await expect(page.getByText(/run by another organisation/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit shelter' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Update occupancy' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Details' })).toContainText('Another organisation')

    const before = readShelter(ids.foreign)
    const res = await request.patch(`${API}/shelters/${ids.foreign}/occupancy`, { headers: bearer(await tokenFor(request, email)), data: { capacity_current: 1 } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('this shelter is not managed by your ngo')
    expect(readShelter(ids.foreign)).toEqual(before)
  })

  test('an unknown shelter and a malformed id both say "not found" — the real 404 and 400 — and lead back to the list', async ({ page }) => {
    await signInAsAdmin(page, 'missing')
    await page.goto('/ngo/shelters/3fa85f64-5717-4562-b3fc-2c963f66afa6')
    await expect(page.getByRole('heading', { name: 'Shelter not found' })).toBeVisible()
    await page.goto('/ngo/shelters/not-a-real-id')
    await expect(page.getByRole('heading', { name: 'Shelter not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to shelters' }).click()
    await expect(page).toHaveURL(/\/ngo\/shelters$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Shelters' })).toBeVisible()
  })
})
