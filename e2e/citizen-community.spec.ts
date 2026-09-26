import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { API, password, randomWorld, register, signInCitizen, visit } from './helpers/citizen'
import { deleteFeedReport, promoteToPlatformAdmin, readReportCounts, readReportVotes, seedFeedReport, seedRegion, seedReportMedia, verifyAndOnboardAccount } from './helpers/seed'

/**
 * Community Feed (/app/community) against the real backend. The feed is nationwide, so each run's reports carry a unique tag in their
 * description and the tests narrow the feed to them with the page's own search — real reports around them never change a count. Reports
 * and media rows are seeded in Postgres (media URLs point at a file the dev server already serves, so no upload is left on disk); the
 * official update is posted by an `e2e-` platform admin through the real `POST /community-updates`, and a rejection goes through the real
 * `PATCH /admin/incident-reports/{id}/reject`.
 */
// One test at a time (the config is fully parallel): two tests compare the page's "N reports were rejected" with the API's nationwide count,
// which another test seeding its own rejected report at the same moment would move.
test.describe.configure({ mode: 'default', timeout: 120_000 })

const PHOTO = 'http://localhost:5173/favicon.svg'

async function tokenFor(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { access_token: string }).access_token
}

interface FeedWorld {
  tag: string
  regionId: string
  regionName: string
  reporter: string
  admin: string
  adminToken: string
  point: (dx: number) => [number, number]
  ids: { flood: string; road: string; wire: string; rejected: string }
  updateTitle: string
}

/** A region of this run's own, three shown reports and a rejected one by another citizen, and an official update for the region. */
async function seedFeedWorld(request: APIRequestContext): Promise<FeedWorld> {
  const world = randomWorld()
  const tag = `E2E feed ${world.tag}`
  const regionName = `E2E Feed ${world.tag}`
  const regionId = seedRegion(regionName, 'province', undefined, world.rect(0, 0, 0.6, 0.6))
  const point = (dx: number) => world.at(0.1 + dx, 0.1)

  const reporter = await register(request, 'feed-reporter')
  verifyAndOnboardAccount(reporter, 'E2E Reporter')
  const [fx, fy] = point(0)
  const [rx, ry] = point(0.3)
  const [wx, wy] = point(0.1)
  const flood = seedFeedReport(reporter, { category: 'flooding', description: `${tag} — river over the embankment`, lng: fx, lat: fy, upvotes: 4, downvotes: 1, minutesAgo: 30 })
  const road = seedFeedReport(reporter, { category: 'blocked_road', description: `${tag} — fallen tree on the bypass`, lng: rx, lat: ry, status: 'verified', upvotes: 7, minutesAgo: 90 })
  const wire = seedFeedReport(reporter, { category: 'other_hazard', description: `${tag} — live wire in the water`, lng: wx, lat: wy, status: 'in_progress', minutesAgo: 60 })
  const rejected = seedFeedReport(reporter, { category: 'flooding', description: `${tag} — duplicate of another report`, lng: fx, lat: fy, status: 'rejected', minutesAgo: 10 })
  seedReportMedia(flood, PHOTO)
  seedReportMedia(wire, PHOTO)
  seedReportMedia(wire, 'http://localhost:5173/clip.mp4', 'video')

  const admin = await register(request, 'feed-admin')
  promoteToPlatformAdmin(admin)
  const adminToken = await tokenFor(request, admin)
  const updateTitle = `${tag} — water tankers on Main Bazaar`
  const posted = await request.post(`${API}/community-updates`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { region_id: regionId, title: updateTitle, content: 'Tankers visit between 8 AM and 6 PM. Bring clean containers.' },
  })
  expect(posted.status()).toBe(201)

  return { tag, regionId, regionName, reporter, admin, adminToken, point, ids: { flood, road, wire, rejected }, updateTitle }
}

/** The text of each card in the list, in order, reduced to which of this run's items it is. */
async function cardOrder(page: Page) {
  const texts = await page.getByRole('list', { name: 'Reports and updates' }).getByRole('article').allInnerTexts()
  return texts.map((text) =>
    text.includes('water tankers') ? 'update' : text.includes('river over') ? 'flood' : text.includes('fallen tree') ? 'road' : text.includes('live wire') ? 'wire' : text.includes('duplicate') ? 'rejected' : 'other',
  )
}

