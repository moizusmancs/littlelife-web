import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import {
  promoteToNgoAdmin,
  promoteToNgoVolunteer,
  promoteToPlatformAdmin,
  readAccountRole,
  readNgo,
  seedNgoRegion,
  seedRegion,
  setNgoStatus,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Real end to end for `/admin/ngos` and `/admin/ngos/:id`, with no spoofing and no stubbed
 * responses — and, for the first time, the whole NGO-registration loop: a citizen submits through
 * the real My NGO screen, an admin approves it here, and the citizen logs back in as that NGO's
 * admin. Applications are made through the real `POST /ngos/register` (accounts are verified in
 * Postgres first, since that route needs a genuinely verified token), decisions are read back from
 * the database, and every organisation is named `E2E …` and found by a unique search, so nothing
 * here ever touches a real pending application. Registrations use the standalone `request` fixture,
 * never `page.request`, because a register/login call sets a session cookie that would replace the
 * signed-in admin's in a shared jar.
 */
const API = 'http://localhost:8080/api/v1'
const password = 'SuperSecret123!'

async function register(request: APIRequestContext, tag: string) {
  const email = `e2e-ngo-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
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

/** A verified, onboarded citizen — so it can really log in and really submit an NGO. */
async function verifiedCitizen(request: APIRequestContext, tag: string) {
  const email = await register(request, tag)
  verifyAndOnboardAccount(email, 'E2E Applicant')
  return email
}

/** A real `POST /ngos/register` as that citizen (through the standalone `request`'s own cookie jar). */
async function submitNgo(request: APIRequestContext, citizen: string, name: string, contactEmail = '') {
  const login = await request.post(`${API}/auth/login`, { data: { email: citizen, password } })
  const { access_token: token } = await login.json()
  const res = await request.post(`${API}/ngos/register`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, ...(contactEmail ? { contact_email: contactEmail } : {}) },
  })
  expect(res.status()).toBe(201)
  return (await res.json()).id as string
}

async function decideViaApi(request: APIRequestContext, adminEmail: string, ngoId: string, decision: 'approve' | 'reject') {
  const login = await request.post(`${API}/auth/login`, { data: { email: adminEmail, password } })
  const { access_token: token } = await login.json()
  const res = await request.post(`${API}/admin/ngos/${ngoId}/${decision}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.ok()).toBeTruthy()
}

const unique = (label: string) => `E2E ${label} ${Date.now()}${Math.floor(Math.random() * 1000)}`
const rowFor = (page: Page, name: string) => page.locator('li').filter({ hasText: name })
const search = (page: Page, text: string) => page.getByRole('searchbox', { name: 'Search organisations' }).fill(text)

async function newSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' })
  return { context, page: await context.newPage() }
}

