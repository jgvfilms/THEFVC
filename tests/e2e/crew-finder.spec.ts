/**
 * E2E Tests: Crew Finder for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Tests the crew finder page: search, filtering, profile card rendering,
 * and empty states.
 */
import { test, expect } from "@playwright/test";

test.describe("Crew Finder", () => {
  test.beforeEach(async ({ page }) => {
    // Seed data first to ensure profiles exist
    await page.goto("/#/crew");
  });

  test("should display the crew finder header", async ({ page }) => {
    const header = page.locator("h1");
    await expect(header).toContainText("Crew Finder");

    const subtitle = page.locator("text=Find verified crew by role, location, and skills.");
    await expect(subtitle).toBeVisible();
  });

  test("should display search input and role filter", async ({ page }) => {
    await expect(page.locator('[data-testid="input-search-city"]')).toBeVisible();
    await expect(page.locator('[data-testid="select-role-filter"]')).toBeVisible();
  });

  test("should display role filter options", async ({ page }) => {
    await page.click('[data-testid="select-role-filter"]');

    // Should show role options
    await expect(page.locator("text=Director")).toBeVisible();
    await expect(page.locator("text=Director of Photography")).toBeVisible();
    await expect(page.locator("text=1st AC")).toBeVisible();
    await expect(page.locator("text=Gaffer")).toBeVisible();
  });

  test("should filter profiles by role", async ({ page }) => {
    // Select a role filter
    await page.click('[data-testid="select-role-filter"]');
    await page.click("text=Director");

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Should show filtered results
    const resultsCount = page.locator("text=results found");
    await expect(resultsCount).toBeVisible();
  });

  test("should search by city", async ({ page }) => {
    await page.fill('[data-testid="input-search-city"]', "Brooklyn");

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Should show results
    const resultsCount = page.locator("text=results found");
    await expect(resultsCount).toBeVisible();
  });

  test("should display profile cards with correct information", async ({ page }) => {
    // Wait for profiles to load
    await page.waitForSelector('[data-testid^="card-crew-"]', { timeout: 10000 });

    const firstCard = page.locator('[data-testid^="card-crew-"]').first();
    await expect(firstCard).toBeVisible();

    // Should contain role, location, and rate info
    await expect(firstCard.locator("text=/\\$/")).toBeVisible(); // day rate
  });

  test("should display empty state when no results match", async ({ page }) => {
    // Search for something that won't match
    await page.fill('[data-testid="input-search-city"]', "NonexistentCity12345");

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Should show empty state
    await expect(page.locator("text=No crew found")).toBeVisible();
    await expect(page.locator("text=Try adjusting your filters.")).toBeVisible();
  });

  test("should display results count", async ({ page }) => {
    // Wait for results to load
    await page.waitForSelector("text=results found", { timeout: 10000 });

    const resultsText = await page.locator("text=results found").textContent();
    expect(resultsText).toMatch(/\d+ results? found/);
  });
});
