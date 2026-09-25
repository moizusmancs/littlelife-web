import { test, expect, type Page } from '@playwright/test'
import { promoteToNgoAdmin, promoteToNgoVolunteer, promoteToPlatformAdmin, seedPendingInvitation, verifyAndOnboardAccount } from './helpers/seed'
import { logIn, randomWorld, register, visit } from './helpers/citizen'

/**
 * The earlier NGO and Admin lists at 768 and 1024 (plan item 28's last part): their tables switch layout at `md` (768), but the console's sidebar leaves a 1024px window only about
 * 735px, so a table can be squeezed at widths it was never drawn for (the lesson of the NGO shelters table). For each list: the page has no sideways scroll, nothing is clipped
 * or stuck out past its box, and a screenshot is kept to look at. Real data — read-only; the only rows written are an `E2E …` organisation and its volunteers.
 */
const { tag } = randomWorld()
const SHOTS = '/private/tmp/claude-501/-Users-moizusman-code-littlelife-web/78a3b6ba-1023-4d2b-bfd3-697fc394113a/scratchpad'

test.describe.configure({ timeout: 120_000 })

/** Elements whose content is cut off (overflow hidden/clip with more inside than fits) or that stick out of the window, within the page's main area. */
async function overflows(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    const main = document.querySelector('main') ?? document.body
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const clips = style.overflowX === 'hidden' || style.overflowX === 'clip'
      // A truncated single-line name (`truncate`) is deliberate; a clipped *control* or icon is not.
      const deliberate = style.textOverflow === 'ellipsis'
      if (clips && !deliberate && el.scrollWidth > el.clientWidth + 1 && el.matches('button, a, input, select, [role=button], li, tr, [role=row]')) out.push(`clipped ${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 50)} (${el.scrollWidth} > ${el.clientWidth})`)
      // Something inside a strip that scrolls sideways on purpose (the tab bars) is not "stuck out".
      let scrolls = false
      for (let up: HTMLElement | null = el.parentElement; up && up !== document.body; up = up.parentElement) {
        const overflowX = getComputedStyle(up).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll') scrolls = true
      }
      if (!scrolls && rect.right > window.innerWidth + 1 && el.matches('button, a, input, select, li, tr, td, th')) out.push(`outside ${el.tagName.toLowerCase()} right=${Math.round(rect.right)} > ${window.innerWidth}`)
    }
    return out.slice(0, 8)
  })
}

async function check(page: Page, path: string, label: string, ready: () => Promise<void>) {
  await visit(page, path)
  await ready()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/tablet-${label}.png`, fullPage: false })
  const problems = await overflows(page)
  if (problems.length > 0) console.log(`OVERFLOW ${label}: ${problems.join(' | ')}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways page scroll`).toBe(true)
  expect.soft(problems, `${label}: nothing clipped or sticking out`).toEqual([])
}

for (const [name, viewport] of [
  ['768', { width: 768, height: 1024 }],
  ['1024', { width: 1024, height: 768 }],
] as const) {
  test.describe(`Earlier lists at ${name}`, () => {
    test.use({ viewport })

    test('the admin lists: users, organisations, regions and hazard zones', async ({ page, request }) => {
      const email = await register(request, `tablet-admin-${name}`)
      verifyAndOnboardAccount(email, 'E2E Tablet Admin')
      promoteToPlatformAdmin(email)
      await logIn(page, email, /\/admin\/dashboard$/)
      await check(page, '/admin/users', `${name}-admin-users`, async () => {
        await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible({ timeout: 25_000 })
      })
      await check(page, '/admin/ngos', `${name}-admin-ngos`, async () => {
        await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible({ timeout: 25_000 })
      })
      await check(page, '/admin/regions', `${name}-admin-regions`, async () => {
        await expect(page.getByRole('main').getByText(/Sindh/).first()).toBeVisible({ timeout: 25_000 })
      })
      // With a region open: the tree and its detail (Sindh has sub-regions and a boundary).
      await check(page, '/admin/regions', `${name}-admin-region-detail`, async () => {
        await page.getByRole('main').getByRole('link', { name: /^Sindh/ }).first().click()
        await expect(page).toHaveURL(/\/admin\/regions\/.+/)
        await expect(page.getByRole('main').getByRole('heading', { name: 'Sindh' }).first()).toBeVisible({ timeout: 25_000 })
      })
      await check(page, '/admin/hazard-zones', `${name}-admin-hazards`, async () => {
        await expect(page.getByRole('main').getByRole('list', { name: 'Hazard zones' })).toBeVisible({ timeout: 25_000 })
      })
      await check(page, '/admin/facilities', `${name}-admin-facilities`, async () => {
        await expect(page.getByRole('tab', { name: 'Shelters' })).toBeVisible({ timeout: 25_000 })
      })
    })

    test('the organisation\'s lists: volunteers (with a volunteer and an invitation), shelters and organisation settings', async ({ page, request }) => {
      const founder = await register(request, `tablet-ngo-${name}`)
      const ngoId = promoteToNgoAdmin(founder, `E2E Tablet NGO ${name} ${tag}`)
      seedPendingInvitation(await register(request, `tablet-invitee-${name}`), `E2E Tablet Other NGO ${name} ${tag}`)
      promoteToNgoVolunteer(await register(request, `tablet-volunteer-${name}`), ngoId)
      await logIn(page, founder, /\/ngo\/dashboard$/)
      await check(page, '/ngo/volunteers', `${name}-ngo-volunteers`, async () => {
        await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible({ timeout: 25_000 })
      })
      await check(page, '/ngo/shelters', `${name}-ngo-shelters`, async () => {
        await expect(page.getByRole('heading', { level: 1, name: 'Shelters' })).toBeVisible({ timeout: 25_000 })
      })
      await check(page, '/ngo/settings/organization', `${name}-ngo-settings`, async () => {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 25_000 })
      })
    })
  })
}
