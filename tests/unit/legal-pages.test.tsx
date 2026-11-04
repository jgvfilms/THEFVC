/**
 * Google's consent screen needs public privacy and terms URLs. These used to
 * fall through to /:handle ("Profile not found"), so pin that they don't.
 */
/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), signup: vi.fn(), adoptToken: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

describe("Legal pages", () => {
  it.each([
    ["/privacy", "privacy-title", "Privacy policy"],
    ["/terms", "terms-title", "Terms of service"],
  ])("serves %s with its own page, not the /:handle profile route", async (path, testId, title) => {
    history.replaceState(null, "", path);
    const { AppRouter } = await import("@/App");
    render(<AppRouter />);
    expect(screen.getByTestId(testId)).toHaveTextContent(title);
  });
});
