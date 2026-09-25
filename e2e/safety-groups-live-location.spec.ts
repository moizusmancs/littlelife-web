import { test, expect, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test'
import { API, password, signInCitizen, visit } from './helpers/citizen'
import { readAccountId, seedSafetyConnection } from './helpers/seed'

/**
 * Live location against the real backend and its real WebSocket, with two (or four) real browser contexts — one per person. A person "shares" by
 * turning on the switch; the browser's position is Playwright's emulated geolocation, which can be moved, and each move is a real fix that goes to
 * the real relay. What a viewer sees is what the relay delivers. Nothing is stubbed.
 */
const HOME = { latitude: 24.86, longitude: 67.05 }

async function person(browser: Browser, label: string, name: string, geolocation = true) {
  const context = await browser.newContext(geolocation ? { permissions: ['geolocation'], geolocation: HOME } : {})
  const page = await context.newPage()
  const email = await signInCitizen(page, label, undefined, name)
  return { context, page, email, id: readAccountId(email), name }
}
const shareSwitch = (page: Page) => page.getByRole('switch', { name: 'Share my live location' })
const memberMap = (page: Page, name: string) => page.getByRole('group', { name: `Map showing where ${name} is` })

/** A raw WebSocket to the relay from inside a page (the app itself is not involved), collecting what it is sent. */
async function listenRaw(page: Page, token: string) {
  await page.evaluate(async ([t, api]) => {
    const w = new WebSocket(`${api.replace(/^http/, 'ws')}/ws/safety-connections/location?token=${t}`)
    ;(window as unknown as { __frames: string[] }).__frames = []
    w.onmessage = (m) => (window as unknown as { __frames: string[] }).__frames.push(String(m.data))
    await new Promise((resolve, reject) => {
      w.onopen = () => resolve(true)
      w.onerror = () => reject(new Error('raw socket failed to open'))
    })
  }, [token, API])
}
const framesOf = (page: Page) => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames.map((f) => JSON.parse(f) as { account_id: string; lat: number; lng: number }))

async function tokenFor(page: Page, email: string) {
  const login = await page.request.post(`${API}/auth/login`, { data: { email, password } })
  return ((await login.json()) as { access_token: string }).access_token
}

async function startSharing(page: Page) {
  await visit(page, '/app/safety-groups')
  await shareSwitch(page).click()
  await expect(page.getByText('Sharing your live location.')).toBeVisible({ timeout: 15_000 })
}

const hideTab = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
const showTab = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

async function closeAll(...people: Array<{ context: BrowserContext }>) {
  await Promise.all(people.map((p) => p.context.close()))
}