test.describe('NGO applications — the whole loop, real backend', () => {
  test('a citizen submits through My NGO, the admin approves it, and the citizen logs back in as its NGO admin', async ({
    page,
    request,
    browser,
  }) => {
    const adminEmail = await signInAsAdmin(page, request, 'loop')
    const citizen = await verifiedCitizen(request, 'loop-citizen')
    const name = unique('Loop Relief')

    // The citizen applies through the real screen.
    const applicant = await newSession(browser)
    await logIn(applicant.page, citizen, /\/app\/home$/)
    await applicant.page.goto('/app/profile/ngo')
    await applicant.page.getByLabel('Organisation name').fill(name)
    await applicant.page.getByLabel('Contact email (optional)').fill('Contact@Loop.Example')
    await applicant.page.getByRole('button', { name: 'Register NGO' }).click()
    await expect(applicant.page.getByRole('heading', { name })).toBeVisible()

    // The admin finds it in the Pending tab, with who applied, and approves it.
    await page.goto('/admin/ngos')
    await search(page, name)
    await expect(rowFor(page, name)).toContainText('Pending approval')
    await expect(rowFor(page, name)).toContainText(citizen)
    await expect(rowFor(page, name)).toContainText('contact@loop.example')
    await rowFor(page, name).getByRole('button', { name: `Approve ${name}` }).click()
    await expect(page.getByRole('dialog')).toContainText(`promotes ${citizen} to its NGO admin`)
    await page.getByRole('button', { name: 'Approve organisation' }).click()

    await expect(page.getByText(`${name} was approved. ${citizen} is now its NGO admin`)).toBeVisible()
    await expect(rowFor(page, name)).toHaveCount(0) // it has left the Pending tab
    const ngoRow = readNgoByApplicant(citizen)
    expect(ngoRow.status).toBe('active')
    expect(readAccountRole(citizen).role).toBe('ngo_admin')
    expect(readAccountRole(citizen).ngoId).toBe(ngoRow.id)

    // Their old session is dead (approval revokes it): a reload bounces to login. Logging in again
    // lands in the NGO console, where the organisation is theirs.
    await applicant.page.reload()
    await expect(applicant.page).toHaveURL(/\/login$/)
    await logIn(applicant.page, citizen, /\/ngo\/dashboard$/)
    await applicant.page.goto('/ngo/settings/organization')
    await expect(applicant.page.getByLabel('Organisation name')).toHaveValue(name)
    await applicant.context.close()

    // Back on the admin's side the organisation is Active, decided by this admin.
    await page.getByRole('tab', { name: /^Active/ }).click()
    await expect(rowFor(page, name)).toContainText('Active')
    await rowFor(page, name).getByRole('link', { name: `View ${name}` }).click()
    const card = page.getByRole('region', { name: 'Organisation' })
    await expect(card.getByText('Approved', { exact: true })).toBeVisible()
    await expect(card).toContainText(`by ${adminEmail}`)
  })

  test('a rejection closes the application, leaves the applicant a citizen, and lets them apply again', async ({
    page,
    request,
    browser,
  }) => {
    await signInAsAdmin(page, request, 'reject')
    const citizen = await verifiedCitizen(request, 'reject-citizen')
    const name = unique('Rejected Rescue')
    const ngoId = await submitNgo(request, citizen, name)

    const applicant = await newSession(browser)
    await logIn(applicant.page, citizen, /\/app\/home$/)

    await page.goto('/admin/ngos')
    await search(page, name)
    await rowFor(page, name).getByRole('button', { name: `Reject ${name}` }).click()
    await expect(page.getByRole('dialog')).toContainText('No reason is recorded')
    await page.getByRole('button', { name: 'Reject application' }).click()

    await expect(page.getByText(`${name} was rejected. ${citizen} can submit a new application.`)).toBeVisible()
    expect(readNgo(ngoId).status).toBe('rejected')
    expect(readAccountRole(citizen).role).toBe('user')

    // Reject touches nothing on the account, so their session lives on — and My NGO shows the
    // rejection *and* the form again, because a rejected row doesn't block a new submission.
    await applicant.page.goto('/app/profile/ngo')
    await expect(applicant.page.getByText('Not approved')).toBeVisible()
    await expect(applicant.page.getByLabel('Organisation name')).toBeVisible()
    await applicant.context.close()

    await page.getByRole('tab', { name: /Rejected/ }).click()
    await search(page, name)
    await expect(rowFor(page, name)).toContainText('Rejected')
    await expect(rowFor(page, name).getByRole('button')).toHaveCount(0)
  })

  test('acting on an application that was decided behind the page reports the real 409 and refreshes', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(page, request, 'stale')
    const citizen = await verifiedCitizen(request, 'stale-citizen')
    const name = unique('Stale Aid')
    const ngoId = await submitNgo(request, citizen, name)
    await page.goto('/admin/ngos')
    await search(page, name)
    await expect(rowFor(page, name)).toContainText('Pending approval')

    setNgoStatus(ngoId, 'rejected') // someone else got there first

    await rowFor(page, name).getByRole('button', { name: `Approve ${name}` }).click()
    await page.getByRole('button', { name: 'Approve organisation' }).click()

    await expect(page.getByText(`Couldn't approve ${name}: ngo is not pending approval. The view has been refreshed.`)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(rowFor(page, name)).toHaveCount(0) // refreshed: no longer pending
    expect(readAccountRole(citizen).role).toBe('user') // and nobody was promoted
  })
})

