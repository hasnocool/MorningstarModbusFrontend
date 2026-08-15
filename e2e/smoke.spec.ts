import { expect, test } from '@playwright/test'

test('renders the operations shell even when the API is unavailable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Morningstar')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await expect(page.getByText(/API unavailable|No devices|System overview/i)).toBeVisible()
})
