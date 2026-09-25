import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { seedHomeRegion, verifyAndOnboardAccount } from './seed'

/**
 * What the phase-end (deferred) specs share for a real, signed-in citizen: the API base, one password, a `goto` that survives a stalled
 * dev-server document, a registration that survives a lost reply, and a login through the real UI. The earlier specs carry their own
 * copies of these; new specs use this file so the code is written once.
 */
export const API = process.env.E2E_API ?? 'http://localhost:8080/api/v1'
export const password = 'SuperSecret123!'

/** `page.goto` that re-asks when the dev server doesn't answer the document in time. */
export async function visit(page: Page, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(path, { timeout: 12_000 })
      return
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
}

/** Registers a fresh account; a request that gets no answer is re-sent under a *new* email, so a lost reply can't turn the retry into a conflict. */
export async function register(api: APIRequestContext, label: string) {
  for (let attempt = 1; ; attempt++) {
    const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
    try {
      const res = await api.post(`${API}/auth/register`, { data: { email, password }, timeout: 15_000 })
      expect(res.ok()).toBeTruthy()
      return email
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
}

/** Logs in through the real login form and waits for the landing route. */
export async function logIn(page: Page, email: string, landing: RegExp) {
  await visit(page, '/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(landing)
}

/** A verified, onboarded citizen (optionally with a home region and a chosen profile name), signed in and on `/app/home`. */
export async function signInCitizen(page: Page, label: string, homeRegionId?: string, name = 'E2E Citizen') {
  const email = await register(page.request, label)
  verifyAndOnboardAccount(email, name)
  if (homeRegionId) seedHomeRegion(email, homeRegionId)
  await logIn(page, email, /\/app\/home$/)
  return email
}

/** A random 0.6° square at 16–21°N, 70–78°E — clear of the real regions and south of the flood pipeline's grid — as `ORIGIN`, with helpers to lay a world out from it. */
export function randomWorld() {
  const jitter = (max: number) => Number((Math.random() * max).toFixed(1))
  const origin: [number, number] = [70 + jitter(8), 16 + jitter(5)]
  const at = (dx: number, dy: number): [number, number] => [Number((origin[0] + dx).toFixed(4)), Number((origin[1] + dy).toFixed(4))]
  const rect = (x1: number, y1: number, x2: number, y2: number): Array<[number, number]> => [at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]
  return { origin, at, rect, tag: `${Date.now()}${Math.floor(Math.random() * 1000)}` }
}
