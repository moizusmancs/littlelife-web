import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { API, password, randomWorld, signInCitizen, visit } from './helpers/citizen'
import { seedActivityEvents, seedEssentialLocation, seedIncidentReports, seedRegion, seedShelter, type ActivityTimes, type SeededActivity } from './helpers/seed'

/**
 * Activity Timeline against the real backend. One row of every kind is seeded straight into Postgres at exact times (so the order and the day
 * headings are exact), beside a second account's own rows that must never appear here. The screen is then read against what
 * `GET /profile/activity-timeline` itself returns — the same events, in the same order — and paged through to the end. API-side checks use the
 * test's own `request` fixture, never a page's, so no session cookie leaks into the page's browser.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const now = () => new Date()
/** Local noon-ish times: `back` days ago at `hour` — so day headings are what a person in this zone would see. */
const day = (back: number, hour: number) => {
  const n = now()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() - back, hour, 0)
}
const dated = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

/** Times for the eight seeded events, newest first: two today, two yesterday, four ten days ago. */
function times(): ActivityTimes {
  const n = now().getTime()
  return {
    incidentReport: new Date(n - 1000),
    incidentVote: new Date(n - 2000),
    aidRequest: day(1, 15),
    donation: day(1, 9),
    shelterReport: day(10, 18),
    placeReport: day(10, 17),
    missingPerson: day(10, 11),
    sighting: day(10, 8),
  }
}

async function seedWorld(email: string, otherEmail: string, at = times()) {
  const world = randomWorld()
  const region = seedRegion(`E2E Activity ${world.tag}`, 'province', undefined, world.rect(0, 0, 0.5, 0.5))
  const [lng, lat] = world.at(0.2, 0.2)
  const shelterName = `E2E Activity Shelter ${world.tag}`
  const shelterId = seedShelter(region, { name: shelterName, lng, lat, capacityTotal: 100, capacityCurrent: 10 })
  const [plng, plat] = world.at(0.3, 0.3)
  const essentialLocationId = seedEssentialLocation(region, { name: `E2E Activity Pharmacy ${world.tag}`, lng: plng, lat: plat, type: 'pharmacy' })
  const ids = seedActivityEvents(email, { otherEmail, shelterId, essentialLocationId, at })
  return { ids, shelterId, shelterName, at }
}

