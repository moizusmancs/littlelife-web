import { test, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** Dev-only debug hook (App.tsx, behind `import.meta.env.DEV`) — the actual live Zustand
     *  auth store instance, exposing its standard `getState`/`setState` statics. Typed loosely
     *  here (not imported from `@/store/auth`) since e2e specs aren't part of the app's own
     *  tsconfig project. */
    __authStore: {
      getState: () => { user: Record<string, unknown> | null }
      setState: (partial: { user: Record<string, unknown> | null }) => void
    }
  }
}

/**
 * Reaching /app/profile/edit needs a fully-onboarded account (verified + profile complete), and
 * there's no way to complete real email verification from a test — the OTP is only server-logged
 * (same known limitation as auth-verify-email.spec.ts). Mirrors the technique
 * FRONTEND_IMPLEMENTATION_PLAN.md's Progress log describes for visually verifying onboarding-
 * gated screens: register + log in for real (a genuine cookie session + access token), then
 * flip `emailVerified`/`profileComplete` client-side via the dev-only `window.__authStore` hook
 * so the route guards let us through. Everything downstream (GET/PATCH /profile) still hits the
 * real backend with the real session — only the route guard's opinion is faked, not the network.
 *
 * Done in two steps to dodge a guard race: setting the override while still mounted on
 * /verify-email lets RequireUnverifiedSession's own redirect-to-nextAuthRoute fire and settle on
 * /app/home first; only then does a second client-side nav (pushState + popstate, never
 * page.goto, which would hard-reload and re-bootstrap from the real, still-unverified cookie
 * session) move to /app/profile/edit, where nothing is left fighting the navigation.
 */
async function registerAndReachEditProfile(page: Page, email: string, password: string) {
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
    window.history.pushState({}, '', '/app/profile/edit')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()
}

test.describe('Edit Profile — real backend', () => {
  test('loads the real (initially empty) name, saves a real name, and the sidebar header updates live', async ({
    page,
  }) => {
    const email = `e2e-editprofile-${Date.now()}@example.com`
    await registerAndReachEditProfile(page, email, 'SuperSecret123!')

    // A freshly-registered account's real `name` is "" (api/05-profiling.md's documented
    // "not yet set" state) — the sidebar must resolve to its empty-name fallback, not hang on
    // its loading skeleton forever (name === "" is falsy but IS a loaded value).
    await expect(page.getByText('Add your name')).toBeVisible()
    await expect(page.getByLabel('Your name')).toHaveValue('')

    await page.getByLabel('Your name').fill('Hina Khan')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Saved')).toBeVisible()
    // Sidebar reads through the same cache entry the mutation writes to — no manual refetch.
    await expect(page.getByText('HK', { exact: true })).toBeVisible()
    await expect(page.getByText('Hina Khan', { exact: true })).toBeVisible()
  })

  test('rejects an empty name without ever calling the network', async ({ page }) => {
    const email = `e2e-editprofile-empty-${Date.now()}@example.com`
    let patchCalled = false
    await page.route('**/api/v1/profile', async (route) => {
      if (route.request().method() === 'PATCH') patchCalled = true
      await route.continue()
    })

    await registerAndReachEditProfile(page, email, 'SuperSecret123!')
    await page.getByLabel('Your name').fill('   ')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Please enter your name')).toBeVisible()
    expect(patchCalled).toBe(false)
  })

  test('the Saved indicator clears the moment the field is edited again', async ({ page }) => {
    const email = `e2e-editprofile-dirty-${Date.now()}@example.com`
    await registerAndReachEditProfile(page, email, 'SuperSecret123!')

    await page.getByLabel('Your name').fill('Hina Khan')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.getByLabel('Your name').fill('Hina Khan Updated')
    await expect(page.getByText('Saved')).not.toBeVisible()
  })
})
