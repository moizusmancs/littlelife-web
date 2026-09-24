import { test, expect, type Page } from '@playwright/test'
import { promoteToNgoAdmin, promoteToNgoVolunteer, readNgo, readNgoRegionIds, readRegionByName, seedNgoRegion, seedRegion } from './helpers/seed'

/**
 * Real end to end, no spoofing and no stubbed responses: a registered account is turned into the
 * `ngo_admin` of a seeded active `E2E …` NGO in Postgres — exactly the state a real admin approval
 * leaves behind (see helpers/seed.ts) — and then logs in through the real UI. Every `/ngo/me` call
 * is the genuine backend, and saves/deactivation are confirmed by reading the row back from the
 * database, not just by what the page says.
 */
const password = 'SuperSecret123!'

async function register(page: Page, tag: string) {
  const email = `e2e-org-${tag}-${Date.now()}@example.com`
  const res = await page.request.post('http://localhost:8080/api/v1/auth/register', { data: { email, password } })
  expect(res.ok()).toBeTruthy()
  return email
}

async function logIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/ngo\/dashboard$/)
}

async function signInAsNgoAdmin(page: Page, tag: string, contact?: { email?: string; phone?: string }) {
  const email = await register(page, tag)
  const ngoName = `E2E Org ${tag} ${Date.now()}`
  const ngoId = promoteToNgoAdmin(email, ngoName, contact)
  await logIn(page, email)
  return { email, ngoId, ngoName }
}

test.describe('Organization Settings — real backend, real NGO admin', () => {
  test('loads the real organisation and pre-fills the form', async ({ page }) => {
    const { ngoName } = await signInAsNgoAdmin(page, 'load', { email: 'seeded@ngo.example', phone: '+92 21 111 000 990' })
    await page.goto('/ngo/settings/organization')

    await expect(page.getByRole('heading', { name: 'Organization Settings' })).toBeVisible()
    await expect(page.getByLabel('Organisation name')).toHaveValue(ngoName)
    await expect(page.getByLabel('Contact email')).toHaveValue('seeded@ngo.example')
    await expect(page.getByLabel('Contact phone')).toHaveValue('+92 21 111 000 990')
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  test('reaches the screen from the sidebar link, which an ngo_admin can see', async ({ page }) => {
    await signInAsNgoAdmin(page, 'nav')
    await page.getByRole('link', { name: 'Organization Settings' }).click()

    await expect(page).toHaveURL(/\/ngo\/settings\/organization$/)
    await expect(page.getByRole('heading', { name: 'Organization Settings' })).toBeVisible()
  })

  test('saving edits the real row, shows Saved, and survives a hard reload', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'save')
    await page.goto('/ngo/settings/organization')

    const newName = `E2E Renamed ${Date.now()}`
    await page.getByLabel('Organisation name').fill(newName)
    await page.getByLabel('Contact phone').fill('+92 300 0000000')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Saved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(readNgo(ngoId)).toMatchObject({ name: newName, contactPhone: '+92 300 0000000' })

    await page.reload()
    await expect(page.getByLabel('Organisation name')).toHaveValue(newName)
    await expect(page.getByLabel('Contact phone')).toHaveValue('+92 300 0000000')
  })

  test('a save sends only what changed — clearing the email leaves the name and phone untouched', async ({ page }) => {
    const { ngoId, ngoName } = await signInAsNgoAdmin(page, 'partial', {
      email: 'seeded@ngo.example',
      phone: '+92 21 111 000 990',
    })
    await page.goto('/ngo/settings/organization')

    await page.getByLabel('Contact email').fill('')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    expect(readNgo(ngoId)).toMatchObject({ name: ngoName, contactEmail: '', contactPhone: '+92 21 111 000 990' })
  })

  test('shows the server-normalised value after saving (the backend lower-cases the email)', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'normalise')
    await page.goto('/ngo/settings/organization')

    await page.getByLabel('Contact email').fill('Contact@NGO.Example')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Saved')).toBeVisible()
    await expect(page.getByLabel('Contact email')).toHaveValue('contact@ngo.example')
    expect(readNgo(ngoId).contactEmail).toBe('contact@ngo.example')
  })

  test('rejects a blank name and a malformed email without calling the network', async ({ page }) => {
    let patchCalled = false
    await page.route('**/api/v1/ngo/me', async (route) => {
      if (route.request().method() === 'PATCH') patchCalled = true
      await route.continue()
    })
    await signInAsNgoAdmin(page, 'validate')
    await page.goto('/ngo/settings/organization')

    await page.getByLabel('Organisation name').fill('')
    await page.getByLabel('Contact email').fill('not-an-email')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Organisation name is required')).toBeVisible()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    expect(patchCalled).toBe(false)
  })

  test('Discard puts the saved values back', async ({ page }) => {
    const { ngoName } = await signInAsNgoAdmin(page, 'discard')
    await page.goto('/ngo/settings/organization')

    await page.getByLabel('Organisation name').fill('Something else entirely')
    await page.getByRole('button', { name: 'Discard' }).click()

    await expect(page.getByLabel('Organisation name')).toHaveValue(ngoName)
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  test('deactivating for real needs confirmation, updates the database, and does not sign anyone out', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'deactivate')
    await page.goto('/ngo/settings/organization')

    await page.getByRole('button', { name: 'Deactivate…' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(readNgo(ngoId).status).toBe('active') // cancelling did nothing

    await page.getByRole('button', { name: 'Deactivate…' }).click()
    await page.getByRole('button', { name: 'Deactivate organisation' }).click()

    await expect(page.getByText('Deactivated', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'This organisation is no longer active' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Deactivate…' })).not.toBeVisible()
    expect(readNgo(ngoId).status).toBe('deactivated')

    // No cascade onto staff: still signed in, still on the page, and it survives a hard reload.
    await expect(page).toHaveURL(/\/ngo\/settings\/organization$/)
    await page.reload()
    await expect(page.getByText('Deactivated', { exact: true })).toBeVisible()
  })

  test('an ngo_volunteer of the same NGO cannot see the link or reach the page', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'gate-admin')
    await page.context().clearCookies()

    const volunteer = await register(page, 'gate-volunteer')
    promoteToNgoVolunteer(volunteer, ngoId)
    await logIn(page, volunteer)

    await expect(page.getByRole('link', { name: 'Organization Settings' })).toHaveCount(0)

    await page.goto('/ngo/settings/organization')
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Organization Settings' })).not.toBeVisible()
  })
})

