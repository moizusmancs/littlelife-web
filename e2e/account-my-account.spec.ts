import { test, expect, type Page } from '@playwright/test'
import {
  promoteToNgoAdmin,
  promoteToNgoVolunteer,
  promoteToPlatformAdmin,
  readAccountState,
  readProfileName,
} from './helpers/seed'

/**
 * Real end to end for `/ngo/settings/account` and `/admin/settings/account`, with no spoofing and
 * no stubbed responses: accounts are registered through the API, turned into a genuine NGO admin /
 * volunteer / platform admin in Postgres (see helpers/seed.ts — the state real approvals leave
 * behind), and log in through the real UI. Saves, password changes, deactivation and deletion are
 * all confirmed against the database, not just the page.
 */
const password = 'SuperSecret123!'

async function register(page: Page, tag: string) {
  const email = `e2e-acct-${tag}-${Date.now()}@example.com`
  const res = await page.request.post('http://localhost:8080/api/v1/auth/register', { data: { email, password } })
  expect(res.ok()).toBeTruthy()
  return email
}

async function logIn(page: Page, email: string, landing: RegExp, pw = password) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(landing)
}

async function signInAsNgoAdmin(page: Page, tag: string) {
  const email = await register(page, tag)
  const ngoName = `E2E Acct ${tag} ${Date.now()}`
  const ngoId = promoteToNgoAdmin(email, ngoName)
  await logIn(page, email, /\/ngo\/dashboard$/)
  return { email, ngoName, ngoId }
}

const NGO_URL = '/ngo/settings/account'

test.describe('My Account — NGO staff, real backend', () => {
  test('shows the real name, email, role and organisation', async ({ page }) => {
    const { email, ngoName } = await signInAsNgoAdmin(page, 'load')
    await page.goto(NGO_URL)

    await expect(page.getByRole('heading', { name: 'My Account' })).toBeVisible()
    await expect(page.getByLabel('Full name')).toHaveValue('E2E NGO Admin')
    await expect(page.getByLabel('Email')).toHaveValue(email)
    await expect(page.getByText('NGO admin', { exact: true })).toBeVisible()
    await expect(page.getByText(ngoName)).toBeVisible()
  })

  test('is reachable from the avatar menu and the sidebar', async ({ page }) => {
    await signInAsNgoAdmin(page, 'nav')

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'My Account' }).click()
    await expect(page).toHaveURL(/\/ngo\/settings\/account$/)

    await page.goto('/ngo/dashboard')
    await page.getByRole('link', { name: 'My Account' }).click()
    await expect(page).toHaveURL(/\/ngo\/settings\/account$/)
  })

  test('saving a new name updates the real profile and survives a reload', async ({ page }) => {
    const { email } = await signInAsNgoAdmin(page, 'name')
    await page.goto(NGO_URL)

    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await page.getByLabel('Full name').fill('Ayesha Siddiqui')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Saved')).toBeVisible()
    expect(readProfileName(email)).toBe('Ayesha Siddiqui')

    await page.reload()
    await expect(page.getByLabel('Full name')).toHaveValue('Ayesha Siddiqui')
  })

  test('rejects a blank name without calling the network', async ({ page }) => {
    let patchCalled = false
    await page.route('**/api/v1/profile', async (route) => {
      if (route.request().method() === 'PATCH') patchCalled = true
      await route.continue()
    })
    await signInAsNgoAdmin(page, 'blank')
    await page.goto(NGO_URL)

    await page.getByLabel('Full name').fill('   ')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Please enter your name')).toBeVisible()
    expect(patchCalled).toBe(false)
  })

  test('a wrong current password gets the real 401 and keeps the user signed in', async ({ page }) => {
    await signInAsNgoAdmin(page, 'pw-wrong')
    await page.goto(NGO_URL)

    await page.getByLabel('Current password').fill('DefinitelyWrong1!')
    await page.getByLabel('New password', { exact: true }).fill('BrandNewPassword123!')
    await page.getByLabel('Confirm new password').fill('BrandNewPassword123!')
    await page.getByRole('button', { name: 'Change password' }).click()

    await expect(page.getByText('invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/ngo\/settings\/account$/)
  })

  test('changing the password signs out everywhere; the old one stops working and the new one works', async ({ page }) => {
    const { email } = await signInAsNgoAdmin(page, 'pw-change')
    await page.goto(NGO_URL)
    const newPassword = 'BrandNewPassword123!'

    await page.getByLabel('Current password').fill(password)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Change password' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Your password was changed. Log in with your new password.')).toBeVisible()

    // The session really is dead server-side: a protected route bounces back to login.
    await page.goto(NGO_URL)
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page.getByRole('alert')).toHaveText('invalid email or password')

    await page.getByLabel('Password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)
  })

  test('deactivating signs out with a message, marks the account deactivated, and logging in again reactivates it', async ({
    page,
  }) => {
    const { email } = await signInAsNgoAdmin(page, 'deactivate')
    await page.goto(NGO_URL)

    await page.getByRole('button', { name: 'Deactivate' }).click()
    await page.getByRole('button', { name: 'Deactivate account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Your account has been deactivated.')).toBeVisible()
    expect(readAccountState(email)).toMatchObject({ status: 'deactivated', deleted: false })

    await logIn(page, email, /\/ngo\/dashboard$/)
    expect(readAccountState(email)).toMatchObject({ status: 'active', role: 'ngo_admin' })
  })

  test('deleting needs the right password, then removes the account for good', async ({ page }) => {
    const { email } = await signInAsNgoAdmin(page, 'delete')
    await page.goto(NGO_URL)

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByLabel('Current password', { exact: true }).last().fill('DefinitelyWrong1!')
    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.getByRole('alert')).toHaveText('invalid email or password')
    expect(readAccountState(email).deleted).toBe(false)

    await page.getByLabel('Current password', { exact: true }).last().fill(password)
    await page.getByRole('button', { name: 'Delete account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Your account has been deleted.')).toBeVisible()
    expect(readAccountState(email).deleted).toBe(true)
  })

  test('an ngo_volunteer reaches it too — My Account is not admin-only', async ({ page }) => {
    const { ngoName, ngoId } = await signInAsNgoAdmin(page, 'vol-admin')
    await page.context().clearCookies()
    const volunteer = await register(page, 'vol')
    promoteToNgoVolunteer(volunteer, ngoId)
    await logIn(page, volunteer, /\/ngo\/dashboard$/)

    await page.getByRole('link', { name: 'My Account' }).click()

    await expect(page).toHaveURL(/\/ngo\/settings\/account$/)
    await expect(page.getByText('NGO volunteer', { exact: true })).toBeVisible()
    await expect(page.getByText(ngoName)).toBeVisible()
  })
})

test.describe('My Account — platform admin, real backend', () => {
  test('works on the admin route: role shown, no organisation, name saves, password change re-logs in to the admin console', async ({
    page,
  }) => {
    const email = await register(page, 'admin')
    promoteToPlatformAdmin(email)
    await logIn(page, email, /\/admin\/dashboard$/)

    await page.getByRole('link', { name: 'My Account' }).click()
    await expect(page).toHaveURL(/\/admin\/settings\/account$/)
    await expect(page.getByText('Admin', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue(email)

    await page.getByLabel('Full name').fill('Platform Admin One')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved')).toBeVisible()
    expect(readProfileName(email)).toBe('Platform Admin One')

    const newPassword = 'BrandNewPassword123!'
    await page.getByLabel('Current password').fill(password)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await logIn(page, email, /\/admin\/dashboard$/, newPassword)
  })
})
