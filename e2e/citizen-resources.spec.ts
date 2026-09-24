import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  deleteEssentialLocation,
  readEssentialLocation,
  readEssentialReports,
  seedEssentialLocation,
  seedHomeRegion,
  seedRegion,
  seedShelter,
  squareRing,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for Resources › Local (/app/resources), against the real backend with no stubbed responses. The world is `E2E …` rows in
 * Postgres: a home province with a shelter and four essential places (open by a report, closed by a report, and two nobody has reported
 * on), and a second province with one pharmacy, so "Everywhere" has something to add. Every citizen has the first province as home region.
 * Reports are proved in the database — including *who* filed them, which the API never returns.
 */
const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`

// Each run puts its world somewhere of its own — a random 0.6° square in the open sea and coast south-east of the real regions (12–17°N,
// 76–84°E), with the second province a degree to the east — so an earlier run's rows, which stay until the cleanup, can never join this
// run's home region and change what its lists say.
const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
const HOME: [number, number] = [76 + jitter(7), 12 + jitter(5)]
const OTHER: [number, number] = [HOME[0] + 1, HOME[1]]
const at = (origin: [number, number], dx: number, dy: number): [number, number] => [Number((origin[0] + dx).toFixed(4)), Number((origin[1] + dy).toFixed(4))]
const names = {
  home: `E2E Res Home ${tag}`,
  other: `E2E Res Other ${tag}`,
  shelter: `E2E Res Shelter ${tag}`,
  open: `E2E Res Pharmacy Open ${tag}`,
  unknown: `E2E Res Pharmacy Unknown ${tag}`,
  grocery: `E2E Res Grocery Closed ${tag}`,
  atm: `E2E Res ATM ${tag}`,
  elsewhere: `E2E Res Elsewhere ${tag}`,
}
const ids = { home: '', other: '', shelter: '', open: '', unknown: '', grocery: '', atm: '', elsewhere: '' }
const HOME_PLACES = [names.shelter, names.open, names.unknown, names.grocery, names.atm]

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function register(api: APIRequestContext, label: string) {
  const email = `e2e-res-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await api.post(`${API}/auth/register`, { data: { email, password }, timeout: 30_000 })
  expect(res.ok()).toBeTruthy()
  return email
}

/** A verified, onboarded citizen with the home province as home region, signed in and on /app/home. */
async function signIn(page: Page, label: string) {
  const email = await register(page.request, label)
  verifyAndOnboardAccount(email, 'E2E Res Citizen')
  seedHomeRegion(email, ids.home)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
  return email
}

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })
const listed = async (page: Page) => (await page.getByRole('listitem').locator('p.font-semibold').allInnerTexts()).filter((text) => text.startsWith('E2E Res '))
const haversineKm = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000)
  const reporter = await register(request, 'reporter')
  ids.home = seedRegion(names.home, 'province', undefined, squareRing(HOME[0], HOME[1], 0.6))
  ids.other = seedRegion(names.other, 'province', undefined, squareRing(OTHER[0], OTHER[1], 0.6))
  const place = (dx: number, dy: number) => ({ lng: at(HOME, dx, dy)[0], lat: at(HOME, dx, dy)[1] })
  ids.shelter = seedShelter(ids.home, { name: names.shelter, ...place(0.1, 0.1), capacityTotal: 400, capacityCurrent: 265 })
  ids.open = seedEssentialLocation(ids.home, { name: names.open, ...place(0.2, 0.3), type: 'pharmacy', report: { by: reporter, status: 'open' } })
  ids.unknown = seedEssentialLocation(ids.home, { name: names.unknown, ...place(0.4, 0.1), type: 'pharmacy' })
  ids.grocery = seedEssentialLocation(ids.home, { name: names.grocery, ...place(0.3, 0.5), type: 'grocery_store', report: { by: reporter, status: 'closed' } })
  ids.atm = seedEssentialLocation(ids.home, { name: names.atm, ...place(0.5, 0.4), type: 'atm' })
  ids.elsewhere = seedEssentialLocation(ids.other, { name: names.elsewhere, lng: at(OTHER, 0.2, 0.2)[0], lat: at(OTHER, 0.2, 0.2)[1], type: 'pharmacy' })
})