async function rejectedInApi(request: APIRequestContext) {
  const res = await request.get(`${API}/incident-reports`, { params: { bbox: '-180,-90,180,90' } })
  const reports = (await res.json()) as Array<{ status: string }>
  return reports.filter((report) => report.status === 'rejected').length
}

test('Latest: this run’s reports and the region’s official update, newest first; the rejected one hidden and counted; photos and totals as stored', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'feed-citizen', w.regionId)

  const listRequest = page.waitForRequest((req) => req.url().includes('/incident-reports?') && req.method() === 'GET')
  await visit(page, `/app/community?q=${encodeURIComponent(w.tag)}`)
  expect(new URL((await listRequest).url()).searchParams.get('bbox')).toBe('-180,-90,180,90')

  await expect.poll(() => cardOrder(page)).toEqual(['update', 'flood', 'wire', 'road'])
  await expect(page.getByText(w.updateTitle)).toBeVisible()
  await expect(page.getByText(`For ${w.regionName}`)).toBeVisible()
  await expect(page.getByText('duplicate of another report')).toHaveCount(0)
  const hidden = await rejectedInApi(request)
  await expect(page.getByText(new RegExp(`^${hidden} reports? (was|were) rejected by moderators`))).toBeVisible()

  const flood = page.getByRole('article').filter({ hasText: 'river over the embankment' })
  await expect(flood.getByText('A community member', { exact: true })).toBeVisible()
  await expect(flood.getByText('Not verified yet')).toBeVisible()
  await expect(flood.getByText(/^3\d minutes ago$/)).toBeVisible()
  await expect(flood.getByRole('group', { name: '4 upvotes, 1 downvote' })).toBeVisible()
  const photo = flood.getByRole('img', { name: 'Photo attached to this report' })
  await expect(photo).toHaveAttribute('src', PHOTO)
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

  const wire = page.getByRole('article').filter({ hasText: 'live wire' })
  await expect(wire.getByText('Being handled')).toBeVisible()
  // A photo and a video: the photo is the preview, "+1" the rest.
  await expect(wire.getByRole('img', { name: 'Photo attached to this report' })).toBeVisible()
  await expect(wire.getByText('+1')).toBeVisible()
  const road = page.getByRole('article').filter({ hasText: 'fallen tree' })
  await expect(road.getByText('Verified', { exact: true })).toBeVisible()
  await expect(road.getByRole('group', { name: '7 upvotes, 0 downvotes' })).toBeVisible()
  // A new citizen has voted on nothing: every card offers both buttons, neither pressed.
  await expect(road.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'false')
  await expect(road.getByRole('button', { name: 'Downvote' })).toHaveAttribute('aria-pressed', 'false')
})

test('the viewer’s own report says "You"; another citizen sees the same report as "A community member"', async ({ page, request, browser }) => {
  const w = await seedFeedWorld(request)
  const me = await signInCitizen(page, 'feed-me', w.regionId)
  const [x, y] = w.point(0.2)
  seedFeedReport(me, { category: 'flooding', description: `${w.tag} — my own report`, lng: x, lat: y, minutesAgo: 5 })

  await visit(page, `/app/community?q=${encodeURIComponent(`${w.tag} — my own`)}`)
  await expect(page.getByRole('article', { name: 'Flooding reported by you' })).toBeVisible()

  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await signInCitizen(otherPage, 'feed-other', w.regionId)
  await visit(otherPage, `/app/community?q=${encodeURIComponent(`${w.tag} — my own`)}`)
  await expect(otherPage.getByRole('article', { name: 'Flooding reported by a community member' })).toBeVisible()
  await other.close()
})

test('Verified, a category and the search live in the URL and survive a reload', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'feed-tabs', w.regionId)
  await visit(page, `/app/community?q=${encodeURIComponent(w.tag)}`)
  await expect.poll(() => cardOrder(page)).toEqual(['update', 'flood', 'wire', 'road'])

  await page.getByRole('tab', { name: 'Verified' }).click()
  await expect.poll(() => cardOrder(page)).toEqual(['wire', 'road'])
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Blocked road 1' }).click()
  await expect.poll(() => cardOrder(page)).toEqual(['road'])
  await expect(page).toHaveURL(/tab=verified/)
  await expect(page).toHaveURL(/category=blocked_road/)

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Verified' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => cardOrder(page)).toEqual(['road'])
  await expect(page.getByRole('searchbox', { name: 'Search reports' })).toHaveValue(w.tag)

  await page.getByRole('searchbox', { name: 'Search reports' }).fill(`${w.tag} nothing matches this`)
  await expect(page.getByText('No reports match your search and filters.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(page).toHaveURL(/\/app\/community\?tab=verified$/)
})

