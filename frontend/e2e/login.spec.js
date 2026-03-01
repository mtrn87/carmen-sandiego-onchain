// @ts-check
import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('should display boot sequence on load', async ({ page }) => {
    await page.goto('/')

    // Boot terminal should be visible
    const terminal = page.locator('text=acme_mainframe.exe')
    await expect(terminal).toBeVisible({ timeout: 5000 })

    // Boot lines should appear
    await expect(page.locator('text=ACME DETECTIVE AGENCY')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=CHAINLINK CRE RUNTIME DETECTED')).toBeVisible({ timeout: 10000 })
  })

  test('should transition from boot to title phase', async ({ page }) => {
    await page.goto('/')

    // Wait for boot sequence to finish and logo to appear
    const logo = page.locator('img[alt="Carmen Sandiego Web3"]')
    await expect(logo).toBeVisible({ timeout: 15000 })
  })

  test('should show Connect button after boot sequence', async ({ page }) => {
    await page.goto('/')

    // Wait for the ready phase — Connect button appears
    const connectButton = page.locator('text=Connect')
    await expect(connectButton).toBeVisible({ timeout: 15000 })
  })

  test('should display network badges', async ({ page }) => {
    await page.goto('/')

    // Wait for badges to appear (use exact text match to avoid ambiguity)
    await expect(page.getByText('ARBITRUM SEPOLIA')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('BASE SEPOLIA')).toBeVisible({ timeout: 15000 })
    // "SEPOLIA" badge — use the first one (there are 3 badges with SEPOLIA in name)
    const badges = page.locator('span', { hasText: /^SEPOLIA$/ })
    await expect(badges.first()).toBeVisible({ timeout: 15000 })
  })

  test('should display info bar with protocol details', async ({ page }) => {
    await page.goto('/')

    // Wait for info bar
    await expect(page.locator('text=MULTI-CHAIN')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=CHAINLINK CRE')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=ECIES-secp256k1')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=ONLINE')).toBeVisible({ timeout: 15000 })
  })
})
