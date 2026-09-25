import { test, expect } from '@playwright/test'
import { signInCitizen, visit } from './helpers/citizen'
import { readAlertPreferences, setAlertPreferences } from './helpers/seed'

/**
 * Alert Preferences against the real backend. Every change is made through the real screen and read back from Postgres,
 * including that **nothing else** in the row moved (a partial patch that round-tripped values would switch off a channel the
 * user never touched). The defaults every account starts with are push, SMS and voice on, WhatsApp off, English, general advisory.
 */
const DEFAULTS = { push: true, sms: true, whatsapp: false, voice: true, language: 'en', severity: 'general_advisory' }

type PageArg = Parameters<typeof visit>[0]

/** Chooses a severity the way a person does — by clicking its card (the radio itself is visually hidden). */
async function chooseSeverity(page: PageArg, name: RegExp) {
  await page.locator('label').filter({ has: page.getByRole('radio', { name }) }).click()
}

async function openPage(page: PageArg) {
  await visit(page, '/app/profile/alert-preferences')
  await expect(page.getByRole('heading', { level: 1, name: 'Alert preferences' })).toBeVisible()
}

test.describe('Alert Preferences — real backend', () => {
  test("a new account sees the defaults every account starts with, inside the sub-nav, with no Save button", async ({ page }) => {
    const email = await signInCitizen(page, 'ap-defaults')
    await openPage(page)

    await expect(page.getByRole('switch', { name: 'Push notifications' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'SMS' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'WhatsApp' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: 'Voice calls' })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^General advisory/ })).toBeChecked()
    await expect(page.getByRole('combobox', { name: 'Alert language' })).toHaveValue('en')
    await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Alert Preferences', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(readAlertPreferences(email)).toEqual(DEFAULTS)
  })

  test('toggling a channel saves it at once — sending only that field — and changes nothing else in the row', async ({ page }) => {
    const email = await signInCitizen(page, 'ap-toggle')
    await openPage(page)

    const request = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/profile/alert-preferences'))
    await page.getByRole('switch', { name: 'WhatsApp' }).click()

    expect((await request).postDataJSON()).toEqual({ whatsapp_enabled: true })
    await expect(page.getByText('All changes saved')).toBeVisible()
    expect(readAlertPreferences(email)).toEqual({ ...DEFAULTS, whatsapp: true })

    await page.reload()
    await expect(page.getByRole('switch', { name: 'WhatsApp' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Push notifications' })).toBeChecked()
  })

  test('the severity and the language each save on their own, and survive a reload', async ({ page }) => {
    const email = await signInCitizen(page, 'ap-severity')
    await openPage(page)

    await chooseSeverity(page, /^Warning/)
    await expect(page.getByText('All changes saved')).toBeVisible()
    expect(readAlertPreferences(email)).toEqual({ ...DEFAULTS, severity: 'warning' })

    await page.getByRole('combobox', { name: 'Alert language' }).selectOption('ur')
    await expect.poll(() => readAlertPreferences(email).language).toBe('ur')
    expect(readAlertPreferences(email)).toEqual({ ...DEFAULTS, severity: 'warning', language: 'ur' })

    await page.reload()
    await expect(page.getByRole('radio', { name: /^Warning/ })).toBeChecked()
    await expect(page.getByRole('combobox', { name: 'Alert language' })).toHaveValue('ur')

    // Every level can be chosen, including the highest.
    await chooseSeverity(page, /^Critical emergency/)
    await expect.poll(() => readAlertPreferences(email).severity).toBe('critical_emergency')
  })

  test('several quick changes all land, in the order made', async ({ page }) => {
    const email = await signInCitizen(page, 'ap-quick')
    await openPage(page)

    await page.getByRole('switch', { name: 'Push notifications' }).click()
    await page.getByRole('switch', { name: 'SMS' }).click()
    await page.getByRole('switch', { name: 'WhatsApp' }).click()
    await page.getByRole('switch', { name: 'Push notifications' }).click() // and back on

    await expect(page.getByText('All changes saved')).toBeVisible()
    await expect.poll(() => readAlertPreferences(email)).toEqual({ ...DEFAULTS, sms: false, whatsapp: true })
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Push notifications' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'SMS' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: 'WhatsApp' })).toBeChecked()
  })

  test('shows what is really stored — including a language the screen has no name for — and each account its own', async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'ap-own-a')
    setAlertPreferences(emailA, { language: 'fr', severity: 'watch', whatsapp: true })
    const other = await browser.newContext()
    try {
      const pageB = await other.newPage()
      await signInCitizen(pageB, 'ap-own-b')

      await openPage(page)
      await openPage(pageB)

      await expect(page.getByRole('combobox', { name: 'Alert language' })).toHaveValue('fr')
      await expect(page.getByRole('radio', { name: /^Watch/ })).toBeChecked()
      await expect(page.getByRole('switch', { name: 'WhatsApp' })).toBeChecked()
      // The other account is untouched.
      await expect(pageB.getByRole('combobox', { name: 'Alert language' })).toHaveValue('en')
      await expect(pageB.getByRole('radio', { name: /^General advisory/ })).toBeChecked()
      await expect(pageB.getByRole('switch', { name: 'WhatsApp' })).not.toBeChecked()
    } finally {
      await other.close()
    }
  })

  test('says the phone channels have no number to go to', async ({ page }) => {
    await signInCitizen(page, 'ap-note')
    await openPage(page)
    await expect(page.getByText("SMS, WhatsApp and voice calls go to a phone number, and your account doesn't have one on file yet.")).toBeVisible()
  })

  test('on a phone the menu reaches it, every control is usable, and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const email = await signInCitizen(page, 'ap-phone')
    await visit(page, '/app/profile/edit')

    await page.getByRole('button', { name: /Edit Profile/ }).click()
    await page.getByRole('link', { name: 'Alert Preferences', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/profile\/alert-preferences$/)

    await expect(page.getByRole('switch', { name: 'Push notifications' })).toBeInViewport()
    await page.getByRole('switch', { name: 'WhatsApp' }).click()
    await expect(page.getByText('All changes saved')).toBeVisible()
    await chooseSeverity(page, /^Watch/)
    await expect.poll(() => readAlertPreferences(email).severity).toBe('watch')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