test('a report an admin rejects through the real API leaves the feed on the next load, and the hidden count goes up by one', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'feed-reject', w.regionId)
  await visit(page, `/app/community?q=${encodeURIComponent(w.tag)}`)
  await expect.poll(() => cardOrder(page)).toEqual(['update', 'flood', 'wire', 'road'])
  const before = await rejectedInApi(request)

  const res = await request.patch(`${API}/admin/incident-reports/${w.ids.flood}/reject`, { headers: { Authorization: `Bearer ${w.adminToken}` } })
  expect(res.status()).toBe(200)
  expect(((await res.json()) as { status: string }).status).toBe('rejected')

  await page.reload()
  await expect.poll(() => cardOrder(page)).toEqual(['update', 'wire', 'road'])
  await expect(page.getByText(new RegExp(`^${before + 1} reports were rejected by moderators`))).toBeVisible()
})

test('without a home region: no region-only update, only the platform-wide ones, and a way to set a home region', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'feed-nohome')
  await visit(page, `/app/community?q=${encodeURIComponent(w.tag)}`)
  await expect.poll(() => cardOrder(page)).toEqual(['flood', 'wire', 'road'])
  await expect(page.getByText(w.updateTitle)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Set your home region' })).toHaveAttribute('href', '/app/profile/edit')

  // Whatever platform-wide posts the database holds are the ones shown: find each by its own title.
  const res = await request.get(`${API}/community-updates`, { params: { region_id: w.regionId } })
  const platformWide = ((await res.json()) as Array<{ region_id?: string; title?: string; content: string }>).filter((update) => !update.region_id)
  for (const update of platformWide.slice(0, 3)) {
    const text = update.title ?? update.content
    await page.getByRole('searchbox', { name: 'Search reports' }).fill(text)
    await expect(page.getByRole('article').filter({ hasText: text }).getByText('For Everyone')).toBeVisible()
  }
})

test('Nearby asks for nothing until pressed, then lists this run’s reports nearest first with their distances', async ({ browser, request }) => {
  const w = await seedFeedWorld(request)
  const [lng, lat] = w.point(0)
  const context = await browser.newContext({ geolocation: { latitude: lat, longitude: lng }, permissions: ['geolocation'] })
  const page = await context.newPage()
  await signInCitizen(page, 'feed-nearby', w.regionId)
  await visit(page, `/app/community?tab=nearby&q=${encodeURIComponent(w.tag)}`)

  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Reports and updates' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Use my location' }).click()

  await expect.poll(() => cardOrder(page)).toEqual(['flood', 'wire', 'road'])
  await expect(page.getByRole('article').filter({ hasText: 'river over' }).getByText('10 m away')).toBeVisible()
  await expect(page.getByRole('article').filter({ hasText: 'live wire' }).getByText(/^1\d km away$/)).toBeVisible()
  await expect(page.getByText(w.updateTitle)).toHaveCount(0)
  await context.close()
})