test.describe('Resources › Local — real backend', () => {
  test('opens on Local resources and lists the home region’s shelter and shops with their real statuses, asking only for that region', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.startsWith(`${API}/shelters?`) || url.startsWith(`${API}/essential-locations?`)) asked.push(new URL(url).searchParams.get('region_id') ?? '')
    })
    await signIn(page, 'list')
    await page.goto('/app/resources')
    await expect(page.getByRole('tab', { name: 'Local resources' })).toHaveAttribute('aria-selected', 'true')
    await expect(row(page, names.open)).toBeVisible({ timeout: 20_000 })
    expect((await listed(page)).sort()).toEqual([...HOME_PLACES].sort())
    expect(new Set(asked)).toEqual(new Set([ids.home]))

    await expect(row(page, names.open)).toContainText('Open')
    await expect(row(page, names.open)).toContainText(/Reported open .* ago/)
    await expect(row(page, names.grocery)).toContainText('Closed')
    await expect(row(page, names.unknown)).toContainText('Status unknown')
    await expect(row(page, names.unknown)).toContainText('Nobody has reported yet')
    await expect(row(page, names.shelter)).toContainText('Capacity 265 / 400')
    await expect(row(page, names.shelter).getByRole('link', { name: /Details for/ })).toHaveAttribute('href', `/app/map/shelters/${ids.shelter}`)
    await expect(row(page, names.shelter).getByRole('button', { name: /Mark .* as/ })).toHaveCount(0)

    const stored = readEssentialLocation(ids.atm)
    await expect(row(page, names.atm).getByRole('link', { name: /Navigate to/ })).toHaveAttribute('href', `/app/navigate?destination=${stored.lat},${stored.lng}`)
    await expect(row(page, names.shelter).getByRole('link', { name: /Navigate to/ })).toHaveAttribute('href', `/app/navigate?destination_shelter_id=${ids.shelter}`)
  })

  test('the chips filter by kind with their counts, and the other tabs are placeholders that keep their place in the URL', async ({ page }) => {
    await signIn(page, 'chips')
    await page.goto('/app/resources')
    await expect(row(page, names.open)).toBeVisible({ timeout: 20_000 })
    const chips = page.getByRole('group', { name: 'Kind of place' })
    await expect(chips.getByRole('button', { name: /^Pharmacies/ })).toContainText('2')
    await chips.getByRole('button', { name: /^Pharmacies/ }).click()
    expect((await listed(page)).sort()).toEqual([names.open, names.unknown].sort())
    await chips.getByRole('button', { name: /^ATMs/ }).click()
    expect(await listed(page)).toEqual([names.atm])
    await expect(page.getByRole('button', { name: /Fuel|Water/ })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Campaigns' }).click()
    await expect(page).toHaveURL(/\/app\/resources\?tab=campaigns$/)
    await expect(page.getByText('Not built yet — ships in Phase 6.')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Campaigns' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Local resources' }).click()
    await expect(page).toHaveURL(/\/app\/resources$/)
  })

  test('marking a place open or closed files a real report under the citizen’s own account — and another citizen sees it', async ({ page, browser }) => {
    const email = await signIn(page, 'report')
    await page.goto('/app/resources')
    await expect(row(page, names.unknown)).toBeVisible({ timeout: 20_000 })
    expect(readEssentialReports(ids.unknown)).toEqual([])

    await page.getByRole('button', { name: `Mark ${names.unknown} as open` }).click()
    await expect(page.getByText(`Thanks — ${names.unknown} is now shown as open.`)).toBeVisible()
    await expect(row(page, names.unknown)).toContainText('Open')
    await expect(row(page, names.unknown)).toContainText(/Reported open .* ago/)
    expect(readEssentialReports(ids.unknown)).toEqual([{ status: 'open', by: email }])
    // Now open, so only the opposite report is offered.
    await expect(page.getByRole('button', { name: `Mark ${names.unknown} as open` })).toHaveCount(0)

    await page.getByRole('button', { name: `Mark ${names.unknown} as closed` }).click()
    await expect(row(page, names.unknown)).toContainText('Closed')
    expect(readEssentialReports(ids.unknown).map((r) => r.status)).toEqual(['open', 'closed'])

    // It survives a reload, and a different citizen, in a different session, sees the same.
    await page.reload()
    await expect(row(page, names.unknown)).toContainText('Closed')
    const context = await browser.newContext()
    const other = await context.newPage()
    await signIn(other, 'observer')
    await other.goto('/app/resources')
    await expect(row(other, names.unknown)).toContainText('Closed', { timeout: 20_000 })
    await context.close()
  })

  test('a report about a place that has just been removed gets the real 404, says so, and the list refreshes', async ({ page }) => {
    await signIn(page, 'gone')
    await page.goto('/app/resources')
    await expect(row(page, names.atm)).toBeVisible({ timeout: 20_000 })
    const doomed = seedEssentialLocation(ids.home, { name: `E2E Res Doomed ${tag}`, lng: at(HOME, 0.05, 0.55)[0], lat: at(HOME, 0.05, 0.55)[1], type: 'atm' })
    await page.reload()
    await expect(row(page, `E2E Res Doomed ${tag}`)).toBeVisible({ timeout: 20_000 })

    deleteEssentialLocation(doomed)
    await page.getByRole('button', { name: `Mark E2E Res Doomed ${tag} as closed` }).click()
    await expect(page.getByText(/no longer listed, so your report wasn't sent/)).toBeVisible()
    await expect(row(page, `E2E Res Doomed ${tag}`)).toHaveCount(0)
    expect(readEssentialReports(doomed)).toEqual([])
  })

  test('Everywhere adds the other region’s places, and the home region takes them away again', async ({ page }) => {
    await signIn(page, 'scope')
    await page.goto('/app/resources')
    await expect(row(page, names.open)).toBeVisible({ timeout: 20_000 })
    await expect(row(page, names.elsewhere)).toHaveCount(0)

    await page.getByRole('button', { name: 'Everywhere' }).click()
    await expect(row(page, names.elsewhere)).toBeVisible({ timeout: 20_000 })
    await expect(row(page, names.open)).toBeVisible()
    await page.getByRole('button', { name: names.home }).click()
    await expect(row(page, names.elsewhere)).toHaveCount(0)
  })
})

