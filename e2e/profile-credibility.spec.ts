import { test, expect, type APIRequestContext } from '@playwright/test'
import { API, password, signInCitizen, visit } from './helpers/citizen'
import { seedTrustScore, setTrustScore } from './helpers/seed'

/**
 * Credibility against the real backend. `GET /trust-score` answers an implicit `0` with no `updated_at` for an account
 * that has never been scored (every account today — nothing writes scores yet), so the scored states are seeded straight
 * into Postgres, where the screen and the API are both read back. API-side checks use the test's own `request` fixture,
 * never a page's, so no session cookie leaks into the page's browser.
 */
async function scoreAsSeenBy(request: APIRequestContext, email: string) {
  const login = await request.post(`${API}/auth/login`, { data: { email, password } })
  const { access_token: token } = (await login.json()) as { access_token: string }
  const res = await request.get(`${API}/trust-score`, { headers: { authorization: `Bearer ${token}` } })
  return (await res.json()) as { account_id: string; score: number; updated_at?: string }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** The screen's `d MMM yyyy`, in the browser's zone — written out, since `toLocaleDateString` spells September "Sept". */
const asShown = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

test.describe('Credibility — real backend', () => {
  test('an account that has never been scored sees "Not scored yet", not a zero — and the API says it has no updated_at', async ({ page, request }) => {
    const email = await signInCitizen(page, 'cred-new')
    await visit(page, '/app/profile/credibility')

    await expect(page.getByRole('heading', { level: 1, name: 'Credibility' })).toBeVisible()
    await expect(page.getByText('Not scored yet')).toBeVisible()
    await expect(page.getByRole('img', { name: 'No credibility score yet' })).toBeVisible()
    await expect(page.getByText(/Last updated/)).toHaveCount(0)
    // It's inside the profile sub-nav with Credibility active.
    await expect(page.getByRole('link', { name: 'Credibility', exact: true })).toHaveAttribute('aria-current', 'page')

    const stored = await scoreAsSeenBy(request, email)
    expect(stored.score).toBe(0)
    expect(stored.updated_at).toBeUndefined()
  })

  test('a stored score is shown as the number, with the date the backend gives', async ({ page, request }) => {
    const email = await signInCitizen(page, 'cred-88')
    seedTrustScore(email, 88)
    await visit(page, '/app/profile/credibility')

    await expect(page.getByRole('img', { name: 'Credibility score 88 out of 100' })).toBeVisible()
    await expect(page.getByText('Not scored yet')).toHaveCount(0)
    const stored = await scoreAsSeenBy(request, email)
    expect(stored.score).toBe(88)
    await expect(page.getByText(`Last updated ${asShown(stored.updated_at as string)}`)).toBeVisible()
    // Nothing the API has no data for.
    await expect(page.getByText(/Level \d|Reports submitted|Upvotes/)).toHaveCount(0)
  })

  test("each account sees only its own score", async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'cred-a')
    setTrustScore(emailA, 73)
    const other = await browser.newContext()
    try {
      const pageB = await other.newPage()
      await signInCitizen(pageB, 'cred-b')

      await visit(page, '/app/profile/credibility')
      await visit(pageB, '/app/profile/credibility')

      await expect(page.getByRole('img', { name: 'Credibility score 73 out of 100' })).toBeVisible()
      await expect(pageB.getByText('Not scored yet')).toBeVisible()
      await expect(pageB.getByRole('img', { name: /Credibility score 73/ })).toHaveCount(0)
    } finally {
      await other.close()
    }
  })

  test('a changed score shows on the next visit, and a score outside 0–100 is shown as the number it is', async ({ page }) => {
    const email = await signInCitizen(page, 'cred-change')
    setTrustScore(email, 40)
    await visit(page, '/app/profile/credibility')
    await expect(page.getByRole('img', { name: 'Credibility score 40 out of 100' })).toBeVisible()

    setTrustScore(email, 61)
    await visit(page, '/app/profile/credibility')
    await expect(page.getByRole('img', { name: 'Credibility score 61 out of 100' })).toBeVisible()

    // The column has no range check; the screen must not say "250 out of 100".
    setTrustScore(email, 250)
    await visit(page, '/app/profile/credibility')
    await expect(page.getByText('250', { exact: true })).toBeVisible()
    await expect(page.getByText('of 100')).toHaveCount(0)

    // A real stored zero is a score of zero — it has an updated_at — not "not scored".
    setTrustScore(email, 0)
    await visit(page, '/app/profile/credibility')
    await expect(page.getByRole('img', { name: 'Credibility score 0 out of 100' })).toBeVisible()
    await expect(page.getByText('Not scored yet')).toHaveCount(0)
  })

  test('is reached from the profile sub-nav', async ({ page }) => {
    await signInCitizen(page, 'cred-nav')
    await visit(page, '/app/profile/edit')

    await page.getByRole('link', { name: 'Credibility', exact: true }).click()

    await expect(page).toHaveURL(/\/app\/profile\/credibility$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Credibility' })).toBeVisible()
  })

  test('on a phone the ring and the words are on the first screen, the menu reaches it, and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const email = await signInCitizen(page, 'cred-phone')
    setTrustScore(email, 88)
    await visit(page, '/app/profile/edit')

    await page.getByRole('button', { name: /Edit Profile/ }).click()
    await page.getByRole('link', { name: 'Credibility', exact: true }).click()

    await expect(page).toHaveURL(/\/app\/profile\/credibility$/)
    await expect(page.getByRole('img', { name: 'Credibility score 88 out of 100' })).toBeInViewport()
    await expect(page.getByText(/Last updated/)).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
