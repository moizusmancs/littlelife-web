import { test, expect } from '@playwright/test'

test('unauthenticated visitor lands on Login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
