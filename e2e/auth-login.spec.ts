import { test, expect } from '@playwright/test'

/**
 * Runs against the real local Go backend (localhost:8080, called directly — CORS is open for
 * the dev origin, see .env.local's VITE_API_BASE_URL) per FRONTEND_IMPLEMENTATION_PLAN.md
 * Phase 1: Identity is a built backend domain, so its screens get real E2E coverage now, not MSW.
 */
test.describe('Login — real backend', () => {
  test('shows the backend error message for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByLabel('Password', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Log In' }).click()

    await expect(page.getByRole('alert')).toHaveText('invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logs in a freshly-registered citizen and lands on Home', async ({ page, request }) => {
    const email = `e2e-login-${Date.now()}@example.com`
    const password = 'SuperSecret123!'

    // Registration itself isn't built in the UI yet (next screen in this phase) — seed the
    // account directly against the real API, same backend the UI talks to via the dev proxy.
    const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', {
      data: { email, password },
    })
    expect(registerRes.ok()).toBeTruthy()

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()

    await expect(page).toHaveURL(/\/app\/home$/)
  })

  test('a citizen cannot reach an NGO or Admin route by navigating there directly', async ({
    page,
    request,
  }) => {
    const email = `e2e-isolation-${Date.now()}@example.com`
    const password = 'SuperSecret123!'
    const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', { data: { email, password } })
    expect(registerRes.ok()).toBeTruthy()

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL(/\/app\/home$/)

    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/app\/home$/)

    await page.goto('/ngo/dashboard')
    await expect(page).toHaveURL(/\/app\/home$/)
  })
})
