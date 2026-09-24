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

type Fulfill = { status: number; contentType: string; body: string }

const notFound: Fulfill = {
  status: 404,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'ngo not found' }),
}

function found(status: string, name = 'Flood Relief Karachi'): Fulfill {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'fake-ngo-id',
      name,
      status,
      created_at: '2026-09-24T10:00:00Z',
      updated_at: '2026-09-24T10:00:00Z',
    }),
  }
}

/** Same technique as profile-edit.spec.ts's `registerAndReachEditProfile` — see that file's own
 *  comment for the full "why". Load-bearing caveat for THIS screen: both `GET /ngos/mine` and
 *  `POST /ngos/register` are `RequireVerified` (api/00-identity.md), not just `RequireAuth` like
 *  `GET`/`PATCH /profile` — the access token this session holds still genuinely carries
 *  `email_verified: false` (only the client-side store's opinion was overridden), so the backend
 *  correctly rejects both. That's the real, correct behavior, not a limitation to work around —
 *  so a test that needs the page to get *past* its load stubs only `GET /ngos/mine` (passing
 *  `mine`), registered before the client-side navigation to the screen so the very first request
 *  is intercepted. Omit `mine` to let the real backend answer. */
async function registerAndReachMyNgo(
  page: Page,
  email: string,
  password: string,
  mine?: () => Fulfill,
) {
  const registerRes = await page.request.post('http://localhost:8080/api/v1/auth/register', {
    data: { email, password },
  })
  expect(registerRes.ok()).toBeTruthy()

  if (mine) {
    await page.route('**/api/v1/ngos/mine', (route) => route.fulfill(mine()))
  }

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
    window.history.pushState({}, '', '/app/profile/ngo')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

test.describe('My NGO — real backend', () => {
  test('a genuinely unverified access token gets the real "email verification required" on load, with a retry', async ({
    page,
  }) => {
    // No stubbing: proves the client-side bypass this suite uses to *reach* the screen can't fool
    // the backend's own RequireVerified check on GET /ngos/mine — the two are independent, and
    // only the frontend guard was spoofed. A real, non-404 failure surfaces as an error, not as
    // the empty-state form.
    await registerAndReachMyNgo(page, `e2e-myngo-unverified-${Date.now()}@example.com`, 'SuperSecret123!')

    await expect(page.getByRole('alert')).toHaveText('email verification required')
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByLabel('Organisation name')).not.toBeVisible()
  })

  test('with nothing submitted (404), shows the register form and rejects bad input without calling the network', async ({
    page,
  }) => {
    let registerCalled = false
    await page.route('**/api/v1/ngos/register', async (route) => {
      registerCalled = true
      await route.continue()
    })
    await registerAndReachMyNgo(page, `e2e-myngo-validation-${Date.now()}@example.com`, 'SuperSecret123!', () => notFound)

    await expect(page.getByRole('heading', { name: 'My NGO' })).toBeVisible()
    await page.getByRole('button', { name: 'Register NGO' }).click()
    await expect(page.getByText('NGO name is required')).toBeVisible()

    await page.getByLabel('Organisation name').fill('Flood Relief Karachi')
    await page.getByLabel('Contact email (optional)').fill('not-an-email')
    await page.getByRole('button', { name: 'Register NGO' }).click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()

    expect(registerCalled).toBe(false)
  })

  test('a real POST /ngos/register from an unverified token gets the real "email verification required" rejection', async ({
    page,
  }) => {
    // Only GET /ngos/mine is stubbed (so the form is reachable); the POST is the genuine round trip.
    await registerAndReachMyNgo(page, `e2e-myngo-post403-${Date.now()}@example.com`, 'SuperSecret123!', () => notFound)

    await page.getByLabel('Organisation name').fill('Flood Relief Karachi')
    await page.getByRole('button', { name: 'Register NGO' }).click()

    await expect(page.getByRole('alert')).toHaveText('email verification required')
    await expect(page.getByLabel('Organisation name')).toBeVisible()
  })
})

// The states below need a genuinely verified account, which this suite can't produce (the real OTP
// is only server-logged — see profile-edit.spec.ts's note on the same limitation). Only the one
// GET /ngos/mine response is replaced with a correctly-shaped fake, so the real client code — the
// query, the status card, the form swap, the refetch after a submit, the logout — all runs for real.
test.describe('My NGO — status states (GET /ngos/mine stubbed)', () => {
  test('an existing pending submission is shown when the page is opened again — no register form', async ({
    page,
  }) => {
    await registerAndReachMyNgo(page, `e2e-myngo-pending-${Date.now()}@example.com`, 'SuperSecret123!', () =>
      found('pending_approval'),
    )

    await expect(page.getByRole('heading', { name: 'Flood Relief Karachi' })).toBeVisible()
    await expect(page.getByText('Pending approval')).toBeVisible()
    await expect(page.getByLabel('Organisation name')).not.toBeVisible()

    // Open the page again (the reported bug: it used to forget and show the form) — leave and come back.
    await page.getByRole('link', { name: 'Edit Profile' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()
    await page.getByRole('link', { name: 'My NGO' }).click()

    await expect(page.getByText('Pending approval')).toBeVisible()
    await expect(page.getByLabel('Organisation name')).not.toBeVisible()
  })

  test('submitting swaps the form for the server\'s pending row after the refetch', async ({ page }) => {
    let submitted = false
    await registerAndReachMyNgo(page, `e2e-myngo-submit-${Date.now()}@example.com`, 'SuperSecret123!', () =>
      submitted ? found('pending_approval') : notFound,
    )
    await page.route('**/api/v1/ngos/register', (route) => {
      submitted = true
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'fake-ngo-id', name: 'Flood Relief Karachi', status: 'pending_approval' }),
      })
    })

    await page.getByLabel('Organisation name').fill('Flood Relief Karachi')
    await page.getByRole('button', { name: 'Register NGO' }).click()

    await expect(page.getByText('Pending approval')).toBeVisible()
    await expect(page.getByLabel('Organisation name')).not.toBeVisible()
  })

  test('a rejected submission shows the status alongside the form so it can be resubmitted', async ({ page }) => {
    await registerAndReachMyNgo(page, `e2e-myngo-rejected-${Date.now()}@example.com`, 'SuperSecret123!', () =>
      found('rejected'),
    )

    await expect(page.getByText('Not approved')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Submit a new registration' })).toBeVisible()
    await expect(page.getByLabel('Organisation name')).toBeVisible()
  })

  test('an approved submission prompts a fresh login, which really logs out and lands on /login with a message', async ({
    page,
  }) => {
    await registerAndReachMyNgo(page, `e2e-myngo-active-${Date.now()}@example.com`, 'SuperSecret123!', () =>
      found('active'),
    )

    await expect(page.getByText('Approved', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Log in again' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(/NGO was approved/)).toBeVisible()
  })
})