test.describe('Organization Settings — operational regions, real backend', () => {
  const unique = (label: string) => `E2E ${label} ${Date.now()}${Math.floor(Math.random() * 1000)}`
  const card = (page: Page) => page.getByRole('heading', { name: 'Operational regions' }).locator('xpath=ancestor::section')
  const dialog = (page: Page) => page.getByRole('dialog')

  test('adds a district by drilling down from its province, stores it against the organisation, and keeps it after a reload', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'regadd')
    const tag = unique('Cover')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    seedRegion(`${tag} Tehsil`, 'tehsil', district)

    await page.goto('/ngo/settings/organization')
    await expect(card(page).getByText(/No regions yet/)).toBeVisible()

    await page.getByRole('button', { name: 'Add region' }).click()
    await expect(dialog(page).getByRole('button', { name: 'Add region' })).toBeDisabled()
    await dialog(page).getByRole('button', { name: `Show the 1 sub-region of ${tag} Prov` }).click()
    const trail = dialog(page).getByRole('navigation', { name: 'Where you are' })
    await expect(trail.getByText(`${tag} Prov`)).toHaveAttribute('aria-current', 'page')
    await expect(dialog(page).getByRole('button', { name: `Show the 1 sub-region of ${tag} Dist` })).toBeVisible()
    await dialog(page).getByRole('radio', { name: new RegExp(`${tag} Dist`) }).check()
    await dialog(page).getByRole('button', { name: 'Add region' }).click()

    await expect(page.getByText(`${tag} Dist was added to your regions.`)).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
    await expect(card(page).getByRole('listitem')).toHaveText([`${tag} DistDistrict`])
    expect(readNgoRegionIds(ngoId)).toEqual([district])

    await page.reload()
    await expect(card(page).getByRole('listitem')).toHaveText([`${tag} DistDistrict`])
  })

  test('finds a tehsil by name and adds it — coverage can be any level, and another organisation’s is untouched', async ({ page }) => {
    // A second organisation exists too (it never logs in); adding here must not touch it.
    const otherEmail = await register(page, 'regother')
    const otherNgo = promoteToNgoAdmin(otherEmail, `E2E Org regother ${Date.now()}`)
    const { ngoId } = await signInAsNgoAdmin(page, 'regsearch')
    const tag = unique('Find')
    const province = seedRegion(`${tag} Prov`, 'province')
    const district = seedRegion(`${tag} Dist`, 'district', province)
    const tehsil = seedRegion(`${tag} Tehsil`, 'tehsil', district)
    seedNgoRegion(otherNgo, province)

    await page.goto('/ngo/settings/organization')
    await page.getByRole('button', { name: 'Add region' }).click()
    await dialog(page).getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    const results = dialog(page).getByRole('list', { name: 'Matching regions' })
    await expect(results.getByRole('radio')).toHaveCount(3)
    await expect(results.getByRole('listitem').filter({ hasText: `${tag} Tehsil` })).toContainText(`${tag} Prov › ${tag} Dist`)
    // The province is covered by the *other* organisation, which doesn't make it unavailable here.
    await expect(results.getByRole('radio', { name: `${tag} Prov Province`, exact: true })).toBeEnabled()
    await results.getByRole('radio', { name: new RegExp(`${tag} Tehsil`) }).check()
    await dialog(page).getByRole('button', { name: 'Add region' }).click()

    await expect(page.getByText(`${tag} Tehsil was added to your regions.`)).toBeVisible()
    expect(readNgoRegionIds(ngoId)).toEqual([tehsil])
    expect(readNgoRegionIds(otherNgo)).toEqual([province])
  })

  test('a region that is already covered is listed but cannot be picked again', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'regdupe')
    const tag = unique('Dupe')
    const province = seedRegion(`${tag} Prov`, 'province')
    const other = seedRegion(`${tag} Other`, 'province')
    seedNgoRegion(ngoId, province)

    await page.goto('/ngo/settings/organization')
    await expect(card(page).getByRole('listitem')).toHaveText([`${tag} ProvProvince`])
    await page.getByRole('button', { name: 'Add region' }).click()
    await dialog(page).getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    const covered = dialog(page).getByRole('radio', { name: new RegExp(`${tag} Prov`) })
    await expect(covered).toBeDisabled()
    await expect(covered.locator('xpath=ancestor::label')).toContainText('Already added')
    await expect(dialog(page).getByRole('radio', { name: new RegExp(`${tag} Other`) })).toBeEnabled()
    expect(readNgoRegionIds(ngoId)).toEqual([province])
    expect(other).toBeTruthy()
  })

  test('if a teammate added the same region first, the real 409 is shown and the chip appears', async ({ page, request }) => {
    const { email, ngoId } = await signInAsNgoAdmin(page, 'reg409')
    const tag = unique('Race')
    const region = seedRegion(`${tag} Prov`, 'province')

    await page.goto('/ngo/settings/organization')
    await page.getByRole('button', { name: 'Add region' }).click()
    await dialog(page).getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    await dialog(page).getByRole('radio', { name: new RegExp(`${tag} Prov`) }).check()

    // Behind the page's back, the same organisation adds it through the API.
    const login = await request.post('http://localhost:8080/api/v1/auth/login', { data: { email, password } })
    const { access_token: token } = await login.json()
    const behind = await request.post('http://localhost:8080/api/v1/ngo/me/regions', { headers: { Authorization: `Bearer ${token}` }, data: { region_id: region } })
    expect(behind.status()).toBe(201)

    await dialog(page).getByRole('button', { name: 'Add region' }).click()
    await expect(dialog(page).getByRole('alert')).toHaveText('region already assigned to this ngo')
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(card(page).getByRole('listitem')).toHaveText([`${tag} ProvProvince`])
    expect(readNgoRegionIds(ngoId)).toEqual([region])
  })

  test('removing asks first, then takes the region out of the coverage without touching the region itself', async ({ page }) => {
    const { ngoId } = await signInAsNgoAdmin(page, 'regremove')
    const tag = unique('Drop')
    const keep = seedRegion(`${tag} Keep`, 'province')
    const drop = seedRegion(`${tag} Drop`, 'province')
    seedNgoRegion(ngoId, keep)
    seedNgoRegion(ngoId, drop)

    await page.goto('/ngo/settings/organization')
    await expect(card(page).getByRole('listitem')).toHaveCount(2)

    await page.getByRole('button', { name: `Remove ${tag} Drop` }).click()
    await expect(dialog(page).getByRole('heading', { name: `Remove ${tag} Drop?` })).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(card(page).getByRole('listitem')).toHaveCount(2)
    expect(readNgoRegionIds(ngoId).sort()).toEqual([keep, drop].sort())

    await page.getByRole('button', { name: `Remove ${tag} Drop` }).click()
    await dialog(page).getByRole('button', { name: 'Remove region' }).click()
    await expect(page.getByText(`${tag} Drop was removed from your regions.`)).toBeVisible()
    await expect(card(page).getByRole('listitem')).toHaveText([`${tag} KeepProvince`])
    expect(readNgoRegionIds(ngoId)).toEqual([keep])
    expect(readRegionByName(`${tag} Drop`)).not.toBeNull()

    await page.reload()
    await expect(card(page).getByRole('listitem')).toHaveText([`${tag} KeepProvince`])
  })

  test('on a phone the picker fits the screen and the chips wrap without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { ngoId } = await signInAsNgoAdmin(page, 'regphone')
    const tag = unique('Phone Coverage With A Longish Name')
    const province = seedRegion(`${tag} Prov`, 'province')
    seedNgoRegion(ngoId, province)
    seedNgoRegion(ngoId, seedRegion(`${tag} Second Province`, 'province'))

    await page.goto('/ngo/settings/organization')
    await expect(card(page).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('button', { name: 'Add region' }).click()
    await dialog(page).getByRole('searchbox', { name: 'Search regions' }).fill(tag)
    const box = await dialog(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBe(0)
  })
})
