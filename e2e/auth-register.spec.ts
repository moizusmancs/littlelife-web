import { test, expect } from '@playwright/test'

test.describe('Register — real backend', () => {
  test('registers a new citizen, establishes a real session, and lands on email verification', async ({
    page,
  }) => {
    const email = `e2e-register-${Date.now()}@example.com`

    await page.goto('/register')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('SuperSecret123!')
    await page.getByLabel('Confirm password').fill('SuperSecret123!')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).toHaveURL(/\/verify-email$/)

    // The onboarding gate is real, not just a one-time redirect: reloading /verify-email while
    // still unverified keeps the user there rather than bouncing them to /app/home.
    await page.reload()
    await expect(page).toHaveURL(/\/verify-email$/)

    // And the session RegisterPage established really is cookie-backed (chained through a
    // real /auth/login), not just the register response's own token — refreshing should not
    // log the user out.
    await expect(page.getByText('Not built yet')).toBeVisible()
  })

  test('shows the real conflict error when the email is already registered', async ({ page, request }) => {
    const email = `e2e-register-dup-${Date.now()}@example.com`
    const first = await request.post('http://localhost:8080/api/v1/auth/register', {
      data: { email, password: 'SuperSecret123!' },
    })
    expect(first.ok()).toBeTruthy()

    await page.goto('/register')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('AnotherPassword456!')
    await page.getByLabel('Confirm password').fill('AnotherPassword456!')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('alert')).toHaveText('email already registered')
    await expect(page).toHaveURL(/\/register$/)
  })

  test('a citizen mid-onboarding (unverified) cannot skip straight into the app', async ({ page }) => {
    const email = `e2e-onboarding-gate-${Date.now()}@example.com`

    await page.goto('/register')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('SuperSecret123!')
    await page.getByLabel('Confirm password').fill('SuperSecret123!')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/verify-email$/)

    await page.goto('/app/home')
    await expect(page).toHaveURL(/\/verify-email$/)

    // Nor can they see the login/register screens again while this session is active.
    await page.goto('/register')
    await expect(page).toHaveURL(/\/verify-email$/)
  })
})