test.describe('NGOs list — real backend', () => {
  test('tabs show each status, with the pending inbox first, and search finds by name, contact and applicant', async ({
    page,
    request,
  }) => {
    const adminEmail = await signInAsAdmin(page, request, 'tabs')
    const tag = `Tabs${Date.now()}`
    const a = await verifiedCitizen(request, 'tabs-a')
    const b = await verifiedCitizen(request, 'tabs-b')
    const c = await verifiedCitizen(request, 'tabs-c')
    const d = await verifiedCitizen(request, 'tabs-d')
    const pendingName = `E2E ${tag} Pending`
    const activeName = `E2E ${tag} Active`
    const rejectedName = `E2E ${tag} Rejected`
    const deactivatedName = `E2E ${tag} Deactivated`
    await submitNgo(request, a, pendingName, `hello@${tag.toLowerCase()}.example`)
    await decideViaApi(request, adminEmail, await submitNgo(request, b, activeName), 'approve')
    await decideViaApi(request, adminEmail, await submitNgo(request, c, rejectedName), 'reject')
    const deactivatedId = await submitNgo(request, d, deactivatedName)
    await decideViaApi(request, adminEmail, deactivatedId, 'approve')
    setNgoStatus(deactivatedId, 'deactivated')

    await page.goto('/admin/ngos')
    await expect(page.getByRole('tab', { name: /Pending approval/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(/\d+ organisations · \d+ awaiting approval/)).toBeVisible()

    await search(page, tag)
    await expect(rowFor(page, pendingName)).toContainText('Pending approval')
    await expect(page.getByRole('listitem')).toHaveCount(1)

    for (const [tab, name, label] of [
      [/^Active/, activeName, 'Active'],
      [/Rejected/, rejectedName, 'Rejected'],
      [/Deactivated/, deactivatedName, 'Deactivated'],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('listitem')).toHaveCount(1)
      await expect(rowFor(page, name)).toContainText(label)
    }

    await page.getByRole('tab', { name: /^All/ }).click()
    await expect(page.getByRole('listitem')).toHaveCount(4)

    // Search also reaches the contact email and the applicant's email.
    await search(page, `hello@${tag.toLowerCase()}`)
    await expect(page.getByRole('listitem')).toHaveCount(1)
    await search(page, b)
    await expect(rowFor(page, activeName)).toBeVisible()
    await search(page, `${tag} nothing-like-this`)
    await expect(page.getByRole('heading', { name: 'No organisations match' })).toBeVisible()
  })

  test('shows a real volunteer count, and Back from an organisation returns to the same view', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'count')
    const founder = await register(request, 'count-founder')
    const name = unique('Counted Aid')
    const ngoId = promoteToNgoAdmin(founder, name)
    const v1 = await register(request, 'count-v1')
    const v2 = await register(request, 'count-v2')
    promoteToNgoVolunteer(v1, ngoId)
    promoteToNgoVolunteer(v2, ngoId)

    await page.goto('/admin/ngos?tab=all')
    await search(page, name)
    await expect(rowFor(page, name)).toContainText('Active')
    await expect(rowFor(page, name)).toContainText('2 volunteers')

    await page.getByRole('link', { name: `View ${name}` }).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'NGOs' }).click()

    await expect(page).toHaveURL(/tab=all/)
    await expect(page).toHaveURL(/q=/)
    await expect(page.getByRole('searchbox', { name: 'Search organisations' })).toHaveValue(name)
  })
})

