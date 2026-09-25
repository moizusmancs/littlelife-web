import { test, expect } from '@playwright/test'
import { signInCitizen, visit } from './helpers/citizen'
import { seedSafetyConnection, verifyAndOnboardAccount } from './helpers/seed'

/**
 * The Profile sub-nav on a phone: nine stacked links used to push every profile page's own content a
 * screen down, so below `md` they collapse behind one button that names the current section. From `md`
 * up nothing changes. Real login, real backend; the only seeded thing is a pending safety-group request,
 * to see that a waiting item is not hidden by the menu being shut.
 */
const LINKS = ['Overview', 'Edit Profile', 'Alert Preferences', 'Account Settings', 'Credibility', 'Activity', 'Safety Groups', 'My NGO', 'Invitations']

test.describe('Profile sub-nav on a phone — real backend', () => {
  test('is one button naming the current section, with the page content right below it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInCitizen(page, 'pnav-closed')
    await visit(page, '/app/profile/edit')

    const toggle = page.getByRole('button', { name: /Edit Profile/ })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    for (const link of LINKS) await expect(page.getByRole('link', { name: link, exact: true })).toBeHidden()

    // The page's own heading is on the first screen — before, it sat below nine links.
    await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('opens to every link, closes on Escape with focus back on the button, and closes when a link is followed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInCitizen(page, 'pnav-open')
    await visit(page, '/app/profile/edit')

    const toggle = page.getByRole('button', { name: /Edit Profile/ })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    for (const link of LINKS) await expect(page.getByRole('link', { name: link, exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Account Settings', exact: true }).focus()
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await expect(page.getByRole('link', { name: 'Account Settings', exact: true })).toBeHidden()

    await toggle.click()
    await page.getByRole('link', { name: 'Account Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/profile\/account-settings$/)
    const next = page.getByRole('button', { name: /Account Settings/ })
    await expect(next).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeHidden()
  })

  test('shows what is waiting in another section without opening, and the first request is on screen in Safety Groups', async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const me = await signInCitizen(page, 'pnav-badge')
    const other = await browser.newContext()
    try {
      const otherPage = await other.newPage()
      const from = await signInCitizen(otherPage, 'pnav-badge-from')
      seedSafetyConnection(from, me)
      verifyAndOnboardAccount(from, 'E2E Citizen')

      await visit(page, '/app/profile/edit')
      await expect(page.getByRole('button', { name: /Edit Profile/ })).toContainText('1 waiting in other sections')

      // In Safety Groups the request is the current section's own count, and the request itself needs no scroll.
      await visit(page, '/app/safety-groups')
      await expect(page.getByRole('button', { name: /Safety Groups/ })).toContainText('1')
      await expect(page.getByRole('button', { name: /Safety Groups/ })).not.toContainText('waiting in other sections')
      await expect(page.getByRole('button', { name: /^Accept request/ })).toBeInViewport()
    } finally {
      await other.close()
    }
  })

  for (const [width, collapsed] of [[767, true], [768, false], [1440, false]] as const) {
    test(`${width}px: ${collapsed ? 'collapsed behind the button' : 'the sidebar, every link showing, no button'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await signInCitizen(page, `pnav-${width}`)
      await visit(page, '/app/profile/edit')
      await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()

      const toggle = page.getByRole('button', { name: /Edit Profile/ })
      if (collapsed) {
        await expect(toggle).toBeVisible()
        await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeHidden()
      } else {
        await expect(toggle).toBeHidden()
        for (const link of LINKS) await expect(page.getByRole('link', { name: link, exact: true })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
})
