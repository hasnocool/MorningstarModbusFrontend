import { expect, test } from '@playwright/test'

test('renders the site operations shell even when the API is unavailable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Morningstar')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await expect(page.getByText(/Site inventory unavailable|No site is configured|Site operations/i)).toBeVisible()
})
