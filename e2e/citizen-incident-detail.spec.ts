import { expect, test } from '@playwright/test'
import { API, signInCitizen, visit } from './helpers/citizen'
import { PHOTO, seedFeedWorld, tokenFor } from './helpers/community'
import { readReportCounts, readReportVotes } from './helpers/seed'

/**
 * Incident Detail (/app/community/:incidentId) against the real backend. There is no `GET /incident-reports/{id}`, so the page finds its report in
 * the nationwide list — these tests check it does that with one list request, that a report reached from the feed comes back to the same feed view,
 * and that everything shown (the description, status, progress, media, location, votes) is what the database and the real routes hold. Votes are
 * cast only on this run's own reports.
 */
test.describe.configure({ timeout: 120_000 })

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', ')

test('opened from a filtered feed: the report as stored, its media and progress, and Back to the same view', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'detail-feed', w.regionId)
  await visit(page, `/app/community?tab=verified&q=${encodeURIComponent(w.tag)}`)

  const card = page.getByRole('article').filter({ hasText: 'live wire' })
  await card.getByRole('link', { name: 'View details' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/community/${w.ids.wire}$`))

  await expect(page.getByRole('heading', { level: 1, name: 'Other hazard' })).toBeVisible()
  await expect(page.getByText(`${w.tag} — live wire in the water`)).toBeVisible()
  await expect(page.getByText('Being handled', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^Reported by a community member/)).toBeVisible()

  // Progress: Reported and Verified done, Being handled current, Resolved to come.
  const steps = page.getByRole('list', { name: 'Progress' }).getByRole('listitem')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(steps.nth(3)).toContainText('not yet')

  // The media the database holds: the photo loads, and the video (a URL nothing serves) becomes a tile with a direct link.
  const photo = page.getByRole('img', { name: /Photo \d from this report/ })
  await expect(photo).toBeVisible()
  await expect(photo).toHaveAttribute('src', PHOTO)
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await expect(page.getByText("This video can't be played here.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open it directly' })).toHaveAttribute('href', 'http://localhost:5173/clip.mp4')

  // The location: the coordinates the report was stored with, and a real map.
  const [lng, lat] = w.point(0.1)
  await expect(page.getByText(`${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`)).toBeVisible()
  await expect(page.getByRole('group', { name: 'Map of where this other hazard report was made' }).locator('.leaflet-marker-icon')).toHaveCount(1)

  await page.getByRole('link', { name: 'Back to community' }).click()
  await expect(page).toHaveURL(/\/app\/community\?tab=verified&q=/)
  await expect(page.getByRole('tab', { name: 'Verified' })).toHaveAttribute('aria-selected', 'true')
})

test('a direct link asks for that one report — never the nationwide list; an unknown or malformed id is "not found" (the real 404 and 400); a rejected report isn’t shown', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'detail-direct', w.regionId)

  const lists: string[] = []
  const ones: string[] = []
  page.on('request', (req) => {
    if (req.method() !== 'GET') return
    const path = new URL(req.url()).pathname
    if (/\/incident-reports$/.test(path)) lists.push(req.url())
    const one = path.match(/\/incident-reports\/([^/]+)$/)
    if (one && one[1] !== 'my-votes') ones.push(one[1])
  })
  await visit(page, `/app/community/${w.ids.flood}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Flooding' })).toBeVisible()
  expect(ones).toEqual([w.ids.flood])
  expect(lists).toEqual([])
  await expect(page.getByRole('link', { name: 'Back to community' })).toHaveAttribute('href', '/app/community')

  const unknown = page.waitForResponse((res) => res.url().endsWith('/incident-reports/00000000-0000-0000-0000-000000000001'))
  await visit(page, '/app/community/00000000-0000-0000-0000-000000000001')
  expect((await unknown).status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Report not found' })).toBeVisible()
  const malformed = page.waitForResponse((res) => res.url().endsWith('/incident-reports/not-a-uuid'))
  await visit(page, '/app/community/not-a-uuid')
  expect((await malformed).status()).toBe(400)
  await expect(page.getByRole('heading', { name: 'Report not found' })).toBeVisible()

  await visit(page, `/app/community/${w.ids.rejected}`)
  await expect(page.getByRole('heading', { name: 'This report was rejected' })).toBeVisible()
  await expect(page.getByText('duplicate of another report')).toHaveCount(0)
})

test('the progress follows the real status route: resolved straight from reported (so Verified is not ticked), with its date, then reopened — and says so', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  await signInCitizen(page, 'detail-progress', w.regionId)
  const setStatus = async (status: string) => {
    const res = await request.patch(`${API}/incident-reports/${w.ids.flood}/status`, { headers: { Authorization: `Bearer ${w.adminToken}` }, data: { status } })
    expect(res.status()).toBe(200)
    return (await res.json()) as { status: string; verified_at?: string; resolved_at?: string }
  }

  const resolved = await setStatus('resolved')
  expect(resolved.resolved_at).toBeTruthy()
  await visit(page, `/app/community/${w.ids.flood}`)
  const steps = page.getByRole('list', { name: 'Progress' }).getByRole('listitem')
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step')
  await expect(steps.nth(3)).toContainText(fmt(resolved.resolved_at as string))
  await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible()
  // The report went from reported straight to resolved: the API set no verified_at, so Verified is not ticked (found by the screenshot).
  await expect(steps.nth(1)).toContainText('Not marked as verified before it moved on.')
  await expect(steps.nth(1)).toContainText('no record')

  // An administrator reopens it: the API keeps resolved_at, and the page says what happened rather than hiding it.
  await setStatus('in_progress')
  await page.reload()
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(steps.nth(2)).toContainText(/Marked resolved on \d{1,2} \w+ \d{4}, then reopened\./)
})

test('voting from the page is stored, and the feed shows the same vote when going back', async ({ page, request }) => {
  const w = await seedFeedWorld(request)
  const me = await signInCitizen(page, 'detail-vote', w.regionId)
  await visit(page, `/app/community?q=${encodeURIComponent(w.tag)}`)
  await page.getByRole('article').filter({ hasText: 'river over' }).getByRole('link', { name: 'View details' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Flooding' })).toBeVisible()

  const up = page.getByRole('button', { name: 'Upvote' })
  await expect(up).toHaveAttribute('aria-pressed', 'false')
  await up.click()
  await expect(up).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: '5 upvotes, 1 downvote' })).toBeVisible()
  await expect.poll(() => readReportVotes(w.ids.flood)).toEqual([`${me}:upvote`])
  await expect.poll(() => readReportCounts(w.ids.flood)).toBe('5/1')

  await page.getByRole('link', { name: 'Back to community' }).click()
  const card = page.getByRole('article').filter({ hasText: 'river over' })
  await expect(card.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('group', { name: '5 upvotes, 1 downvote' })).toBeVisible()

  const token = await tokenFor(request, me)
  const mine = await request.get(`${API}/incident-reports/my-votes`, { params: { ids: w.ids.flood }, headers: { Authorization: `Bearer ${token}` } })
  expect(((await mine.json()) as Array<{ vote_type: string }>).map((v) => v.vote_type)).toEqual(['upvote'])
})

test('the distance is asked for only when pressed, and matches the stored point', async ({ browser, request }) => {
  const w = await seedFeedWorld(request)
  const [lng, lat] = w.point(0)
  const context = await browser.newContext({ geolocation: { latitude: lat, longitude: lng + 0.1 }, permissions: ['geolocation'] })
  const page = await context.newPage()
  await signInCitizen(page, 'detail-distance', w.regionId)
  await visit(page, `/app/community/${w.ids.flood}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Flooding' })).toBeVisible()
  await expect(page.getByText(/from you$/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Show distance from me' }).click()
  // 0.1° of longitude at this latitude, by the haversine the page uses.
  const km = (2 * 6371 * Math.asin(Math.cos((lat * Math.PI) / 180) * Math.sin((0.1 * Math.PI) / 360))).toFixed(0)
  await expect(page.getByText(`${km} km from you`)).toBeVisible()
  await context.close()
})