test.describe('NGO detail — real backend', () => {
  test('shows the real organisation, its applicant (linked to their account), and no decision buttons once decided', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(page, request, 'detail')
    const founder = await register(request, 'detail-founder')
    const name = unique('Detail Aid')
    const ngoId = promoteToNgoAdmin(founder, name, { email: 'ops@detail.example', phone: '+92 300 5551234' })

    await page.goto(`/admin/ngos/${ngoId}`)

    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    const card = page.getByRole('region', { name: 'Organisation' })
    await expect(card).toContainText(ngoId)
    await expect(card).toContainText('ops@detail.example')
    await expect(card).toContainText('+92 300 5551234')
    await expect(card).toContainText('Active')
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: /Volunteers/ })).toContainText('This organisation has no volunteers.')

    await page.getByRole('link', { name: founder }).first().click()
    await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: founder })).toBeVisible()
  })

  test('lists the real volunteer roster, each linking to their account', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'roster')
    const founder = await register(request, 'roster-founder')
    const ngoId = promoteToNgoAdmin(founder, unique('Roster Aid'))
    const vol = await register(request, 'roster-vol')
    promoteToNgoVolunteer(vol, ngoId)

    await page.goto(`/admin/ngos/${ngoId}`)

    const roster = page.getByRole('region', { name: /Volunteers/ })
    await expect(roster).toContainText('Volunteers · 1')
    await roster.getByRole('link', { name: vol }).click()
    await expect(page.getByRole('heading', { level: 1, name: vol })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Account details' })).toContainText('NGO volunteer')
  })

  test('a pending application can be approved from its own page, which then shows the decision', async ({ page, request }) => {
    const adminEmail = await signInAsAdmin(page, request, 'detail-approve')
    const citizen = await verifiedCitizen(request, 'detail-approve-citizen')
    const name = unique('Detail Approve')
    const ngoId = await submitNgo(request, citizen, name)

    await page.goto(`/admin/ngos/${ngoId}`)
    await expect(page.getByText('Pending approval').first()).toBeVisible()
    await page.getByRole('button', { name: 'Approve' }).click()
    await page.getByRole('button', { name: 'Approve organisation' }).click()

    await expect(page.getByText(`${name} was approved.`)).toBeVisible()
    const card = page.getByRole('region', { name: 'Organisation' })
    await expect(card.getByText('Approved', { exact: true })).toBeVisible()
    await expect(card).toContainText(`by ${adminEmail}`)
    await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0)
    expect(readNgo(ngoId).status).toBe('active')
  })

  test('says "not found" for an unknown and for a malformed id', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'notfound')

    await page.goto('/admin/ngos/00000000-0000-0000-0000-000000000001')
    await expect(page.getByRole('heading', { name: 'Organisation not found' })).toBeVisible()
    await page.goto('/admin/ngos/not-a-uuid')
    await expect(page.getByRole('heading', { name: 'Organisation not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to NGOs' })).toBeVisible()
  })
})

test.describe('Access — real backend', () => {
  test('an NGO admin is bounced from /admin/ngos, and the API itself refuses them (403)', async ({ page, request }) => {
    const email = await register(request, 'access')
    promoteToNgoAdmin(email, unique('Access Aid'))
    await logIn(page, email, /\/ngo\/dashboard$/)

    await page.goto('/admin/ngos')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)

    const login = await request.post(`${API}/auth/login`, { data: { email, password } })
    const { access_token: token } = await login.json()
    for (const path of ['/admin/ngos', '/admin/ngos/00000000-0000-0000-0000-000000000001']) {
      const res = await request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      expect(res.status()).toBe(403)
    }
  })
})

/** The organisation a given applicant submitted (each e2e applicant has exactly one). */
function readNgoByApplicant(applicantEmail: string) {
  const { ngoId } = readAccountRole(applicantEmail)
  // An approved applicant's `ngo_id` is their organisation; before approval it's empty, so this is
  // only used after a decision that set it.
  return { id: ngoId, ...readNgo(ngoId) }
}