async function timelineAsSeenBy(request: APIRequestContext, email: string, query = '') {
  const login = await request.post(`${API}/auth/login`, { data: { email, password } })
  const { access_token: token } = (await login.json()) as { access_token: string }
  const res = await request.get(`${API}/profile/activity-timeline${query}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: res.status(), body: (await res.json()) as Array<{ id: string; type: string; occurred_at: string; subject_id: string; detail: Record<string, unknown> }> }
}

async function openActivity(page: Page, search = '') {
  await visit(page, `/app/profile/activity${search}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible()
}

const rows = (page: Page) => page.locator('main ul > li')

test.describe('Activity Timeline — real backend', () => {
  test('an account with no activity sees an empty state, and the API says []', async ({ page, request }) => {
    const email = await signInCitizen(page, 'act-empty')
    await openActivity(page)

    await expect(page.getByText('No activity yet')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Activity', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(await timelineAsSeenBy(request, email)).toEqual({ status: 200, body: [] })
  })

  test('shows every kind as a sentence under its day, in the order and with the times the API gives — and none of anyone else\'s', async ({ page, request, browser }) => {
    const email = await signInCitizen(page, 'act-all', undefined, 'E2E Activity Me')
    const other = await browser.newContext()
    try {
      const otherPage = await other.newPage()
      const otherEmail = await signInCitizen(otherPage, 'act-other', undefined, 'E2E Activity Other')
      const { ids, at } = await seedWorld(email, otherEmail)
      await openActivity(page)

      // The day headings, in this zone: two today, two yesterday, four ten days ago.
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Today', 'Yesterday', dated(at.shelterReport)])
      const today = page.getByRole('region', { name: 'Today' })
      await expect(today.getByText('You reported flooding')).toBeVisible()
      await expect(today.getByText('Verified')).toBeVisible()
      await expect(today.getByText('You upvoted an incident report')).toBeVisible()
      const yesterday = page.getByRole('region', { name: 'Yesterday' })
      await expect(yesterday.getByText('You requested medical help')).toBeVisible()
      await expect(yesterday.getByText('High', { exact: true })).toBeVisible()
      await expect(yesterday.getByText('Pending')).toBeVisible()
      await expect(yesterday.getByText('You donated 5,000')).toBeVisible()
      await expect(yesterday.getByText('Delivered')).toBeVisible()
      const older = page.getByRole('region', { name: dated(at.shelterReport) })
      await expect(older.getByText('You reported a shelter as open')).toBeVisible()
      await expect(older.getByText('You reported a place as open')).toBeVisible()
      await expect(older.getByText('You reported a missing person')).toBeVisible()
      await expect(older.getByText('Found')).toBeVisible()
      await expect(older.getByText('You reported a sighting of a missing person')).toBeVisible()

      // Exactly the API's events, in the API's order, at the API's times.
      const api = await timelineAsSeenBy(request, email)
      expect(api.status).toBe(200)
      expect(api.body.map((e) => e.id)).toEqual([
        `incident_report:${ids.incidentReportId}`,
        `incident_vote:${ids.incidentVoteId}`,
        `aid_request:${ids.aidRequestId}`,
        `donation:${ids.donationId}`,
        expect.stringMatching(/^status_report:/),
        expect.stringMatching(/^status_report:/),
        `missing_person_report:${ids.missingPersonId}`,
        `missing_person_sighting:${ids.sightingId}`,
      ])
      await expect(rows(page)).toHaveCount(8)
      expect(await page.locator('main time').evaluateAll((els) => els.map((el) => el.getAttribute('datetime')))).toEqual(api.body.map((e) => e.occurred_at))

      // The other account's rows are in the same tables, and are theirs alone.
      await openActivity(otherPage)
      await expect(otherPage.getByText('You reported a blocked road')).toBeVisible()
      await expect(otherPage.getByText('You requested food')).toBeVisible()
      await expect(otherPage.getByText('You donated 111')).toBeVisible()
      await expect(otherPage.getByText('You reported a place as closed')).toBeVisible()
      await expect(rows(otherPage)).toHaveCount(5)
      await expect(otherPage.getByText('You donated 5,000')).toHaveCount(0)
      await expect(otherPage.getByText('You reported flooding')).toHaveCount(0)
    } finally {
      await other.close()
    }
  })

  test("a shelter's status report links to the shelter, and nothing else is a link", async ({ page, browser }) => {
    const email = await signInCitizen(page, 'act-link')
    const other = await browser.newContext()
    try {
      const otherEmail = await signInCitizen(await other.newPage(), 'act-link-other')
      const { shelterId, shelterName } = await seedWorld(email, otherEmail)
      await openActivity(page)

      const links = page.locator('main').getByRole('link').filter({ hasText: /^You reported/ })
      await expect(links).toHaveCount(1)
      await expect(links.first()).toHaveText('You reported a shelter as open')
      await links.first().click()

      await expect(page).toHaveURL(new RegExp(`/app/map/shelters/${shelterId}$`))
      await expect(page.getByRole('heading', { name: shelterName })).toBeVisible()
    } finally {
      await other.close()
    }
  })

  test('each filter shows only its kind — asked of the server — keeps the choice in the URL, and survives a reload', async ({ page, browser }) => {
    const email = await signInCitizen(page, 'act-filter')
    const other = await browser.newContext()
    try {
      const otherEmail = await signInCitizen(await other.newPage(), 'act-filter-other')
      await seedWorld(email, otherEmail)
      await openActivity(page)
      await expect(rows(page)).toHaveCount(8)

      const expected: Array<[string, number]> = [
        ['Incident reports', 1],
        ['Votes', 1],
        ['Aid requests', 1],
        ['Donations', 1],
        ['Place updates', 2],
        ['Missing persons', 1],
        ['Sightings', 1],
      ]
      for (const [label, count] of expected) {
        await page.getByRole('button', { name: label, exact: true }).click()
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
        await expect(rows(page)).toHaveCount(count)
      }

      await page.getByRole('button', { name: 'Donations', exact: true }).click()
      await expect(page).toHaveURL(/\?show=donation$/)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Donations', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(rows(page)).toHaveCount(1)
      await expect(page.getByText('You donated 5,000')).toBeVisible()

      await page.getByRole('button', { name: 'All', exact: true }).click()
      await expect(rows(page)).toHaveCount(8)
      await expect(page).toHaveURL(/\/app\/profile\/activity$/)
    } finally {
      await other.close()
    }
  })

  test('a kind with nothing in it says so, and an unknown ?show= is All', async ({ page }) => {
    await signInCitizen(page, 'act-none')
    await openActivity(page, '?show=donation')
    await expect(page.getByText('No donations yet')).toBeVisible()

    await openActivity(page, '?show=nonsense')
    await expect(page.getByText('No activity yet')).toBeVisible()
    await expect(page).toHaveURL(/\/app\/profile\/activity$/)
  })

  test('a long timeline loads a page at a time — 25, 50, then the rest — with no repeat and no gap, in the API\'s order', async ({ page, request, browser }) => {
    const email = await signInCitizen(page, 'act-paging')
    const other = await browser.newContext()
    try {
      const otherEmail = await signInCitizen(await other.newPage(), 'act-paging-other')
      await seedWorld(email, otherEmail)
      seedIncidentReports(email, 60, day(20, 12)) // 8 seeded + 60 older = 68

      await openActivity(page)
      await expect(rows(page)).toHaveCount(25)
      await page.getByRole('button', { name: 'Load more' }).click()
      await expect(rows(page)).toHaveCount(50)
      await page.getByRole('button', { name: 'Load more' }).click()
      await expect(rows(page)).toHaveCount(68) // 18 < 25: the last page
      await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)

      // The API walked the same way (offset by what's held) gives the same 68, once each, in the same order.
      const walked: string[] = []
      const times: string[] = []
      for (let offset = 0; ; offset += 25) {
        const { body } = await timelineAsSeenBy(request, email, `?limit=25&offset=${offset}`)
        walked.push(...body.map((e) => e.id))
        times.push(...body.map((e) => e.occurred_at))
        if (body.length < 25) break
      }
      expect(walked).toHaveLength(68)
      expect(new Set(walked).size).toBe(68)
      expect(await page.locator('main time').evaluateAll((els) => els.map((el) => el.getAttribute('datetime')))).toEqual(times)
    } finally {
      await other.close()
    }
  })

  test('on a phone: every kind readable, the filters wrap, Load more is reachable, and nothing scrolls sideways', async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const email = await signInCitizen(page, 'act-phone')
    const other = await browser.newContext()
    try {
      const otherEmail = await signInCitizen(await other.newPage(), 'act-phone-other')
      await seedWorld(email, otherEmail)
      seedIncidentReports(email, 30, day(20, 12))
      await openActivity(page)

      await expect(page.getByRole('button', { name: 'Sightings', exact: true })).toBeVisible()
      await expect(page.getByText('You reported flooding').first()).toBeInViewport() // the newest event is on the first screen
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      const more = page.getByRole('button', { name: 'Load more' })
      await more.scrollIntoViewIfNeeded()
      await more.click()
      await expect(rows(page)).toHaveCount(38) // 8 + 30, all in two pages
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await other.close()
    }
  })
})

