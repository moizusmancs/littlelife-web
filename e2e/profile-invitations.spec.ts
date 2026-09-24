import { test, expect, type Page } from '@playwright/test'
import {
  readAccountRole,
  seedPendingInvitation,
  setInvitationStatus,
  verifyAndOnboardAccount,
} from './helpers/seed'

/**
 * Unlike the earlier onboarding-gated specs (which spoof the client-side store via
 * `window.__authStore`), everything here is genuine: a real registration, then the account is
 * marked verified + onboarded in the database (see helpers/seed.ts) *before* logging in, so the
 * login is a real, fully verified session — no client-side override, no stubbed responses. Every
 * invitation call below (list, accept, decline) hits the real backend against a real seeded row,
 * and accepting really promotes the account.
 */
const password = 'SuperSecret123!'

async function signInAsOnboardedCitizen(page: Page, tag: string) {
  const email = `e2e-inv-${tag}-${Date.now()}@example.com`
  const registerRes = await page.request.post('http://localhost:8080/api/v1/auth/register', {
    data: { email, password },
  })
  expect(registerRes.ok()).toBeTruthy()
  verifyAndOnboardAccount(email, 'E2E Volunteer')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
  return email
}

test.describe('Invitations — real backend, real seeded data', () => {
  test('with no invitations, shows the empty state and no badge on the sidebar', async ({ page }) => {
    await signInAsOnboardedCitizen(page, 'empty')
    await page.goto('/app/profile/invitations')

    await expect(page.getByRole('heading', { name: 'Volunteer invitations' })).toBeVisible()
    await expect(page.getByText('No pending invitations')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Invitations', exact: true })).toBeVisible()
  })

  test('lists a real pending invitation, and the sidebar badge shows the real count on other profile screens too', async ({
    page,
  }) => {
    const email = await signInAsOnboardedCitizen(page, 'list')
    const ngoName = `E2E Sindh Relief ${Date.now()}`
    seedPendingInvitation(email, ngoName)

    // The badge lives in the shared ProfileLayout, so it's there before ever opening Invitations.
    await page.goto('/app/profile/edit')
    await expect(page.getByRole('link', { name: /^Invitations\s*1$/ })).toBeVisible()

    await page.getByRole('link', { name: /^Invitations\s*1$/ }).click()
    await expect(page.getByText(ngoName)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pending · 1' })).toBeVisible()
    await expect(page.getByText(/One account holds one role at a time/)).toBeVisible()
  })

  test('declining for real removes the card and the badge, and keeps the user signed in as a citizen', async ({
    page,
  }) => {
    const email = await signInAsOnboardedCitizen(page, 'decline')
    const ngoName = `E2E Decline Trust ${Date.now()}`
    seedPendingInvitation(email, ngoName)
    await page.goto('/app/profile/invitations')

    await page.getByRole('button', { name: `Decline invitation from ${ngoName}` }).click()

    await expect(page.getByText('No pending invitations')).toBeVisible()
    await expect(page.getByText(ngoName)).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Invitations', exact: true })).toBeVisible() // badge gone
    await expect(page).toHaveURL(/\/app\/profile\/invitations$/)
    expect(readAccountRole(email).role).toBe('user')
  })

  test('accepting for real promotes the account, signs out with a message, and logging in again lands in the NGO console', async ({
    page,
  }) => {
    const email = await signInAsOnboardedCitizen(page, 'accept')
    const ngoName = `E2E Accept Foundation ${Date.now()}`
    seedPendingInvitation(email, ngoName)
    await page.goto('/app/profile/invitations')

    await page.getByRole('button', { name: `Accept invitation from ${ngoName}` }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(`You're now a volunteer with ${ngoName}.`)).toBeVisible()

    // The promotion is real, server-side — not just a UI state.
    const promoted = readAccountRole(email)
    expect(promoted.role).toBe('ngo_volunteer')
    expect(promoted.ngoId).not.toBe('')

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL(/\/ngo\/dashboard$/)
  })

  test('if the invitation changed since the page loaded, shows the real 409 and drops the stale card', async ({
    page,
  }) => {
    const email = await signInAsOnboardedCitizen(page, 'stale')
    const ngoName = `E2E Stale Relief ${Date.now()}`
    const { invitationId } = seedPendingInvitation(email, ngoName)
    await page.goto('/app/profile/invitations')
    await expect(page.getByText(ngoName)).toBeVisible()

    setInvitationStatus(invitationId, 'declined') // e.g. acted on from another tab
    await page.getByRole('button', { name: `Accept invitation from ${ngoName}` }).click()

    await expect(page.getByRole('alert')).toHaveText('invitation is not pending')
    await expect(page.getByText('No pending invitations')).toBeVisible()
    await expect(page).toHaveURL(/\/app\/profile\/invitations$/)
    expect(readAccountRole(email).role).toBe('user')
  })
})
