import { test, expect } from '@playwright/test'

/**
 * Full "log in -> reach an authenticated screen -> log out via the UI" E2E coverage is
 * currently blocked by a real constraint, not a shortcut taken here: every self-registered
 * account starts unverified, RequireRole (routes/guards.tsx) correctly refuses to let an
 * unverified account reach /app/home, and the real OTP is only logged server-side in dev
 * (api/00-identity.md) — not returned in any response this test can read, and not accessible
 * here since the backend process is run separately from this test run. There is currently no
 * way to obtain a genuinely verified test account without a human reading a server log and
 * completing /verify-email by hand.
 *
 * The AccountMenu/useLogout mechanism itself (open menu -> click Log Out -> real
 * /auth/logout call -> store cleared -> redirect) is still covered end-to-end against the
 * backend in src/layouts/CitizenLayout.test.tsx, via a directly-authenticated store state that
 * bypasses the route guard chain (legitimate for a component test — it's testing CitizenLayout
 * in isolation, not full navigation). Once the OTP verification screen exists (next in
 * FRONTEND_IMPLEMENTATION_PLAN.md's Phase 1), revisit whether a full real-backend E2E path
 * becomes reachable.
 */
test('the access token never touches browser storage, only in-memory state', async ({ page, request }) => {
  const email = `e2e-storage-check-${Date.now()}@example.com`
  const password = 'SuperSecret123!'
  const registerRes = await request.post('http://localhost:8080/api/v1/auth/register', {
    data: { email, password },
  })
  expect(registerRes.ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)

  // store/auth.ts deliberately keeps the access token in memory only (never localStorage /
  // sessionStorage) — an XSS-surface decision worth actually verifying, not just asserting in
  // a code comment.
  const storageDump = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  const serialized = JSON.stringify(storageDump)
  expect(serialized).not.toContain('access_token')
  expect(serialized.toLowerCase()).not.toContain('bearer')
})
