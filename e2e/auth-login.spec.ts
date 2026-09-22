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

  test('logs in a freshly-registered (unverified) citizen and lands on email verification, not Home', async ({
    page,
    request,
  }) => {
    const email = `e2e-login-${Date.now()}@example.com`
    const password = 'SuperSecret123!'

    // Seeded directly against the real API rather than through the Register UI — this test is
    // about Login's own behavior, not Register's. Every self-registered account starts
    // unverified, so this is genuinely the only reachable post-login state without an OTP.
    const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', {
      data: { email, password },
    })
    expect(registerRes.ok()).toBeTruthy()

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()

    // The onboarding gate (RequireRole, routes/guards.tsx) redirects an unverified account
    // here instead of its role's landing route — this is intentional, not a bug: verification
    // is mandatory and cannot be skipped.
    await expect(page).toHaveURL(/\/verify-email$/)
  })

  test('an unverified citizen cannot reach an NGO or Admin route by navigating there directly', async ({
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
    await expect(page).toHaveURL(/\/verify-email$/)

    // Neither route is reachable: role-mismatch bounces to /app/home, which itself then
    // bounces to /verify-email since this account still isn't verified — same end state
    // either way, never the admin/NGO screen itself.
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/verify-email$/)

    await page.goto('/ngo/dashboard')
    await expect(page).toHaveURL(/\/verify-email$/)
  })
})
