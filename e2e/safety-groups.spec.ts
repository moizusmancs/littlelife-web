import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { API, password, register, signInCitizen, visit } from './helpers/citizen'
import { promoteToNgoAdmin, readAccountId, readSafetyConnectionsBetween, seedSafetyConnection, type StoredConnection } from './helpers/seed'

/**
 * Safety Groups against the real backend: every connection below is created, answered or removed
 * through the real `/safety-connections` routes (or seeded straight into Postgres where a test needs a
 * particular state), and the database is read back to check the screen told the truth. Two people are
 * two real browser contexts, each with its own login. People have real profile names, because the
 * screen shows people by name — but only as much of them as the backend lets the other side see.
 */
const AMNA = 'E2E Amna Khan'
const BILAL = 'E2E Bilal Rehman'
const short = (id: string) => id.slice(0, 8).toUpperCase()
const NOT_FOUND_EMAIL = "We couldn't find an active LittleLife member with that email."

/** A second, independently signed-in citizen in a browser context of their own. */
async function secondCitizen(browser: Browser, label: string, name: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = await signInCitizen(page, label, undefined, name)
  return { context, page, email, id: readAccountId(email), name }
}

async function openList(page: Page) {
  await visit(page, '/app/safety-groups')
  await expect(page.getByRole('heading', { level: 1, name: 'Safety Groups' })).toBeVisible()
}

/**
 * What the real API says the account can see — the truth the screen has to match. Always called with the test's own
 * `request` fixture, never a page's: logging in through `page.request` would put that account's session cookie into the
 * page's browser context and quietly turn the signed-in person into someone else.
 */
async function connectionsAsSeenBy(request: APIRequestContext, email: string) {
  const login = await request.post(`${API}/auth/login`, { data: { email, password } })
  const { access_token: token } = (await login.json()) as { access_token: string }
  const res = await request.get(`${API}/safety-connections`, { headers: { authorization: `Bearer ${token}` } })
  return (await res.json()) as Array<Record<string, string>>
}

const only = (rows: StoredConnection[]) => {
  expect(rows).toHaveLength(1)
  return rows[0]
}

