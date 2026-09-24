import { test, expect, type Page } from '@playwright/test'
import { promoteToNgoAdmin, promoteToNgoVolunteer, readNgo } from './helpers/seed'

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
