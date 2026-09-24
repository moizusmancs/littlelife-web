import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  demoteToCitizen,
  promoteToNgoAdmin,
  promoteToNgoVolunteer,
  readAccountRole,
  readAccountState,
  readInvitationStatuses,
  setAccountStatus,
  setNgoStatus,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for `/ngo/volunteers`, with no spoofing and no stubbed responses. Accounts are
 * registered through the API and turned into a genuine NGO admin / volunteer in Postgres (see
 * helpers/seed.ts — the state a real approval or accepted invitation leaves behind), then log in
 * through the real UI. Invitations, acceptance and removal are confirmed against the database, and
 * the invite → citizen accepts → shows up on the roster loop runs across two real browser sessions.
 */
const API = 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'

async function register(page: Page, tag: string) {
  const email = `e2e-vol-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const res = await page.request.post(`${API}/auth/register`, { data: { email, password } })
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

async function signInAsNgoAdmin(page: Page, tag: string) {
  const email = await register(page, `${tag}-admin`)
  const ngoName = `E2E Volunteers ${tag} ${Date.now()}`
  const ngoId = promoteToNgoAdmin(email, ngoName)
  await logIn(page, email, /\/ngo\/dashboard$/)
  return { email, ngoName, ngoId }
}

/** A registered account made a volunteer of `ngoId`, optionally in a non-active account status. */
async function addVolunteer(page: Page, ngoId: string, tag: string, status?: 'suspended' | 'deactivated') {
  const email = await register(page, tag)
  promoteToNgoVolunteer(email, ngoId)
  if (status) setAccountStatus(email, status)
  return email
}

/** A second, fully separate browser session (its own cookies and in-memory auth). */
async function newSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' })
  return { context, page: await context.newPage() }
}

const rowFor = (page: Page, email: string) => page.locator('li').filter({ hasText: email })

test.describe('Volunteers — NGO admin, real backend', () => {
  test("lists this organisation's real volunteers, with status — and never another organisation's", async ({ page }) => {
    const { ngoName, ngoId } = await signInAsNgoAdmin(page, 'list')
    const active = await addVolunteer(page, ngoId, 'active')
    const suspended = await addVolunteer(page, ngoId, 'suspended', 'suspended')

    // A volunteer of a *different* NGO must not leak into this roster.
    const otherAdmin = await register(page, 'other-admin')
    const otherNgoId = promoteToNgoAdmin(otherAdmin, `E2E Volunteers other ${Date.now()}`)
    const foreign = await addVolunteer(page, otherNgoId, 'foreign')

    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page).toHaveURL(/\/ngo\/volunteers$/)

    await expect(page.getByRole('heading', { name: 'Volunteers', level: 1 })).toBeVisible()
    await expect(page.getByText(`Everyone volunteering with ${ngoName}.`)).toBeVisible()
    await expect(rowFor(page, active)).toContainText('Active')
    await expect(rowFor(page, suspended)).toContainText('Suspended')
    await expect(page.getByText(/2 volunteers · 1 not active/)).toBeVisible()
    await expect(page.getByText(foreign)).toHaveCount(0)
  })

  test('shows an empty state for an organisation with no volunteers yet', async ({ page }) => {
    await signInAsNgoAdmin(page, 'empty')
    await page.goto('/ngo/volunteers')

    await expect(page.getByRole('heading', { name: 'No volunteers yet' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('inviting a real citizen is recorded, the citizen accepts it, and they then show up on the roster', async ({
    page,
    browser,
  }) => {
    await signInAsNgoAdmin(page, 'loop')
    const citizen = await register(page, 'citizen')
    verifyAndOnboardAccount(citizen, 'E2E Invited Citizen')

    await page.goto('/ngo/volunteers')
    await page.getByRole('button', { name: 'Invite volunteer' }).click()
    await page.getByLabel("Volunteer's email").fill(citizen)
    await page.getByRole('button', { name: 'Send invitation' }).click()

    await expect(page.getByText(`Invitation sent to ${citizen}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Invite a volunteer' })).toHaveCount(0)
    expect(readInvitationStatuses(citizen)).toEqual(['pending'])
    // Not a volunteer yet — sending an invitation changes nothing about their account.
    expect(readAccountRole(citizen).role).toBe('user')
    await expect(rowFor(page, citizen)).toHaveCount(0)

    const { context, page: citizenPage } = await newSession(browser)
    await logIn(citizenPage, citizen, /\/app\/home$/)
    await citizenPage.goto('/app/profile/invitations')
    await expect(citizenPage.getByText(/E2E Volunteers loop/)).toBeVisible()
    await citizenPage.getByRole('button', { name: /Accept invitation/ }).click()
    await expect(citizenPage).toHaveURL(/\/login$/)
    await context.close()
    expect(readAccountRole(citizen).role).toBe('ngo_volunteer')

    await page.goto('/ngo/volunteers')
    await expect(rowFor(page, citizen)).toContainText('Active')
  })

  test("refuses what the backend refuses, in the backend's own words, and keeps the dialog open", async ({ page }) => {
    const { email: adminEmail, ngoId } = await signInAsNgoAdmin(page, 'refuse')
    const existing = await addVolunteer(page, ngoId, 'existing')
    let invitePosts = 0
    await page.route('**/api/v1/ngo/volunteers/invitations', async (route) => {
      invitePosts += 1
      await route.continue()
    })
    await page.goto('/ngo/volunteers')

    const invite = async (email: string) => {
      await page.getByLabel("Volunteer's email").fill(email)
      await page.getByRole('button', { name: 'Send invitation' }).click()
    }

    await page.getByRole('button', { name: 'Invite volunteer' }).click()

    await invite(`e2e-nobody-${Date.now()}@example.com`)
    await expect(page.getByRole('alert')).toHaveText('account not found')

    await invite(existing)
    await expect(page.getByRole('alert')).toContainText('must be a citizen')
    expect(readInvitationStatuses(existing)).toEqual([])
    expect(invitePosts).toBe(2)

    // Their own address never reaches the network: the backend's answer to it is a confusing 409.
    await invite(adminEmail)
    await expect(page.getByRole('alert')).toContainText("That's your own email address")
    expect(invitePosts).toBe(2)
    await expect(page.getByRole('heading', { name: 'Invite a volunteer' })).toBeVisible()
  })

  test('rejects an empty or malformed email without calling the network', async ({ page }) => {
    let invitePosts = 0
    await page.route('**/api/v1/ngo/volunteers/invitations', async (route) => {
      invitePosts += 1
      await route.continue()
    })
    await signInAsNgoAdmin(page, 'validate')
    await page.goto('/ngo/volunteers')

    await page.getByRole('button', { name: 'Invite volunteer' }).click()
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByText('Enter their email address')).toBeVisible()

    await page.getByLabel("Volunteer's email").fill('not-an-email')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    expect(invitePosts).toBe(0)
  })

  test('removing a volunteer takes them off the roster for real, and leaves their account active as a citizen', async ({
    page,
    browser,
  }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'remove')
    const leaving = await addVolunteer(page, ngoId, 'leaving')
    const staying = await addVolunteer(page, ngoId, 'staying')
    await page.goto('/ngo/volunteers')

    await page.getByRole('button', { name: `Remove ${leaving} from your organisation` }).click()
    await expect(page.getByRole('dialog')).toContainText("isn't suspended or deleted")
    await page.getByRole('button', { name: 'Remove volunteer' }).click()

    await expect(page.getByText(`${leaving} was removed from your organisation.`)).toBeVisible()
    await expect(rowFor(page, leaving)).toHaveCount(0)
    await expect(rowFor(page, staying)).toBeVisible()
    expect(readAccountRole(leaving)).toEqual({ role: 'user', ngoId: '' })
    expect(readAccountState(leaving)).toMatchObject({ status: 'active', deleted: false })

    // "Removed" is not "banned": they can log straight back in — as a plain citizen.
    const { context, page: removedPage } = await newSession(browser)
    await logIn(removedPage, leaving, /\/app\/home$/)
    await context.close()
  })

  test('cancelling the confirmation leaves the volunteer exactly where they were', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'cancel')
    const volunteer = await addVolunteer(page, ngoId, 'kept')
    await page.goto('/ngo/volunteers')

    await page.getByRole('button', { name: `Remove ${volunteer} from your organisation` }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(rowFor(page, volunteer)).toBeVisible()
    expect(readAccountRole(volunteer).role).toBe('ngo_volunteer')
  })

  test('removing someone who was already removed elsewhere shows the real 403 and refreshes the roster', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'stale')
    const gone = await addVolunteer(page, ngoId, 'gone')
    const remaining = await addVolunteer(page, ngoId, 'remaining')
    await page.goto('/ngo/volunteers')
    await expect(rowFor(page, gone)).toBeVisible()

    demoteToCitizen(gone) // changed behind the open page's back

    await page.getByRole('button', { name: `Remove ${gone} from your organisation` }).click()
    await page.getByRole('button', { name: 'Remove volunteer' }).click()

    await expect(page.getByRole('alert')).toHaveText('this account is not a volunteer under your ngo')
    await expect(rowFor(page, gone)).toHaveCount(0)
    await expect(rowFor(page, remaining)).toBeVisible()
  })

  test("a deactivated organisation can't invite, but its roster still shows and removal is still offered", async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'inactive')
    const volunteer = await addVolunteer(page, ngoId, 'still-here')
    setNgoStatus(ngoId, 'deactivated')

    await page.goto('/ngo/volunteers')

    await expect(rowFor(page, volunteer)).toBeVisible()
    await expect(page.getByText("Your organisation isn't active")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite volunteer' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Remove ${volunteer} from your organisation` })).toBeEnabled()
  })
})

test.describe('Volunteers — NGO volunteer, real backend', () => {
  test('has no sidebar link, is bounced from the URL, and the backend itself refuses the roster', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'gate')
    await page.context().clearCookies()
    const volunteer = await addVolunteer(page, ngoId, 'gated')
    await logIn(page, volunteer, /\/ngo\/dashboard$/)

    await expect(page.getByRole('link', { name: 'Volunteers' })).toHaveCount(0)
    await page.goto('/ngo/volunteers')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)

    // Not just hidden: the API enforces it too.
    const login = await page.request.post(`${API}/auth/login`, { data: { email: volunteer, password } })
    const { access_token: token } = await login.json()
    const roster = await page.request.get(`${API}/ngo/volunteers`, { headers: { Authorization: `Bearer ${token}` } })
    expect(roster.status()).toBe(403)
    expect(await roster.json()).toEqual({ error: 'insufficient permissions' })
  })
})