// The API's own contract, as the screen relies on it (the rest of the file is what the screen does with it).
test.describe('GET /profile/activity-timeline — the parts the screen relies on', () => {
  test('type filters before paging, an unknown type is a 400, and a bad limit or offset is reset, not refused', async ({ page, request, browser }) => {
    const email = await signInCitizen(page, 'act-api')
    const other = await browser.newContext()
    try {
      const otherEmail = await signInCitizen(await other.newPage(), 'act-api-other')
      const { ids } = await seedWorld(email, otherEmail)
      seedIncidentReports(email, 30, day(20, 12))
      const world: SeededActivity = ids

      const votes = await timelineAsSeenBy(request, email, '?type=incident_vote')
      expect(votes.body.map((e) => e.id)).toEqual([`incident_vote:${world.incidentVoteId}`])
      expect((await timelineAsSeenBy(request, email, '?type=incident_report&limit=10')).body).toHaveLength(10)
      const bad = await timelineAsSeenBy(request, email, '?type=Donation')
      expect(bad.status).toBe(400)
      expect((await timelineAsSeenBy(request, email, '?limit=1000')).body).toHaveLength(25) // reset to 25, not clamped to 100
      expect((await timelineAsSeenBy(request, email, '?limit=abc&offset=-3')).body).toHaveLength(25)
      expect((await timelineAsSeenBy(request, email, '?offset=500')).body).toEqual([])
    } finally {
      await other.close()
    }
  })
})
