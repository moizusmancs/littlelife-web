import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { API, password, randomWorld, register } from './citizen'
import { promoteToPlatformAdmin, seedFeedReport, seedRegion, seedReportMedia, verifyAndOnboardAccount } from './seed'

/**
 * What the Community Feed and Incident Detail specs share: a world of this run's own (an `E2E Feed …` region, four reports tagged with the run's
 * id by an `e2e-` citizen — one of them rejected — with media rows whose URLs the dev server already serves, and an official update posted by an
 * `e2e-` platform admin through the real `POST /community-updates`), a token for the API, and the order of this run's cards on the page.
 */

export const PHOTO = 'http://localhost:5173/favicon.svg'

export async function tokenFor(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { access_token: string }).access_token
}

export interface FeedWorld {
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
export async function seedFeedWorld(request: APIRequestContext): Promise<FeedWorld> {
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
export async function cardOrder(page: Page) {
  const texts = await page.getByRole('list', { name: 'Reports and updates' }).getByRole('article').allInnerTexts()
  return texts.map((text) =>
    text.includes('water tankers') ? 'update' : text.includes('river over') ? 'flood' : text.includes('fallen tree') ? 'road' : text.includes('live wire') ? 'wire' : text.includes('duplicate') ? 'rejected' : 'other',
  )
}
