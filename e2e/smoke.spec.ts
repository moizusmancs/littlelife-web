import { test, expect } from '@playwright/test'

test('unauthenticated visitor lands on Login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Login', { exact: true })).toBeVisible()
})
