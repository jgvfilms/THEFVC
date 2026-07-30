/**
 * E2E Tests: Authentication Flow for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Tests the auth page: login form, signup flow, beta request,
 * invite token validation, and mode switching.
 */
import { test, expect } from "@playwright/test";

test.describe("Auth Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/auth");
  });

  test("should display the auth page with login mode by default", async ({ page }) => {
    const title = page.locator('[data-testid="auth-title"]');
    await expect(title).toContainText("Welcome back");

    const subtitle = page.locator('[data-testid="auth-subtitle"]');
    await expect(subtitle).toContainText("Log in to your dashboard");

    // Login form should be visible
    await expect(page.locator('[data-testid="input-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-submit"]')).toBeVisible();
  });

  test("should show request access mode when clicking request access", async ({ page }) => {
    // Click the toggle to switch to request mode
    await page.click('[data-testid="toggle-mode"]');

    const title = page.locator('[data-testid="auth-title"]');
    await expect(title).toContainText("Request beta access");

    // Request form should be visible
    await expect(page.locator('[data-testid="input-req-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-req-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-submit-request"]')).toBeVisible();
  });

  test("should validate required fields on login", async ({ page }) => {
    // Try to submit with empty fields
    await page.click('[data-testid="button-submit"]');

    // Should not navigate away (form validation should prevent submission)
    // The page should still show the login form
    await expect(page.locator('[data-testid="auth-title"]')).toContainText("Welcome back");
  });

  test("should show error for invalid login credentials", async ({ page }) => {
    await page.fill('[data-testid="input-email"]', "nonexistent@example.com");
    await page.fill('[data-testid="input-password"]', "wrongpassword");
    await page.click('[data-testid="button-submit"]');

    // Should show an error toast
    await expect(page.locator(".destructive")).toBeVisible({ timeout: 5000 });
  });

  test("should submit beta request with valid data", async ({ page }) => {
    // Switch to request mode
    await page.click('[data-testid="toggle-mode"]');

    await page.fill('[data-testid="input-req-email"]', "e2e-test@example.com");
    await page.fill('[data-testid="input-req-name"]', "E2E Tester");
    await page.selectOptions('[data-testid="select-req-role"]', "Director");
    await page.fill('[data-testid="input-req-city"]', "Test City");
    await page.fill('[data-testid="input-req-message"]', "Testing beta request");

    await page.click('[data-testid="button-submit-request"]');

    // Should show success message
    await expect(page.locator('[data-testid="request-success"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="request-success"]')).toContainText("You're on the list");
  });

  test("should show mode tabs", async ({ page }) => {
    const tabs = page.locator('[data-testid="mode-tabs"]');
    await expect(tabs).toBeVisible();

    // Login tab should be visible
    await expect(page.locator('[data-testid="tab-login"]')).toBeVisible();

    // Request access tab should be visible (no invite token in URL)
    await expect(page.locator('[data-testid="tab-request"]')).toBeVisible();
  });

  test("should switch between login and request modes", async ({ page }) => {
    // Start in login mode
    await expect(page.locator('[data-testid="auth-title"]')).toContainText("Welcome back");

    // Switch to request
    await page.click('[data-testid="tab-request"]');
    await expect(page.locator('[data-testid="auth-title"]')).toContainText("Request beta access");

    // Switch back to login
    await page.click('[data-testid="tab-login"]');
    await expect(page.locator('[data-testid="auth-title"]')).toContainText("Welcome back");
  });
});
