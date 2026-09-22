import { test, expect } from '@playwright/test'

test('logs in, logs out via the account menu, and cannot go back to an authenticated screen', async ({
  page,
  request,
}) => {
  const email = `e2e-logout-${Date.now()}@example.com`
  const password = 'SuperSecret123!'
  const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', {
    data: { email, password },
  })
  expect(registerRes.ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Log Out' }).click()

  await expect(page).toHaveURL(/\/login$/)

  // The session is really gone server-side too, not just client-state — going back to a
  // protected route bounces to /login instead of showing stale content.
  await page.goto('/app/home')
  await expect(page).toHaveURL(/\/login$/)
})
