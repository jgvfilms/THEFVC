/**
 * E2E Tests: Landing Page for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Tests the landing page renders correctly, navigation links work,
 * and the hero section displays expected content.
 */
import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the hero title", async ({ page }) => {
    const title = page.locator('[data-testid="hero-title"]');
    await expect(title).toBeVisible();
    await expect(title).toContainText("Independent");
    await expect(title).toContainText("alone");
  });

  test("should display the hero subtitle", async ({ page }) => {
    const subtitle = page.locator('[data-testid="hero-subtitle"]');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText("Find your crew.");
  });

  test("should display the early access label", async ({ page }) => {
    const badge = page.locator('[data-testid="badge-beta"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/early access/i);
  });

  test("should display CTA buttons", async ({ page }) => {
    await expect(page.locator('[data-testid="cta-signup"]')).toBeVisible();
    await expect(page.locator('[data-testid="cta-browse"]')).toBeVisible();
  });

  test("should not repeat unsourced claims", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText("30%");
  });

  test("should show crew, plan and payments views", async ({ page }) => {
    await expect(page.locator('[data-testid="view-crew"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-plan"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-payments"]')).toBeVisible();
  });

  test("should display three plans", async ({ page }) => {
    await expect(page.locator('[data-testid="pricing-free"]')).toBeVisible();
    await expect(page.locator('[data-testid="pricing-pro"]')).toBeVisible();
    await expect(page.locator('[data-testid="pricing-studio"]')).toBeVisible();
  });

  test("should display three workflow steps", async ({ page }) => {
    await expect(page.locator('[data-testid="step-crew"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-production"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-payments"]')).toBeVisible();
  });

  test("should display footer with copyright", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("Film Video Collective");
    await expect(footer).toContainText("2026");
  });

  test("should navigate to auth page when clicking login", async ({ page }) => {
    await page.click('[data-testid="link-login"]');
    await expect(page).toHaveURL(/\/auth/);
  });

  test("should navigate to auth page when clicking join", async ({ page }) => {
    await page.click('[data-testid="cta-signup"]');
    await expect(page).toHaveURL(/\/auth/);
  });

  test("should navigate to crew finder when clicking find crew", async ({ page }) => {
    await page.click('[data-testid="cta-browse"]');
    await expect(page).toHaveURL(/\/crew/);
  });
});

test.describe("Roadmap page", () => {
  test("lists the five roadmap phases", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page.locator('[data-testid="roadmap-title"]')).toContainText("AI roadmap");
    await expect(page.locator('[data-testid^="roadmap-"]:not([data-testid="roadmap-title"])')).toHaveCount(5);
  });
});