test.describe('NGO regions — real backend', () => {
  /** A registered account made the admin of a new active `E2E …` NGO that covers the given regions. */
  async function coveringNgo(request: APIRequestContext, name: string, regions: string[]) {
    const email = await register(request, `regions-${Math.floor(Math.random() * 1e6)}`)
    const ngoId = promoteToNgoAdmin(email, name)
    for (const region of regions) seedNgoRegion(ngoId, region)
    return ngoId
  }

  test('the detail page lists the regions an organisation covers, each with its level, where it sits and a link to it', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'ngoregions')
    const tag = unique('Covers')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    const tehsil = seedRegion(`${tag} Tehsil`, 'tehsil', district)
    const ngoId = await coveringNgo(request, `${tag} NGO`, [province, tehsil])

    await page.goto(`/admin/ngos/${ngoId}`)
    const card = page.getByRole('heading', { name: /Operational regions/ }).locator('xpath=ancestor::section')
    await expect(card.getByRole('listitem')).toHaveCount(2)
    const tehsilRow = card.getByRole('listitem').filter({ hasText: `${tag} Tehsil` })
    await expect(tehsilRow).toContainText(`Tehsil · ${tag} Prov › ${tag} Dist › ${tag} Tehsil`)
    await expect(card.getByRole('listitem').filter({ hasText: `${tag} Prov` }).first()).toContainText('Assigned')

    // Each region links to its own Regions page — where this organisation is listed back.
    await tehsilRow.getByRole('link', { name: `${tag} Tehsil` }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/regions/${tehsil}$`))
    await expect(page.getByRole('heading', { name: `${tag} Tehsil`, level: 2 })).toBeVisible()
    await expect(page.getByRole('link', { name: `${tag} NGO` })).toBeVisible()
  })

  test('an organisation that covers nothing says so — including a pending application', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'ngonone')
    const tag = unique('Nothing')
    const ngoId = await coveringNgo(request, `${tag} NGO`, [])
    setNgoStatus(ngoId, 'pending_approval')

    await page.goto(`/admin/ngos/${ngoId}`)
    await expect(page.getByText("This organisation doesn't cover any region yet.")).toBeVisible()
  })

  test('the list shows how many regions each organisation covers, without a request per row', async ({ page, request }) => {
    await signInAsAdmin(page, request, 'ngocount')
    const tag = unique('Count')
    const a = seedRegion(`${tag} A`, 'province')
    const b = seedRegion(`${tag} B`, 'province')
    const c = seedRegion(`${tag} C`, 'province')
    await coveringNgo(request, `${tag} Three`, [a, b, c])
    await coveringNgo(request, `${tag} One`, [a])
    await coveringNgo(request, `${tag} None`, [])

    await page.goto('/admin/ngos')
    await page.getByRole('tab', { name: /^Active/ }).click()
    await search(page, tag)
    await expect(rowFor(page, `${tag} Three`)).toContainText('3 regions')
    await expect(rowFor(page, `${tag} One`)).toContainText('1 region')
    await expect(rowFor(page, `${tag} None`)).toContainText('0 regions')

    // …and the count is exactly the length of what the detail page lists.
    await rowFor(page, `${tag} Three`).getByRole('link', { name: `View ${tag} Three` }).click()
    await expect(page.getByRole('heading', { name: /Operational regions/ })).toContainText('3')
  })

  test('the regions route is admin-only: an NGO admin gets the real 403 and an unknown NGO a real 404', async ({ page, request }) => {
    const adminEmail = await signInAsAdmin(page, request, 'ngoregions403')
    const tag = unique('Guard')
    const ngoEmail = await register(request, 'guard-ngo')
    const ngoId = promoteToNgoAdmin(ngoEmail, `${tag} NGO`)

    const tokenFor = async (email: string) => (await (await request.post(`${API}/auth/login`, { data: { email, password } })).json()).access_token as string
    const asNgo = await request.get(`${API}/admin/ngos/${ngoId}/regions`, { headers: { Authorization: `Bearer ${await tokenFor(ngoEmail)}` } })
    expect(asNgo.status()).toBe(403)
    const unknown = await request.get(`${API}/admin/ngos/00000000-0000-0000-0000-000000000001/regions`, { headers: { Authorization: `Bearer ${await tokenFor(adminEmail)}` } })
    expect(unknown.status()).toBe(404)
  })
})
