import { test, expect } from '@playwright/test'
import { API, password, signInCitizen, visit } from './helpers/citizen'

/**
 * The read-only "Your account" card on Edit Profile, against the real backend: the account's own email and creation date,
 * and the fact that the page has exactly one field — the profile really is just a name and a home region.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

test.describe('Edit Profile › Your account — real backend', () => {
  test("shows the account's real email, verified, and the date the profile was created", async ({ page, request }) => {
    const email = await signInCitizen(page, 'acct-card', undefined, 'E2E Hina Khan')
    await visit(page, '/app/profile/edit')

    const card = page.getByRole('region', { name: 'Your account' })
    await expect(card.getByText(email, { exact: true })).toBeVisible()
    await expect(card.getByText('Verified')).toBeVisible()

    const login = await request.post(`${API}/auth/login`, { data: { email, password } })
    const { access_token: token } = (await login.json()) as { access_token: string }
    const profile = (await (await request.get(`${API}/profile`, { headers: { authorization: `Bearer ${token}` } })).json()) as { created_at: string }
    const created = new Date(profile.created_at)
    await expect(card.getByText(`${created.getDate()} ${MONTHS[created.getMonth()]} ${created.getFullYear()}`)).toBeVisible()
  })

  test('the page has one field — the name — and no phone, photo or other personal field to fill in', async ({ page }) => {
    await signInCitizen(page, 'acct-fields', undefined, 'E2E Hina Khan')
    await visit(page, '/app/profile/edit')

    await expect(page.getByLabel('Your name')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(1)
    await expect(page.getByText(/phone|date of birth|photo/i)).toHaveCount(0)
  })

  test('on a phone the card fits, a long email wraps, and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInCitizen(page, 'acct-card-phone-with-a-rather-long-label-to-stretch-the-address', undefined, 'E2E Hina Khan')
    await visit(page, '/app/profile/edit')

    await expect(page.getByRole('region', { name: 'Your account' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
