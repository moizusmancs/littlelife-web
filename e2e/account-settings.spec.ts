import { test, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** Dev-only debug hook (App.tsx, behind `import.meta.env.DEV`) — see profile-edit.spec.ts's
     *  identical declaration/comment for why this is needed and how it's used safely. */
    __authStore: {
      getState: () => { user: Record<string, unknown> | null }
      setState: (partial: { user: Record<string, unknown> | null }) => void
    }
  }
}

/** Same technique as profile-edit.spec.ts's `registerAndReachEditProfile` — see that file's own
 *  comment for the full "why" (no way to complete real OTP verification from a test, so a real
 *  cookie session gets its route-guard opinion faked client-side; every API call still hits the
 *  real backend for real). */
async function registerAndReachAccountSettings(page: Page, email: string, password: string) {
  const registerRes = await page.request.post('http://localhost:8080/api/v1/auth/register', {
    data: { email, password },
  })
  expect(registerRes.ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)

  await page.evaluate(() => {
    const store = window.__authStore
    const state = store.getState()
    store.setState({ user: { ...state.user, emailVerified: true, profileComplete: true } })
  })
  await page.waitForURL(/\/app\/home$/)

  await page.evaluate(() => {
    window.history.pushState({}, '', '/app/profile/account-settings')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible()
}

test.describe('Account Settings — real backend', () => {
  test('Cancel closes the deactivate dialog without calling the network', async ({ page }) => {
    const email = `e2e-acct-cancel-${Date.now()}@example.com`
    let deactivateCalled = false
    await page.route('**/api/v1/auth/me/deactivate', async (route) => {
      deactivateCalled = true
      await route.continue()
    })

    await registerAndReachAccountSettings(page, email, 'SuperSecret123!')
    await page.getByRole('button', { name: 'Deactivate' }).click()
    await expect(page.getByRole('heading', { name: 'Deactivate your account?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('heading', { name: 'Deactivate your account?' })).not.toBeVisible()
    expect(deactivateCalled).toBe(false)
  })

  test('deactivates for real, redirects to /login with the info message, and logging back in reactivates it', async ({
    page,
  }) => {
    const email = `e2e-acct-deactivate-${Date.now()}@example.com`
    const password = 'SuperSecret123!'
    await registerAndReachAccountSettings(page, email, password)

    await page.getByRole('button', { name: 'Deactivate' }).click()
    await page.getByRole('button', { name: 'Deactivate account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Your account has been deactivated.')).toBeVisible()

    // Reversible — api/00-identity.md: a subsequent successful login reactivates the account.
    // This is a genuinely fresh page load's worth of real server truth, not the client-side
    // override from registerAndReachAccountSettings — proves reactivation actually happened
    // server-side, landing back on real (still-unverified) /verify-email, not an error.
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL(/\/verify-email$/)
  })

  test('a wrong password on delete gets the real backend error and the dialog stays open', async ({ page }) => {
    const email = `e2e-acct-delete-wrong-${Date.now()}@example.com`
    await registerAndReachAccountSettings(page, email, 'SuperSecret123!')

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByLabel('Current password').fill('DefinitelyWrongPassword!')
    await page.getByRole('button', { name: 'Delete account' }).click()

    await expect(page.getByRole('alert')).toHaveText('invalid email or password')
    await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible()
  })

  test('deletes for real, redirects to /login with the info message, and the account is really gone', async ({
    page,
  }) => {
    const email = `e2e-acct-delete-${Date.now()}@example.com`
    const password = 'SuperSecret123!'
    await registerAndReachAccountSettings(page, email, password)

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByLabel('Current password').fill(password)
    await page.getByRole('button', { name: 'Delete account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Your account has been deleted.')).toBeVisible()

    // Irreversible — confirm the account is genuinely gone, not just locally logged out.
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page.getByRole('alert')).toHaveText('invalid email or password')
  })
})
