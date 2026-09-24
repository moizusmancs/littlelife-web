import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import {
  promoteToNgoAdmin,
  promoteToPlatformAdmin,
  readAccountId,
  readAccountState,
  readModerationActions,
  seedTrustScore,
  setAccountStatus,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for `/admin/users` and `/admin/users/:id`, with no spoofing and no stubbed
 * responses. Platform admins are registered through the API and promoted in Postgres (see
 * helpers/seed.ts); suspensions, reactivations and logged moderation actions are all confirmed
 * against the database, and the suspended citizen's real login is tried in a separate browser
 * session. Registrations go through the standalone `request` fixture, never `page.request`, because
 * a register call sets the new account's session cookie — which would silently replace the
 * signed-in admin's in a shared cookie jar.
 */
const API = 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'

async function register(request: APIRequestContext, tag: string) {
  const email = `e2e-usr-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await request.post(`${API}/auth/register`, { data: { email, password } })
  expect(res.ok()).toBeTruthy()
  return email
}

async function logIn(page: Page, email: string, landing: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(landing)
}

async function signInAsAdmin(page: Page, request: APIRequestContext, tag: string) {
  const email = await register(request, `${tag}-admin`)
  promoteToPlatformAdmin(email)
  await logIn(page, email, /\/admin\/dashboard$/)
  return email
}

/** A registered citizen made a genuinely verified, active account (so it can really log in). */
async function activeCitizen(request: APIRequestContext, tag: string) {
  const email = await register(request, tag)
  verifyAndOnboardAccount(email, 'E2E Citizen')
  return email
}

const detailUrl = (email: string) => `/admin/users/${readAccountId(email)}`
const rowFor = (page: Page, email: string) => page.locator('li').filter({ hasText: email })
const search = (page: Page, text: string) => page.getByRole('searchbox', { name: 'Search accounts' }).fill(text)

async function newSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' })
  return { context, page: await context.newPage() }
}

test.describe('Users & Accounts list — real backend', () => {
  test('finds a real account by email, showing its real role and its real (pending verification) status', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'list')
    const pending = await register(request, 'pending') // a fresh registration: status pending_verification

    await page.getByRole('link', { name: 'Users & Accounts' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('heading', { name: 'Users & Accounts', level: 1 })).toBeVisible()
    await expect(page.getByText(/\d+ accounts · \d+ citizens · \d+ NGO staff · \d+ admins/)).toBeVisible()

    await search(page, pending)
    await expect(page.getByRole('listitem')).toHaveCount(1)
    await expect(rowFor(page, pending)).toContainText('Citizen')
    await expect(rowFor(page, pending)).toContainText('Pending verification')
    await expect(page.getByText('1–1 of 1')).toBeVisible()
  })

  test('filters by role and by status, and reports when nothing matches', async ({ page, request }) => {
    const adminEmail = await signInAsAdmin(page, request, 'filter')
    const suspended = await activeCitizen(request, 'suspended')
    setAccountStatus(suspended, 'suspended')

    await page.goto('/admin/users')
    await search(page, suspended)
    await expect(rowFor(page, suspended)).toContainText('Suspended')

    await page.getByRole('button', { name: 'Admin', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'No accounts match' })).toBeVisible()
    await page.getByRole('button', { name: 'Citizen' }).click()
    await expect(rowFor(page, suspended)).toBeVisible()

    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('Active')
    await expect(page.getByRole('heading', { name: 'No accounts match' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('Suspended')
    await expect(rowFor(page, suspended)).toBeVisible()

    // Widening the filters again finds a platform admin, shown with the Admin role.
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('All statuses')
    await search(page, adminEmail)
    await expect(rowFor(page, adminEmail)).toContainText('Admin')
  })

  test('pages through the whole platform, and Back from an account returns to the same page', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'paging')
    await page.goto('/admin/users')
    await expect(page.getByText(/^1–20 of \d+$/)).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(20)

    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(/^21–40 of \d+$/)).toBeVisible()
    await expect(page).toHaveURL(/page=2/)

    await page.getByRole('link', { name: /^View / }).first().click()
    await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/)
    // The breadcrumb only exists once the account has loaded (the sidebar link is always there).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Users & Accounts' }).click()

    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText(/^21–40 of \d+$/)).toBeVisible()
  })

  test('suspends and reactivates straight from a row, with a reason, and the database agrees', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'row')
    const citizen = await activeCitizen(request, 'row-target')
    await page.goto('/admin/users')
    await search(page, citizen)

    await rowFor(page, citizen).getByRole('button', { name: `Suspend ${citizen}` }).click()
    await page.getByRole('button', { name: 'Suspend account' }).click()
    await expect(page.getByText('Enter a reason')).toBeVisible()
    expect(readAccountState(citizen).status).toBe('active')

    await page.getByLabel('Reason').fill('Repeated false reports')
    await page.getByRole('button', { name: 'Suspend account' }).click()

    await expect(page.getByText(`${citizen} was suspended.`)).toBeVisible()
    await expect(rowFor(page, citizen)).toContainText('Suspended')
    expect(readAccountState(citizen).status).toBe('suspended')
    expect(readModerationActions(citizen)).toEqual([{ type: 'suspend', reason: 'Repeated false reports' }])

    await rowFor(page, citizen).getByRole('button', { name: `Reactivate ${citizen}` }).click()
    await page.getByLabel('Reason').fill('Reviewed and cleared')
    await page.getByRole('button', { name: 'Reactivate account' }).click()

    await expect(page.getByText(`${citizen} was reactivated.`)).toBeVisible()
    await expect(rowFor(page, citizen)).toContainText('Active')
    expect(readAccountState(citizen).status).toBe('active')
  })

  test("marks the admin's own row and offers no suspend on it", async ({ page, request }) => {
    const adminEmail = await signInAsAdmin(page, request, 'self-row')
    await page.goto('/admin/users')
    await search(page, adminEmail)

    await expect(rowFor(page, adminEmail)).toContainText('You')
    await expect(rowFor(page, adminEmail).getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('link', { name: `View ${adminEmail}` })).toBeVisible()
  })
})

test.describe('Account detail — real backend', () => {
  test('shows the real account, "Not scored yet", and an empty history', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'detail')
    const citizen = await activeCitizen(request, 'detail-target')
    const id = readAccountId(citizen)

    await page.goto(`/admin/users/${id}`)

    await expect(page.getByRole('heading', { level: 1, name: citizen })).toBeVisible()
    const details = page.getByRole('region', { name: 'Account details' })
    await expect(details).toContainText(id)
    await expect(details).toContainText('Citizen')
    await expect(details).toContainText('Active')
    await expect(page.getByText('Not scored yet')).toBeVisible()
    await expect(page.getByText('No moderation actions have been recorded for this account.')).toBeVisible()
  })

  test('shows a stored credibility score', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'score')
    const citizen = await activeCitizen(request, 'score-target')
    seedTrustScore(citizen, 73)

    await page.goto(detailUrl(citizen))

    await expect(page.getByRole('region', { name: 'Credibility' })).toContainText('73')
    await expect(page.getByText('Not scored yet')).toHaveCount(0)
  })

  test('opens from the list, and says "not found" for an unknown or malformed id', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'open')
    const citizen = await activeCitizen(request, 'open-target')
    await page.goto('/admin/users')
    await search(page, citizen)
    await page.getByRole('link', { name: `View ${citizen}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: citizen })).toBeVisible()

    await page.goto('/admin/users/00000000-0000-0000-0000-000000000001')
    await expect(page.getByRole('heading', { name: 'Account not found' })).toBeVisible()
    await page.goto('/admin/users/not-a-uuid')
    await expect(page.getByRole('heading', { name: 'Account not found' })).toBeVisible()
  })

  test('suspend needs a reason; the account really cannot log in until reactivated, and the history records both', async ({
    page,
    request,
    browser,
  }) => {
    await signInAsAdmin(page, request, 'lifecycle')
    const citizen = await activeCitizen(request, 'lifecycle-target')
    await page.goto(detailUrl(citizen))

    await page.getByRole('button', { name: 'Suspend account' }).click()
    await page.getByRole('button', { name: 'Suspend account' }).last().click()
    await expect(page.getByText('Enter a reason')).toBeVisible()
    expect(readAccountState(citizen).status).toBe('active')

    await page.getByLabel('Reason').fill('Repeated false incident reports')
    await page.getByRole('button', { name: 'Suspend account' }).last().click()

    await expect(page.getByText(`${citizen} was suspended.`)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Account details' })).toContainText('Suspended')
    expect(readAccountState(citizen).status).toBe('suspended')
    const history = page.getByRole('region', { name: 'Moderation history' })
    await expect(history).toContainText('Suspend')
    await expect(history).toContainText('Repeated false incident reports')
    await expect(history).toContainText('You')

    // The suspension is real: the citizen is refused at login.
    const blocked = await newSession(browser)
    await blocked.page.goto('/login')
    await blocked.page.getByLabel('Email').fill(citizen)
    await blocked.page.getByLabel('Password', { exact: true }).fill(password)
    await blocked.page.getByRole('button', { name: 'Log In' }).click()
    await expect(blocked.page.getByRole('alert')).toContainText('not active')
    await blocked.context.close()

    await page.getByRole('button', { name: 'Reactivate account' }).click()
    await page.getByLabel('Reason').fill('Reviewed and cleared')
    await page.getByRole('button', { name: 'Reactivate account' }).last().click()

    await expect(page.getByText(`${citizen} was reactivated.`)).toBeVisible()
    expect(readAccountState(citizen).status).toBe('active')
    expect(readModerationActions(citizen).map((a) => a.type)).toEqual(['suspend', 'unblock'])
    const entries = history.getByRole('listitem')
    await expect(entries).toHaveCount(2)
    await expect(entries.first()).toContainText('Unblock') // newest first
    await expect(entries.first()).toContainText('You')

    const allowed = await newSession(browser)
    await logIn(allowed.page, citizen, /\/app\/home$/)
    await allowed.context.close()
  })

  test('logging a moderation action records it and leaves the status alone', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'log')
    const citizen = await activeCitizen(request, 'log-target')
    await page.goto(detailUrl(citizen))

    await page.getByRole('button', { name: 'Log moderation action' }).click()
    await page.getByLabel('Action', { exact: true }).selectOption('Block')
    await page.getByLabel('Reason').fill('Scam reports from three users')
    await page.getByRole('button', { name: 'Log action' }).click()

    await expect(page.getByText("Recorded a block in this account's history.")).toBeVisible()
    await expect(page.getByRole('region', { name: 'Moderation history' })).toContainText('Scam reports from three users')
    expect(readModerationActions(citizen)).toEqual([{ type: 'block', reason: 'Scam reports from three users' }])
    expect(readAccountState(citizen).status).toBe('active')
  })

  test("names another admin as the one who recorded an action, and 'You' for your own", async ({ page, request }) => {
    await signInAsAdmin(page, request, 'perf-a')
    const citizen = await activeCitizen(request, 'perf-target')

    // A second platform admin records a warning through the API (its own cookie-less request).
    const second = await register(request, 'perf-b-admin')
    promoteToPlatformAdmin(second)
    const login = await request.post(`${API}/auth/login`, { data: { email: second, password } })
    const { access_token: token } = await login.json()
    const warned = await request.post(`${API}/admin/accounts/${readAccountId(citizen)}/moderation-actions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { action_type: 'warn', reason: 'Warned by the other admin' },
    })
    expect(warned.status()).toBe(201)

    await page.goto(detailUrl(citizen))
    await page.getByRole('button', { name: 'Log moderation action' }).click()
    await page.getByLabel('Reason').fill('Logged by me')
    await page.getByRole('button', { name: 'Log action' }).click()

    const history = page.getByRole('region', { name: 'Moderation history' })
    await expect(history.getByRole('listitem').first()).toContainText('You')
    await expect(history.getByRole('listitem').nth(1)).toContainText(second)
  })

  test('acting on an account that changed behind the page: the real 409 is reported as "already", nothing is logged', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(page, request, 'stale')
    const citizen = await activeCitizen(request, 'stale-target')
    await page.goto(detailUrl(citizen))
    await expect(page.getByRole('button', { name: 'Suspend account' })).toBeVisible()

    setAccountStatus(citizen, 'suspended') // someone else got there first

    await page.getByRole('button', { name: 'Suspend account' }).click()
    await page.getByLabel('Reason').fill('Too late')
    await page.getByRole('button', { name: 'Suspend account' }).last().click()

    await expect(page.getByText(`${citizen} was already suspended, so nothing changed.`)).toBeVisible()
    expect(readModerationActions(citizen)).toEqual([])
    await expect(page.getByRole('button', { name: 'Reactivate account' })).toBeVisible()
  })

  test("the admin's own account has no status or log controls — the backend would let them lock themselves out", async ({
    page,
    request,
  }) => {
    const adminEmail = await signInAsAdmin(page, request, 'self')
    await page.goto(detailUrl(adminEmail))

    await expect(page.getByRole('heading', { level: 1, name: adminEmail })).toBeVisible()
    await expect(page.getByText(/your own account/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Suspend|Reactivate/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Log moderation action' })).toHaveCount(0)
    expect(readAccountState(adminEmail).status).toBe('active')
  })
})

test.describe('Access — real backend', () => {
  test('an NGO admin is bounced from /admin/users, and the API itself refuses them (403)', async ({ page, request }) => {
    const email = await register(request, 'ngo')
    promoteToNgoAdmin(email, `E2E Users Access ${Date.now()}`)
    await logIn(page, email, /\/ngo\/dashboard$/)

    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)

    const login = await request.post(`${API}/auth/login`, { data: { email, password } })
    const { access_token: token } = await login.json()
    const list = await request.get(`${API}/admin/accounts`, { headers: { Authorization: `Bearer ${token}` } })
    expect(list.status()).toBe(403)
  })
})