test.describe('Safety Groups › live location — real backend, real WebSocket', () => {
  // Several browser contexts, real sign-ins and real waits: well over the default 30 s when the suite runs in parallel.
  test.describe.configure({ timeout: 120_000 })

  test('a member who shares appears live on the other person\'s page, follows them as they move, and the list marks them Live', async ({ browser }) => {
    const a = await person(browser, 'll-a', 'E2E Amna Khan')
    const b = await person(browser, 'll-b', 'E2E Bilal Rehman')
    try {
      const connectionId = seedSafetyConnection(a.email, b.email, { status: 'accepted' })

      // B is looking at A's page, and nothing is shared yet.
      await visit(b.page, `/app/safety-groups/${connectionId}`)
      await expect(b.page.getByText(`${a.name} isn't sharing right now`)).toBeVisible()
      await expect(b.page.locator('.leaflet-marker-icon')).toHaveCount(0)

      // A turns sharing on…
      await startSharing(a.page)

      // …and B sees A, live, where A's browser says A is.
      await expect(b.page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(b.page.getByText('24.8600, 67.0500')).toBeVisible()
      await expect(memberMap(b.page, a.name).locator('.leaflet-marker-icon')).toHaveCount(1)

      // A moves; B follows.
      await new Promise((resolve) => setTimeout(resolve, 2100)) // past the send throttle, so it goes at once
      await a.context.setGeolocation({ latitude: 24.9, longitude: 67.1 })
      await expect(b.page.getByText('24.9000, 67.1000')).toBeVisible({ timeout: 15_000 })

      // B's list marks A as Live too.
      await visit(b.page, '/app/safety-groups')
      await expect(b.page.getByRole('region', { name: 'Connected' }).getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 })
    } finally {
      await closeAll(a, b)
    }
  })

  test("a declined or pending connection never receives the location — the relay only delivers to accepted ones (raw sockets, no app involved)", async ({ browser }) => {
    const a = await person(browser, 'll-x-a', 'E2E Amna Khan')
    const accepted = await person(browser, 'll-x-ok', 'E2E Accepted', false)
    const declined = await person(browser, 'll-x-no', 'E2E Declined', false)
    const pending = await person(browser, 'll-x-wait', 'E2E Pending', false)
    try {
      seedSafetyConnection(a.email, accepted.email, { status: 'accepted' })
      seedSafetyConnection(a.email, declined.email, { status: 'declined' })
      seedSafetyConnection(a.email, pending.email)

      for (const p of [accepted, declined, pending]) await listenRaw(p.page, await tokenFor(p.page, p.email))
      await startSharing(a.page)
      await expect.poll(async () => (await framesOf(accepted.page)).length, { timeout: 15_000 }).toBeGreaterThan(0)
      await new Promise((resolve) => setTimeout(resolve, 3000)) // long enough for a leak to show

      const got = await framesOf(accepted.page)
      expect(got.every((f) => f.account_id === a.id && f.lat === HOME.latitude && f.lng === HOME.longitude)).toBe(true)
      expect(await framesOf(declined.page)).toEqual([])
      expect(await framesOf(pending.page)).toEqual([])
    } finally {
      await closeAll(a, accepted, declined, pending)
    }
  })

  test('sharing is foreground-only: a hidden tab pauses it and holds no socket, and coming back resumes it — with a fresh position, never a stale one', async ({ browser }) => {
    const a = await person(browser, 'll-fg-a', 'E2E Amna Khan')
    const b = await person(browser, 'll-fg-b', 'E2E Bilal Rehman')
    try {
      const connectionId = seedSafetyConnection(a.email, b.email, { status: 'accepted' })
      await visit(b.page, `/app/safety-groups/${connectionId}`)
      await startSharing(a.page)
      await expect(b.page.getByText('24.8600, 67.0500')).toBeVisible({ timeout: 15_000 })

      // A's tab goes to the background: the card says so, the switch stays on, and A's position stops reaching B.
      await hideTab(a.page)
      await expect(a.page.getByText(/Paused — this tab is in the background/)).toBeVisible()
      await expect(shareSwitch(a.page)).toBeChecked()
      await a.context.setGeolocation({ latitude: 25.0, longitude: 67.2 }) // moves while hidden
      await new Promise((resolve) => setTimeout(resolve, 3500))
      await expect(b.page.getByText('24.8600, 67.0500')).toBeVisible()
      await expect(b.page.getByText('25.0000, 67.2000')).toHaveCount(0)

      // A comes back: it shares again, from where A is *now*.
      await showTab(a.page)
      await expect(a.page.getByText('Sharing your live location.')).toBeVisible({ timeout: 15_000 })
      await expect(b.page.getByText('25.0000, 67.2000')).toBeVisible({ timeout: 15_000 })
    } finally {
      await closeAll(a, b)
    }
  })

  test('turning it off stops the position going out; a reload never resumes it on its own', async ({ browser }) => {
    const a = await person(browser, 'll-off-a', 'E2E Amna Khan')
    const b = await person(browser, 'll-off-b', 'E2E Bilal Rehman')
    try {
      seedSafetyConnection(a.email, b.email, { status: 'accepted' })
      await listenRaw(b.page, await tokenFor(b.page, b.email))
      await startSharing(a.page)
      await expect.poll(async () => (await framesOf(b.page)).length, { timeout: 15_000 }).toBeGreaterThan(0)

      await shareSwitch(a.page).click()
      await expect(a.page.getByText(/Off\. Nobody can see where you are/)).toBeVisible()
      await new Promise((resolve) => setTimeout(resolve, 500))
      const before = (await framesOf(b.page)).length
      await a.context.setGeolocation({ latitude: 24.95, longitude: 67.15 })
      await new Promise((resolve) => setTimeout(resolve, 3500))
      expect((await framesOf(b.page)).length).toBe(before) // nothing sent after it was off

      // Turn it on again, then reload: the page comes back with sharing OFF and nothing more reaches B.
      await shareSwitch(a.page).click()
      await expect(a.page.getByText('Sharing your live location.')).toBeVisible({ timeout: 15_000 })
      await a.page.reload()
      await expect(shareSwitch(a.page)).not.toBeChecked()
      await new Promise((resolve) => setTimeout(resolve, 500))
      const afterReload = (await framesOf(b.page)).length
      await a.context.setGeolocation({ latitude: 25.1, longitude: 67.3 })
      await new Promise((resolve) => setTimeout(resolve, 3500))
      expect((await framesOf(b.page)).length).toBe(afterReload)
    } finally {
      await closeAll(a, b)
    }
  })

  test('sharing belongs to the citizen app, not one screen: it carries on while the person opens the map', async ({ browser }) => {
    const a = await person(browser, 'll-nav-a', 'E2E Amna Khan')
    const b = await person(browser, 'll-nav-b', 'E2E Bilal Rehman')
    try {
      const connectionId = seedSafetyConnection(a.email, b.email, { status: 'accepted' })
      await visit(b.page, `/app/safety-groups/${connectionId}`)
      await startSharing(a.page)
      await expect(b.page.getByText('24.8600, 67.0500')).toBeVisible({ timeout: 15_000 })

      await a.page.getByRole('link', { name: 'Map', exact: true }).click()
      await expect(a.page).toHaveURL(/\/app\/map/)
      await new Promise((resolve) => setTimeout(resolve, 2100))
      await a.context.setGeolocation({ latitude: 24.95, longitude: 67.15 })

      await expect(b.page.getByText('24.9500, 67.1500')).toBeVisible({ timeout: 15_000 })
    } finally {
      await closeAll(a, b)
    }
  })

  test('a viewer whose connection is dropped by the server reconnects by itself and hears the member again', async ({ browser }) => {
    const a = await person(browser, 'll-re-a', 'E2E Amna Khan')
    const b = await person(browser, 'll-re-b', 'E2E Bilal Rehman', false)
    try {
      const connectionId = seedSafetyConnection(a.email, b.email, { status: 'accepted' })
      // B's relay socket is routed through the test (everything is passed straight on to the real backend) so the test can hang it up from the server's side.
      const sockets: WebSocketRoute[] = []
      await b.page.routeWebSocket(/\/ws\/safety-connections\/location/, (ws) => {
        ws.connectToServer()
        sockets.push(ws)
      })
      await visit(b.page, `/app/safety-groups/${connectionId}`)
      await expect(b.page.getByText(`${a.name} isn't sharing right now`)).toBeVisible()
      await expect.poll(() => sockets.length).toBe(1)

      await sockets[0].close({ code: 1011, reason: 'test: dropped by the server' })

      // Nobody touches B's page: it opens a second socket by itself, after the first short pause…
      await expect.poll(() => sockets.length, { timeout: 15_000 }).toBe(2)
      // …and that socket is the real thing: A shares, and B hears it.
      await startSharing(a.page)
      await expect(b.page.getByText('Live', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(b.page.getByText('24.8600, 67.0500')).toBeVisible()
    } finally {
      await closeAll(a, b)
    }
  })

  test('a member who stops sending goes from Live to Not live after three quiet heartbeats — and the map keeps where they last were', async ({ browser }) => {
    const a = await person(browser, 'll-stale-a', 'E2E Amna Khan')
    const b = await person(browser, 'll-stale-b', 'E2E Bilal Rehman', false)
    try {
      const connectionId = seedSafetyConnection(a.email, b.email, { status: 'accepted' })
      await b.page.clock.install() // B's own clock can be moved on, so the quiet period doesn't have to be waited out
      await visit(b.page, `/app/safety-groups/${connectionId}`)
      await startSharing(a.page)
      await expect(b.page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 })

      await shareSwitch(a.page).click() // A stops: no more pings
      await expect(a.page.getByText(/Off\. Nobody can see where you are/)).toBeVisible()
      await b.page.clock.fastForward(60_000) // past 45 s of silence

      await expect(b.page.getByText('Not live')).toBeVisible()
      await expect(b.page.getByText(/Last seen/)).toBeVisible()
      await expect(memberMap(b.page, a.name).locator('.leaflet-marker-icon')).toHaveCount(1)
    } finally {
      await closeAll(a, b)
    }
  })

  test('the browser refusing the position switches sharing off and says why', async ({ browser }) => {
    const a = await person(browser, 'll-deny-a', 'E2E Amna Khan', false) // no geolocation permission granted
    const b = await person(browser, 'll-deny-b', 'E2E Bilal Rehman', false)
    try {
      seedSafetyConnection(a.email, b.email, { status: 'accepted' })
      await visit(a.page, '/app/safety-groups')

      await shareSwitch(a.page).click()

      await expect(a.page.getByText(/Your browser blocked location access/)).toBeVisible({ timeout: 15_000 })
      await expect(shareSwitch(a.page)).not.toBeChecked()
    } finally {
      await closeAll(a, b)
    }
  })

  test('a socket is opened only when there is someone to hear or share with — none for an account with no connections', async ({ browser }) => {
    const lonely = await person(browser, 'll-none', 'E2E Lonely', false)
    const busy = await person(browser, 'll-busy-a', 'E2E Amna Khan', false)
    const friend = await person(browser, 'll-busy-b', 'E2E Bilal Rehman', false)
    try {
      seedSafetyConnection(busy.email, friend.email, { status: 'accepted' })
      const opened = { lonely: 0, busy: 0 }
      // Only the relay's socket counts — Vite's own hot-reload socket is on every dev page.
      const isRelay = (url: string) => url.includes('/ws/safety-connections/location')
      lonely.page.on('websocket', (ws) => isRelay(ws.url()) && (opened.lonely += 1))
      busy.page.on('websocket', (ws) => isRelay(ws.url()) && (opened.busy += 1))

      await visit(lonely.page, '/app/safety-groups')
      await expect(lonely.page.getByText('Nobody in your circle yet')).toBeVisible()
      await expect(shareSwitch(lonely.page)).toHaveCount(0)
      await visit(busy.page, '/app/safety-groups')
      await expect(shareSwitch(busy.page)).toBeVisible()
      await expect.poll(() => opened.busy).toBe(1) // exactly one — never a second tab's worth

      expect(opened.lonely).toBe(0)
    } finally {
      await closeAll(lonely, busy, friend)
    }
  })
})
