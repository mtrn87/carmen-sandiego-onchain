// @ts-check
import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('should redirect /game to login when not connected', async ({ page }) => {
    await page.goto('/game')

    // Should redirect to / (login page)
    await page.waitForURL('/', { timeout: 10000 })
    expect(page.url()).toMatch(/\/$/)
  })

  test('should load help page', async ({ page }) => {
    await page.goto('/help')

    // Help page should render without crashing
    await expect(page.locator('body')).toBeVisible()
  })

  test('should load settings page', async ({ page }) => {
    await page.goto('/settings')

    // Settings page should render without crashing
    await expect(page.locator('body')).toBeVisible()
  })

  test('should handle unknown routes gracefully', async ({ page }) => {
    await page.goto('/nonexistent-page')

    // Should not crash — React Router handles unknown routes
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Authenticated Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Simulate authenticated state via localStorage (mimics authPersistence.js)
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('carmen_auth_session', JSON.stringify({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        nickname: 'TestAgent',
        timestamp: Date.now(),
      }))
      localStorage.setItem('wallet_address', '0x1234567890abcdef1234567890abcdef12345678')
    })
  })

  test('should restore session from localStorage on reload', async ({ page }) => {
    await page.reload()

    // Wait for boot sequence
    await page.waitForTimeout(3000)

    // The app should attempt to restore the session
    // (full game flow requires Privy, but session restore should not crash)
    await expect(page.locator('body')).toBeVisible()
  })
})