test.describe('Safety Groups — real backend', () => {
  test('a new account sees an empty circle and how to be invited: its own email and its real Member ID', async ({ page }) => {
    const email = await signInCitizen(page, 'sg-empty')
    const id = readAccountId(email)
    await openList(page)

    await expect(page.getByText('Nobody in your circle yet')).toBeVisible()
    await expect(page.getByRole('region', { name: 'How people invite you' })).toContainText(email)
    await expect(page.getByTestId('own-member-id')).toHaveText(id)
    // It sits inside the profile sub-nav, with Safety Groups the active item.
    await expect(page.getByRole('link', { name: 'Safety Groups', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('copying the Member ID puts the real id on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const email = await signInCitizen(page, 'sg-copy')
    await openList(page)

    await page.getByRole('button', { name: 'Copy Member ID' }).click()

    await expect(page.getByRole('button', { name: 'Copy Member ID' })).toHaveText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(readAccountId(email))
  })

  test('inviting by email reaches the other person as a request from a named person, and accepting shows each the other by name', async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'sg-a', undefined, AMNA)
    const b = await secondCitizen(browser, 'sg-b', BILAL)
    try {
      // A types B's email in the wrong case and with padding.
      await openList(page)
      await page.getByRole('button', { name: 'Invite member' }).click()
      await page.getByLabel('Their email').fill(`  ${b.email.toUpperCase()}  `)
      await page.getByRole('button', { name: 'Send request' }).click()

      await expect(page.getByText(/^Request sent to .*\. You'll be connected once they accept it\.$/)).toBeVisible()
      const waiting = page.getByRole('region', { name: 'Waiting for a reply' })
      await expect(waiting).toContainText(b.email.toUpperCase()) // the server shows the requester nothing, so it's the email typed
      const stored = only(readSafetyConnectionsBetween(emailA, b.email))
      expect([stored.status, stored.type, stored.requesterEmail, stored.recipientEmail]).toEqual(['pending', 'family', emailA, b.email])

      // Still there after a reload — remembered on this device.
      await page.reload()
      await expect(page.getByRole('region', { name: 'Waiting for a reply' })).toContainText(b.email.toUpperCase())

      // B is told by the badge, sees WHO is asking (name and email), and accepts.
      await openList(b.page)
      await expect(b.page.getByRole('link', { name: /^Safety Groups\s*1$/ })).toBeVisible()
      const request = b.page.getByRole('region', { name: 'Requests for you' })
      await expect(request).toContainText(AMNA)
      await expect(request).toContainText(emailA)
      await request.getByRole('button', { name: `Accept request from ${AMNA}` }).click()

      await expect(b.page.getByText(`You're now connected to ${AMNA}.`)).toBeVisible()
      await expect(b.page.getByRole('region', { name: 'Connected' })).toContainText(AMNA)
      expect(only(readSafetyConnectionsBetween(emailA, b.email)).status).toBe('accepted')

      // Now A sees B by real name and email — replacing the email typed.
      await page.reload()
      const connected = page.getByRole('region', { name: 'Connected' })
      await expect(connected).toContainText(BILAL)
      await expect(connected).toContainText(b.email)
      await expect(page.getByRole('region', { name: 'Waiting for a reply' })).toHaveCount(0)
    } finally {
      await b.context.close()
    }
  })

  test('inviting by Member ID still works, from the link under the email field', async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'sg-id-a', undefined, AMNA)
    const b = await secondCitizen(browser, 'sg-id-b', BILAL)
    try {
      await openList(page)
      await page.getByRole('button', { name: 'Invite member' }).click()
      await page.getByRole('button', { name: 'Use a Member ID instead' }).click()
      await page.getByLabel('Their Member ID').fill(b.id.toUpperCase())
      await page.getByLabel('They are').selectOption('safety_group')
      await page.getByRole('button', { name: 'Send request' }).click()

      await expect(page.getByText(`Request sent to Member ${short(b.id)}.`)).toBeVisible()
      await expect(page.getByRole('region', { name: 'Waiting for a reply' })).toContainText(`Member ${short(b.id)}`)
      const stored = only(readSafetyConnectionsBetween(emailA, b.email))
      expect([stored.status, stored.type]).toEqual(['pending', 'safety_group'])
    } finally {
      await b.context.close()
    }
  })

  test('the requester is shown nothing about the recipient until they accept — not even after a decline — and can then tidy it away', async ({ page, browser, request }) => {
    const emailA = await signInCitizen(page, 'sg-dec-a', undefined, AMNA)
    const b = await secondCitizen(browser, 'sg-dec-b', BILAL)
    try {
      seedSafetyConnection(emailA, b.email, { type: 'safety_group' })

      // What the real API tells each side while it is pending.
      const toA = await connectionsAsSeenBy(request, emailA)
      expect([toA[0].requester_name, toA[0].recipient_name, toA[0].recipient_email]).toEqual([AMNA, '', ''])
      const toB = await connectionsAsSeenBy(request, b.email)
      expect([toB[0].requester_name, toB[0].requester_email, toB[0].recipient_name]).toEqual([AMNA, emailA, BILAL])

      await openList(b.page)
      await b.page.getByRole('button', { name: `Decline request from ${AMNA}` }).click()
      await expect(b.page.getByText(`You declined the request from ${AMNA}.`)).toBeVisible()
      await expect(b.page.getByRole('region', { name: 'Declined' })).toContainText('You declined')
      expect(only(readSafetyConnectionsBetween(emailA, b.email)).status).toBe('declined')

      // After the decline A still learns nothing: the row is the fallback, and the API agrees.
      await openList(page)
      const declined = page.getByRole('region', { name: 'Declined' })
      await expect(declined).toContainText(`Member ${short(b.id)}`)
      await expect(declined).toContainText('They declined')
      await expect(declined).not.toContainText(BILAL)
      await expect(declined).not.toContainText(b.email)
      const afterDecline = await connectionsAsSeenBy(request, emailA)
      expect([afterDecline[0].recipient_name, afterDecline[0].recipient_email]).toEqual(['', ''])

      await declined.getByRole('button', { name: /^Remove the declined request/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()

      await expect(page.getByText(/The request with Member .* was removed\./)).toBeVisible()
      expect(readSafetyConnectionsBetween(emailA, b.email)).toHaveLength(0)

      await b.page.reload()
      await expect(b.page.getByText('Nobody in your circle yet')).toBeVisible()
    } finally {
      await b.context.close()
    }
  })

  test('cancelling a request you sent asks first, then removes it for the other person too', async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'sg-cancel-a', undefined, AMNA)
    const b = await secondCitizen(browser, 'sg-cancel-b', BILAL)
    try {
      seedSafetyConnection(emailA, b.email)
      await openList(page)

      await page.getByRole('button', { name: /^Cancel your request to/ }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Keep request' }).click()
      await expect(dialog).toHaveCount(0)
      expect(readSafetyConnectionsBetween(emailA, b.email)).toHaveLength(1) // backing out changed nothing

      await page.getByRole('button', { name: /^Cancel your request to/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click()

      await expect(page.getByText(/Your request to Member .* was cancelled\./)).toBeVisible()
      await expect(page.getByText('Nobody in your circle yet')).toBeVisible()
      expect(readSafetyConnectionsBetween(emailA, b.email)).toHaveLength(0)

      await openList(b.page)
      await expect(b.page.getByText('Nobody in your circle yet')).toBeVisible()
    } finally {
      await b.context.close()
    }
  })

  test('the detail screen shows the connection by name, and removing a member ends it for both', async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'sg-detail-a', undefined, AMNA)
    const b = await secondCitizen(browser, 'sg-detail-b', BILAL)
    try {
      const connectionId = seedSafetyConnection(emailA, b.email, { status: 'accepted', type: 'safety_group' })
      await openList(page)

      await page.getByRole('link', { name: new RegExp(BILAL) }).click()
      await expect(page).toHaveURL(new RegExp(`/app/safety-groups/${connectionId}$`))
      await expect(page.getByRole('heading', { level: 1, name: BILAL })).toBeVisible()
      await expect(page.getByText(b.email, { exact: true })).toBeVisible()
      await expect(page.getByTestId('member-id')).toHaveText(b.id)
      const facts = page.getByRole('region', { name: 'Details' })
      await expect(facts).toContainText('RelationshipSafety group')
      await expect(facts).toContainText('Requested byYou')
      await expect(facts).toContainText('Accepted on')

      await page.getByRole('button', { name: 'Remove member' }).click()
      await expect(page.getByRole('dialog')).toContainText(`Remove ${BILAL}?`)
      await expect(page.getByRole('dialog')).toContainText('ends for both of you')
      await page.getByRole('dialog').getByRole('button', { name: 'Remove member' }).click()

      await expect(page).toHaveURL(/\/app\/safety-groups$/)
      await expect(page.getByText(`${BILAL} was removed from your safety groups.`)).toBeVisible()
      expect(readSafetyConnectionsBetween(emailA, b.email)).toHaveLength(0)

      // The other side loses it too: their deep link now leads nowhere.
      await visit(b.page, `/app/safety-groups/${connectionId}`)
      await expect(b.page.getByRole('heading', { name: "This connection isn't in your list" })).toBeVisible()
    } finally {
      await b.context.close()
    }
  })

  test("someone else's connection id is not in your list, and opening it leaves it alone", async ({ page, browser }) => {
    await signInCitizen(page, 'sg-third-a')
    const b = await secondCitizen(browser, 'sg-third-b', BILAL)
    const c = await secondCitizen(browser, 'sg-third-c', 'E2E Chandni Shah')
    try {
      const connectionId = seedSafetyConnection(b.email, c.email, { status: 'accepted' })

      await visit(page, `/app/safety-groups/${connectionId}`)

      await expect(page.getByRole('heading', { name: "This connection isn't in your list" })).toBeVisible()
      await page.getByRole('link', { name: 'Back to Safety Groups' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Safety Groups' })).toBeVisible()
      expect(only(readSafetyConnectionsBetween(b.email, c.email)).status).toBe('accepted')
    } finally {
      await b.context.close()
      await c.context.close()
    }
  })

  test('an invitation that cannot work says why in the dialog, and creates nothing', async ({ page }) => {
    const email = await signInCitizen(page, 'sg-errors')
    const ownId = readAccountId(email)
    await openList(page)
    await page.getByRole('button', { name: 'Invite member' }).click()
    const send = () => page.getByRole('button', { name: 'Send request' }).click()

    // Not an email — caught before any request.
    await page.getByLabel('Their email').fill('hina@')
    await send()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()

    // Your own email (any case) — the server's own refusal.
    await page.getByLabel('Their email').fill(email.toUpperCase())
    await send()
    await expect(page.getByRole('alert')).toContainText('cannot send a safety connection request to yourself')

    // Well-formed but nobody's.
    await page.getByLabel('Their email').fill(`e2e-nobody-${Date.now()}@example.com`)
    await send()
    await expect(page.getByRole('alert')).toContainText(NOT_FOUND_EMAIL)
    await expect(page.getByRole('dialog')).toBeVisible()

    // The Member ID way: not a UUID, your own, and nobody's.
    await page.getByRole('button', { name: 'Use a Member ID instead' }).click()
    await page.getByLabel('Their Member ID').fill('hina@example.com')
    await send()
    await expect(page.getByText(/doesn't look like a Member ID/)).toBeVisible()
    await page.getByLabel('Their Member ID').fill(ownId)
    await send()
    await expect(page.getByRole('alert')).toContainText('cannot send a safety connection request to yourself')
    await page.getByLabel('Their Member ID').fill('00000000-0000-4000-8000-000000000000')
    await send()
    await expect(page.getByRole('alert')).toContainText("We couldn't find an active LittleLife member with that Member ID.")

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Nobody in your circle yet')).toBeVisible()
  })

  test('only an active citizen can be invited: an unverified account and an NGO admin get the same answer as no account at all', async ({ page, request }) => {
    await signInCitizen(page, 'sg-elig-a')
    const unverified = await register(request, 'sg-elig-unverified') // registered, never verified
    const ngoAdmin = await register(request, 'sg-elig-ngo')
    promoteToNgoAdmin(ngoAdmin, `E2E Eligibility Trust ${Date.now()}`)
    await openList(page)

    for (const email of [unverified, ngoAdmin]) {
      await page.getByRole('button', { name: 'Invite member' }).click()
      await page.getByLabel('Their email').fill(email)
      await page.getByRole('button', { name: 'Send request' }).click()
      await expect(page.getByRole('alert')).toContainText(NOT_FOUND_EMAIL)
      await page.getByRole('button', { name: 'Cancel' }).click()
    }
    await expect(page.getByText('Nobody in your circle yet')).toBeVisible()
  })

  test('the backend refuses a request to someone already connected, already invited, or who has invited you — one live connection per pair', async ({ page, browser }) => {
    const emailA = await signInCitizen(page, 'sg-dup-a', undefined, AMNA)
    const b = await secondCitizen(browser, 'sg-dup-b', BILAL)
    const c = await secondCitizen(browser, 'sg-dup-c', 'E2E Chandni Shah')
    const d = await secondCitizen(browser, 'sg-dup-d', 'E2E Dawood Ali')
    try {
      seedSafetyConnection(emailA, b.email, { status: 'accepted' })
      seedSafetyConnection(emailA, c.email)
      seedSafetyConnection(d.email, emailA)
      await openList(page)

      for (const [person, message] of [
        [b, 'you are already connected to this person'],
        [c, 'a pending connection request already exists between these two accounts'],
        [d, 'this person has already sent you a request'],
      ] as const) {
        await page.getByRole('button', { name: 'Invite member' }).click()
        await page.getByLabel('Their email').fill(person.email)
        await page.getByRole('button', { name: 'Send request' }).click()
        await expect(page.getByRole('alert')).toContainText(message)
        await page.getByRole('button', { name: 'Cancel' }).click()
      }

      // Still exactly one connection with each of them.
      expect(readSafetyConnectionsBetween(emailA, b.email)).toHaveLength(1)
      expect(readSafetyConnectionsBetween(emailA, c.email)).toHaveLength(1)
      expect(readSafetyConnectionsBetween(emailA, d.email)).toHaveLength(1)
    } finally {
      await Promise.all([b, c, d].map((person) => person.context.close()))
    }
  })

  test('a phone shows every section without sideways scrolling, and the actions stay reachable', async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const emailA = await signInCitizen(page, 'sg-phone-a', undefined, AMNA)
    const others = await Promise.all(
      ['b', 'c', 'd', 'e'].map((label, i) => secondCitizen(browser, `sg-phone-${label}`, ['E2E Bilal Rehman', 'E2E Chandni Shah', 'E2E Dawood Ali', 'E2E Eman Zafar'][i])),
    )
    try {
      const [b, c, d, e] = others
      seedSafetyConnection(d.email, emailA) // waiting on A
      seedSafetyConnection(emailA, b.email, { status: 'accepted' })
      seedSafetyConnection(emailA, c.email) // waiting on C
      seedSafetyConnection(emailA, e.email, { status: 'declined' })
      await openList(page)

      for (const section of ['Requests for you', 'Connected', 'Waiting for a reply', 'Declined']) {
        await expect(page.getByRole('region', { name: section })).toBeVisible()
      }
      // The profile sub-nav is collapsed to one button on a phone, so the first request is on the first screen.
      await expect(page.getByRole('button', { name: /^Accept request/ })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      await page.getByRole('link', { name: new RegExp(b.name) }).click()
      await expect(page.getByRole('button', { name: 'Remove member' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await Promise.all(others.map((person) => person.context.close()))
    }
  })
})