// Votes are only ever cast on this run's own reports (filed by an `e2e-` account), so the cleanup's deletion of test votes never leaves a
// real report's counters out of step.
test('voting: cast, survive a reload (read back through my-votes), switch and take back — each stored for real', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  const me = await signInCitizen(page, 'feed-voter', w.regionId)
  await visit(page, `/app/community?q=${encodeURIComponent(`${w.tag} — river over`)}`)
  const card = page.getByRole('article').filter({ hasText: 'river over the embankment' })
  const up = card.getByRole('button', { name: 'Upvote' })
  const down = card.getByRole('button', { name: 'Downvote' })
  await expect(up).toHaveAttribute('aria-pressed', 'false')

  const cast = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith(`/incident-reports/${w.ids.flood}/votes`))
  await up.click()
  expect((await cast).postDataJSON()).toEqual({ vote_type: 'upvote' })
  await expect(up).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('group', { name: '5 upvotes, 1 downvote' })).toBeVisible()
  await expect.poll(() => readReportVotes(w.ids.flood)).toEqual([`${me}:upvote`])
  await expect.poll(() => readReportCounts(w.ids.flood)).toBe('5/1')

  // The reason the route was added: after a reload the page still knows which way this account voted.
  await page.reload()
  await expect(up).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('group', { name: '5 upvotes, 1 downvote' })).toBeVisible()
  const token = await tokenFor(request, me)
  const mine = await request.get(`${API}/incident-reports/my-votes`, { params: { ids: w.ids.flood }, headers: { Authorization: `Bearer ${token}` } })
  expect(((await mine.json()) as Array<{ vote_type: string }>).map((v) => v.vote_type)).toEqual(['upvote'])

  await down.click()
  await expect(down).toHaveAttribute('aria-pressed', 'true')
  await expect(up).toHaveAttribute('aria-pressed', 'false')
  await expect(card.getByRole('group', { name: '4 upvotes, 2 downvotes' })).toBeVisible()
  await expect.poll(() => readReportVotes(w.ids.flood)).toEqual([`${me}:downvote`])
  await expect.poll(() => readReportCounts(w.ids.flood)).toBe('4/2')

  const taken = page.waitForRequest((req) => req.method() === 'DELETE' && req.url().endsWith(`/incident-reports/${w.ids.flood}/votes`))
  await down.click()
  await taken
  await expect(down).toHaveAttribute('aria-pressed', 'false')
  await expect(card.getByRole('group', { name: '4 upvotes, 1 downvote' })).toBeVisible()
  await expect.poll(() => readReportVotes(w.ids.flood)).toEqual([])
  await expect.poll(() => readReportCounts(w.ids.flood)).toBe('4/1')
})

test('two citizens: each sees only their own vote pressed, and both see the other’s in the totals', async ({ page, request, browser }) => {
  const w = await seedFeedWorld(request)
  const a = await signInCitizen(page, 'feed-vote-a', w.regionId)
  const q = `/app/community?q=${encodeURIComponent(`${w.tag} — fallen tree`)}`
  await visit(page, q)
  const cardA = page.getByRole('article').filter({ hasText: 'fallen tree' })
  await cardA.getByRole('button', { name: 'Upvote' }).click()
  await expect.poll(() => readReportCounts(w.ids.road)).toBe('8/0')

  const other = await browser.newContext()
  const pageB = await other.newPage()
  const b = await signInCitizen(pageB, 'feed-vote-b', w.regionId)
  await visit(pageB, q)
  const cardB = pageB.getByRole('article').filter({ hasText: 'fallen tree' })
  await expect(cardB.getByRole('group', { name: '8 upvotes, 0 downvotes' })).toBeVisible()
  await expect(cardB.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'false')
  await cardB.getByRole('button', { name: 'Downvote' }).click()
  await expect.poll(() => readReportVotes(w.ids.road)).toEqual([`${a}:upvote`, `${b}:downvote`].sort())

  await page.reload()
  await expect(cardA.getByRole('group', { name: '8 upvotes, 1 downvote' })).toBeVisible()
  await expect(cardA.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'true')
  await expect(cardA.getByRole('button', { name: 'Downvote' })).toHaveAttribute('aria-pressed', 'false')
  await other.close()
})

test('a vote on a report deleted behind the open page gets the real 404, says so, and the card leaves on the refresh', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'feed-vote-gone', w.regionId)
  await visit(page, `/app/community?q=${encodeURIComponent(w.tag)}`)
  await expect.poll(() => cardOrder(page)).toEqual(['update', 'flood', 'wire', 'road'])

  deleteFeedReport(w.ids.wire)
  const refused = page.waitForResponse((res) => res.request().method() === 'POST' && res.url().endsWith(`/incident-reports/${w.ids.wire}/votes`))
  await page.getByRole('article').filter({ hasText: 'live wire' }).getByRole('button', { name: 'Upvote' }).click()
  const res = await refused
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({ error: 'incident report not found' })
  await expect(page.getByText(/That report is no longer available, so your vote wasn’t counted/)).toBeVisible()
  await expect.poll(() => cardOrder(page)).toEqual(['update', 'flood', 'road'])
})
