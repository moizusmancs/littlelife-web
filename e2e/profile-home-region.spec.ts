import { test, expect, type Page } from '@playwright/test'
import { readHomeRegionId, seedHomeRegion, seedRegion, verifyAccountOnly, verifyAndOnboardAccount } from './helpers/seed'

/**
 * Real end to end for the citizen's home region — the optional onboarding step and its home on Edit
 * Profile — with no spoofing and no stubbed responses. Accounts are registered through the real API and
 * verified in Postgres (there is no way to read a real OTP), so a real login lands exactly where a
 * real citizen would; every claim about what was saved is read back from the `profiles` row. Regions
 * are `E2E …` rows, found by name, so no real region is touched.
 */
const API = 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'
const unique = (label: string) => `E2E ${label} ${Date.now()}${Math.floor(Math.random() * 1000)}`

async function register(page: Page, tag: string) {
  const email = `e2e-home-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await page.request.post(`${API}/auth/register`, { data: { email, password } })
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

/** A verified citizen with no name yet: a real login lands on the name step. */
async function newCitizenAtNameStep(page: Page, tag: string) {
  const email = await register(page, tag)
  verifyAccountOnly(email)
  await logIn(page, email, /\/app\/onboarding\/profile$/)
  return email
}

/** A verified, fully onboarded citizen, signed in. */
async function onboardedCitizen(page: Page, tag: string) {
  const email = await register(page, tag)
  verifyAndOnboardAccount(email, 'E2E Home Citizen')
  await logIn(page, email, /\/app\/home$/)
  return email
}

test.describe('Onboarding — home region, real backend', () => {
  test('the name step leads to an optional region step; choosing a tehsil saves it and lands in the app', async ({ page }) => {
    const email = await newCitizenAtNameStep(page, 'flow')
    const tag = unique('Home')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    const tehsil = seedRegion(`${tag} Tehsil`, 'tehsil', district)

    await page.getByLabel('Your name').fill('Aisha Khan')
    await page.getByRole('button', { name: 'Continue' }).click()

    // The region step: full viewport (no nav bar), optional, Continue locked until something is chosen.
    await expect(page).toHaveURL(/\/app\/onboarding\/region$/)
    await expect(page.getByRole('heading', { name: 'Where do you live?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Community' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(readHomeRegionId(email)).toBeNull()

    // Drill down province › district, then choose the tehsil.
    await page.getByRole('button', { name: `Show the 1 sub-region of ${tag} Prov` }).click()
    await page.getByRole('button', { name: `Show the 1 sub-region of ${tag} Dist` }).click()
    await expect(page.getByRole('navigation', { name: 'Where you are' })).toContainText(`${tag} Dist`)
    await page.getByRole('radio', { name: new RegExp(`${tag} Tehsil`) }).check()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).toHaveURL(/\/app\/home$/)
    expect(readHomeRegionId(email)).toBe(tehsil)

    // The profile header shows it, from the profile response alone: "tehsil, district".
    await page.goto('/app/profile/edit')
    await expect(page.getByText(`${tag} Tehsil, ${tag} Dist`).first()).toBeVisible()
  })

  test('Skip for now goes straight to the app and saves nothing; the step is never forced again', async ({ page }) => {
    const email = await newCitizenAtNameStep(page, 'skip')
    await page.getByLabel('Your name').fill('Skipper')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/app\/onboarding\/region$/)

    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(/\/app\/home$/)
    expect(readHomeRegionId(email)).toBeNull()

    // Nothing remembers the skip: logging in again lands in the app, not back on the region step.
    await page.context().clearCookies()
    await logIn(page, email, /\/app\/home$/)
    await page.goto('/app/profile/edit')
    await expect(page.getByText('Not set')).toBeVisible()
  })

  test('a region can be chosen at any level — a whole province is fine', async ({ page }) => {
    const email = await newCitizenAtNameStep(page, 'province')
    const tag = unique('Prov Only')
    const province = seedRegion(`${tag} Prov`, 'province')
    await page.getByLabel('Your name').fill('Province Person')
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    await page.getByRole('radio', { name: new RegExp(`${tag} Prov`) }).check()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).toHaveURL(/\/app\/home$/)
    expect(readHomeRegionId(email)).toBe(province)
  })

  test('the region step is for signed-in, verified citizens: logged out it goes to login, unverified it goes to verification', async ({ page }) => {
    await page.goto('/app/onboarding/region')
    await expect(page).toHaveURL(/\/login$/)

    const email = await register(page, 'unverified')
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL(/\/verify-email$/)
    await page.goto('/app/onboarding/region')
    await expect(page).toHaveURL(/\/verify-email$/)
  })
})

test.describe('Edit Profile — home region, real backend', () => {
  test('sets, changes and removes it, each read back from the profile row and shown in the sidebar', async ({ page }) => {
    const email = await onboardedCitizen(page, 'edit')
    const tag = unique('Edit Home')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    const other = seedRegion(`${tag} Other`, 'province')

    await page.goto('/app/profile/edit')
    const card = page.getByRole('heading', { name: 'Home region' }).locator('xpath=ancestor::section')
    await expect(card.getByText('Not set')).toBeVisible()

    // Set (a district).
    await card.getByRole('button', { name: 'Choose region' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    await dialog.getByRole('radio', { name: new RegExp(`${tag} Dist`) }).check()
    await dialog.getByRole('button', { name: 'Save home region' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(card.getByText(`${tag} Dist, ${tag} Prov`)).toBeVisible()
    expect(readHomeRegionId(email)).toBe(district)
    await expect(page.getByText(`${tag} Dist, ${tag} Prov`).first()).toBeVisible() // the sidebar header shares it

    // It survives a reload — it comes from the profile, not from this tab.
    await page.reload()
    await expect(card.getByText(`${tag} Dist, ${tag} Prov`)).toBeVisible()

    // Change (the current one is listed but can't be picked again).
    await card.getByRole('button', { name: 'Change' }).click()
    await dialog.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    const current = dialog.getByRole('radio', { name: new RegExp(`^${tag} Dist District`) })
    await expect(current).toBeDisabled()
    await expect(current.locator('xpath=ancestor::label')).toContainText('Current home region')
    await dialog.getByRole('radio', { name: `${tag} Other Province`, exact: true }).check()
    await dialog.getByRole('button', { name: 'Save home region' }).click()
    await expect(card.getByText(`${tag} Other`)).toBeVisible()
    expect(readHomeRegionId(email)).toBe(other)

    // Remove: one click, no confirmation.
    await card.getByRole('button', { name: 'Remove' }).click()
    await expect(card.getByText('Not set')).toBeVisible()
    expect(readHomeRegionId(email)).toBeNull()
  })

  test('saving the name leaves the home region alone', async ({ page }) => {
    const email = await onboardedCitizen(page, 'nameonly')
    const region = seedRegion(unique('Stays'), 'province')
    seedHomeRegion(email, region)

    await page.goto('/app/profile/edit')
    await page.getByLabel('Your name').fill('Renamed Citizen')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    expect(readHomeRegionId(email)).toBe(region)
  })

  test('the sidebar header shows nothing for a citizen without a home region', async ({ page }) => {
    await onboardedCitizen(page, 'noregion')
    await page.goto('/app/profile/edit')
    await expect(page.getByText('Not set')).toBeVisible()
    // The header block beside the avatar holds the name and nothing else — no location line.
    await expect(page.getByText('E2E Home Citizen').first().locator('xpath=..')).toHaveText('E2E Home Citizen')
  })
})

test.describe('Onboarding — on a phone, real backend', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the region step fits a phone: full width, Continue reachable, no horizontal scrolling', async ({ page }) => {
    const email = await newCitizenAtNameStep(page, 'phone')
    const tag = unique('Phone Home')
    const region = seedRegion(`${tag} Prov`, 'province')
    await page.getByLabel('Your name').fill('Phone Person')
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    await page.getByRole('radio', { name: new RegExp(`${tag} Prov`) }).check()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBe(0)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/app\/home$/)
    expect(readHomeRegionId(email)).toBe(region)
  })
})
