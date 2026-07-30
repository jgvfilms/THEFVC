/**
 * E2E Tests: Landing Page for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Tests the landing page renders correctly, navigation links work,
 * and the hero section displays expected content.
 */
import { test, expect, type Page } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the hero title", async ({ page }) => {
    const title = page.locator('[data-testid="hero-title"]');
    await expect(title).toBeVisible();
    await expect(title).toContainText("Less paperwork.");
    await expect(title).toContainText("More frames.");
    await expect(title).toContainText("Better stories.");
  });

  test("should display the hero subtitle", async ({ page }) => {
    const subtitle = page.locator('[data-testid="hero-subtitle"]');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText("all-in-one operating system for indie filmmaking");
  });

  test("should display the beta badge", async ({ page }) => {
    const badge = page.locator('[data-testid="badge-beta"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("early access");
  });

  test("should display CTA buttons", async ({ page }) => {
    const signupCta = page.locator('[data-testid="cta-signup"]');
    const browseCta = page.locator('[data-testid="cta-browse"]');
    await expect(signupCta).toBeVisible();
    await expect(browseCta).toBeVisible();
  });

  test("should display the 30% stat", async ({ page }) => {
    const stat = page.locator('[data-testid="stat-30"]');
    await expect(stat).toBeVisible();
    await expect(stat).toContainText("30%");
  });

  test("should display three pricing tiers", async ({ page }) => {
    const free = page.locator('[data-testid="pricing-free"]');
    const pro = page.locator('[data-testid="pricing-pro"]');
    const studio = page.locator('[data-testid="pricing-studio"]');
    await expect(free).toBeVisible();
    await expect(pro).toBeVisible();
    await expect(studio).toBeVisible();
  });

  test("should display three pillars", async ({ page }) => {
    const payments = page.locator('[data-testid="pillar-payments"]');
    const crew = page.locator('[data-testid="pillar-crew"]');
    const dashboard = page.locator('[data-testid="pillar-dashboard"]');
    await expect(payments).toBeVisible();
    await expect(crew).toBeVisible();
    await expect(dashboard).toBeVisible();
  });

  test("should display the roadmap section", async ({ page }) => {
    const title = page.locator('[data-testid="roadmap-title"]');
    await expect(title).toBeVisible();
    await expect(title).toContainText("AI roadmap");

    // Should have 5 roadmap phases
    const phases = page.locator('[data-testid^="roadmap-"]');
    await expect(phases).toHaveCount(5);
  });

  test("should display footer with copyright", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("Film Video Collective");
    await expect(footer).toContainText("2026");
  });

  test("should navigate to auth page when clicking login", async ({ page }) => {
    await page.click('[data-testid="link-login"]');
    await expect(page).toHaveURL(/#\/auth/);
  });

  test("should navigate to auth page when clicking get started", async ({ page }) => {
    await page.click('[data-testid="cta-signup"]');
    await expect(page).toHaveURL(/#\/auth/);
  });

  test("should navigate to crew finder when clicking browse crew", async ({ page }) => {
    await page.click('[data-testid="link-crew"]');
    await expect(page).toHaveURL(/#\/crew/);
  });
});
