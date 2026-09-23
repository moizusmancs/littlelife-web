import { test, expect } from '@playwright/test'

test.describe('Forgot Password — real backend', () => {
  test('shows the same confirmation for both a registered and an unregistered email', async ({
    page,
    request,
  }) => {
    const registeredEmail = `e2e-forgot-${Date.now()}@example.com`
    const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', {
      data: { email: registeredEmail, password: 'SuperSecret123!' },
    })
    expect(registerRes.ok()).toBeTruthy()

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(registeredEmail)
    await page.getByRole('button', { name: 'Send Reset Code' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(`definitely-not-registered-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Send Reset Code' }).click()
    // Identical outcome — the backend is deliberately enumeration-safe here, and the UI must
    // never branch on whether the email actually exists.
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  })

  test('links forward to Reset Password with the email prefilled, and back to Login', async ({ page }) => {
    const email = `e2e-forgot-continue-${Date.now()}@example.com`
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send Reset Code' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    await page.getByRole('link', { name: 'I have a code — Reset password' }).click()
    await expect(page).toHaveURL(/\/reset-password/)
    await expect(page.getByLabel('Email')).toHaveValue(email)

    await page.goto('/forgot-password')
    await page.getByRole('link', { name: 'Back to Log In' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('Reset Password — real backend', () => {
  test('renders as a plain form with no link-validity gate when the URL has no params', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue('')
    await expect(page.getByLabel('Reset code')).toHaveValue('')
  })

  test('a fabricated email and token get the real backend error, not a fake one', async ({ page }) => {
    const email = `e2e-reset-${Date.now()}@example.com`
    await page.goto('/reset-password')

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Reset code').fill('not-a-real-token')
    await page.getByLabel('New password', { exact: true }).fill('BrandNewPassword123!')
    await page.getByLabel('Confirm new password').fill('BrandNewPassword123!')
    await page.getByRole('button', { name: 'Reset Password' }).click()

    // This specific account was never registered, so the backend's real (non-enumeration-safe)
    // response is "account not found" — confirms the real network round trip happened, not a
    // stub.
    await expect(page.getByRole('alert')).toHaveText('account not found')
  })

  test('a real account with a wrong token gets "invalid or expired code"', async ({ page, request }) => {
    const email = `e2e-reset-wrongtoken-${Date.now()}@example.com`
    const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', {
      data: { email, password: 'SuperSecret123!' },
    })
    expect(registerRes.ok()).toBeTruthy()

    await page.goto('/reset-password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Reset code').fill('wrong-token')
    await page.getByLabel('New password', { exact: true }).fill('BrandNewPassword123!')
    await page.getByLabel('Confirm new password').fill('BrandNewPassword123!')
    await page.getByRole('button', { name: 'Reset Password' }).click()

    await expect(page.getByRole('alert')).toHaveText('invalid or expired code')
  })

  test('pre-fills email and token from the URL as a convenience, and they remain editable', async ({ page }) => {
    const email = `e2e-reset-prefill-${Date.now()}@example.com`
    await page.goto(`/reset-password?email=${encodeURIComponent(email)}&token=some-token`)

    await expect(page.getByLabel('Email')).toHaveValue(email)
    await expect(page.getByLabel('Reset code')).toHaveValue('some-token')

    // Prefilled values are ordinary form state, not locked — the user can correct a mistyped
    // email or code before submitting.
    await page.getByLabel('Reset code').fill('a-different-token')
    await expect(page.getByLabel('Reset code')).toHaveValue('a-different-token')
  })
})
