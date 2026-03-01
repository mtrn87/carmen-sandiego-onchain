// @ts-check
import { test, expect } from '@playwright/test'

/**
 * Game flow E2E tests.
 *
 * These tests verify UI behavior with mock/simulated game state.
 * Full Privy authentication requires a real OAuth flow and cannot be
 * automated in standard E2E — these tests focus on what's testable
 * without a live wallet connection.
 */

test.describe('Game Page Access Control', () => {
  test('should redirect /game to login when not connected', async ({ page }) => {
    await page.goto('/game')

    // Should redirect to / (login page)
    await page.waitForURL('/', { timeout: 10000 })
    expect(page.url()).toMatch(/\/$/)
  })
})

test.describe('Login Flow Visual Elements', () => {
  test('should show subtitle typewriter after boot finishes', async ({ page }) => {
    await page.goto('/')

    // Wait for boot to finish and subtitle to type out (boot ~3s + title ~2s + typewriter)
    const subtitle = page.getByText('DECENTRALIZED MYSTERY', { exact: false })
    await expect(subtitle).toBeVisible({ timeout: 25000 })
  })

  test('should show AGENT IDENTIFICATION REQUIRED text', async ({ page }) => {
    await page.goto('/')

    // Wait for the ready phase text (after boot + title phases)
    const agentText = page.getByText('AGENT IDENTIFICATION REQUIRED', { exact: false })
    await expect(agentText).toBeVisible({ timeout: 25000 })
  })

  test('Connect button should be clickable', async ({ page }) => {
    await page.goto('/')

    const connectButton = page.getByRole('button', { name: /Connect/i })
    await expect(connectButton).toBeVisible({ timeout: 25000 })
    await expect(connectButton).toBeEnabled()

    // Clicking triggers Privy modal (won't fully work in test env)
    // but should not crash the page
    await connectButton.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Responsive Layout', () => {
  test('should render on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }) // iPhone X
    await page.goto('/')

    // Boot sequence should still display
    await expect(page.getByText('ACME DETECTIVE AGENCY', { exact: false })).toBeVisible({ timeout: 10000 })

    // Connect button should be visible after boot
    const connectButton = page.getByRole('button', { name: /Connect/i })
    await expect(connectButton).toBeVisible({ timeout: 25000 })
  })

  test('should render on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }) // iPad
    await page.goto('/')

    const connectButton = page.getByRole('button', { name: /Connect/i })
    await expect(connectButton).toBeVisible({ timeout: 25000 })
  })
})