test.describe('Resources › Local — nearest first, real backend', () => {
  const me: [number, number] = [at(HOME, 0.5, 0.45)[1], at(HOME, 0.5, 0.45)[0]] // [lat, lng], beside the ATM
  test.use({ permissions: ['geolocation'], geolocation: { latitude: me[0], longitude: me[1] } })

  test('asks for the position only when pressed, then orders the list by real distance', async ({ page }) => {
    await signIn(page, 'near')
    await page.goto('/app/resources')
    await expect(row(page, names.open)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/km away|\bm away/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Nearest first' }).click()
    await expect(page.getByText(/km away|\bm away/).first()).toBeVisible()
    const coords = new Map<string, [number, number]>()
    for (const [name, id] of [[names.open, ids.open], [names.unknown, ids.unknown], [names.grocery, ids.grocery], [names.atm, ids.atm]] as const) {
      const stored = readEssentialLocation(id)
      coords.set(name, [stored.lat, stored.lng])
    }
    coords.set(names.shelter, [at(HOME, 0.1, 0.1)[1], at(HOME, 0.1, 0.1)[0]])
    const expected = [...coords.entries()].sort((a, b) => haversineKm(me, a[1]) - haversineKm(me, b[1])).map(([name]) => name)
    expect(await listed(page)).toEqual(expected)
    expect(expected[0]).toBe(names.atm)
  })
})
