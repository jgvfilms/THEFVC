/**
 * Password reset UI: the "Forgot password?" form on /auth and the
 * /reset-password page. fetch is stubbed; the endpoints themselves are
 * covered in tests/api/password-reset.test.ts.
 */
/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), signup: vi.fn(), adoptToken: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), body: JSON.parse(init.body) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("Forgot password on /auth", () => {
  it("sends the reset request for the entered email and shows a neutral confirmation", async () => {
    history.replaceState(null, "", "/auth");
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    const { AuthPage } = await import("@/pages/auth");
    const user = userEvent.setup();
    render(<AuthPage />);

    // Email typed on the login form carries over.
    await user.type(screen.getByTestId("input-email"), "Me@Example.com");
    await user.click(screen.getByTestId("link-forgot-password"));
    expect(screen.getByTestId("input-reset-email")).toHaveValue("me@example.com");

    await user.click(screen.getByTestId("button-send-reset"));

    await waitFor(() => expect(screen.getByTestId("reset-sent")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, body } = lastCall();
    expect(url).toMatch(/\/api\/auth\/password-reset\/request$/);
    expect(body).toEqual({ email: "me@example.com" });
    expect(screen.getByTestId("reset-sent")).toHaveTextContent("If an account exists for me@example.com");
  });

  it("does not call the server without an email", async () => {
    history.replaceState(null, "", "/auth");
    const { AuthPage } = await import("@/pages/auth");
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByTestId("link-forgot-password"));
    await user.click(screen.getByTestId("button-send-reset"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("reset-sent")).not.toBeInTheDocument();
  });
});

describe("/reset-password page", () => {
  async function renderWithToken(search: string) {
    history.replaceState(null, "", `/reset-password${search}`);
    const { ResetPasswordPage } = await import("@/pages/reset-password");
    render(<ResetPasswordPage />);
    return userEvent.setup();
  }

  it("explains when the link has no token", async () => {
    await renderWithToken("");
    expect(screen.getByTestId("reset-missing-token")).toBeInTheDocument();
    expect(screen.queryByTestId("input-new-password")).not.toBeInTheDocument();
  });

  it("removes the token from the address bar", async () => {
    await renderWithToken("?token=abc123");
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("rejects mismatched passwords without calling the server", async () => {
    const user = await renderWithToken("?token=abc123");
    await user.type(screen.getByTestId("input-new-password"), "new-password-1");
    await user.type(screen.getByTestId("input-confirm-password"), "new-password-2");
    await user.click(screen.getByTestId("button-reset-password"));

    expect(screen.getByTestId("reset-error")).toHaveTextContent("Passwords don't match.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a short password without calling the server", async () => {
    const user = await renderWithToken("?token=abc123");
    await user.type(screen.getByTestId("input-new-password"), "short");
    await user.type(screen.getByTestId("input-confirm-password"), "short");
    await user.click(screen.getByTestId("button-reset-password"));

    expect(screen.getByTestId("reset-error")).toHaveTextContent("at least 8 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits token and password to the confirm endpoint and shows success", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    const user = await renderWithToken("?token=abc123");
    await user.type(screen.getByTestId("input-new-password"), "new-password-1");
    await user.type(screen.getByTestId("input-confirm-password"), "new-password-1");
    await user.click(screen.getByTestId("button-reset-password"));

    await waitFor(() => expect(screen.getByTestId("reset-success")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, body } = lastCall();
    expect(url).toMatch(/\/api\/auth\/password-reset\/confirm$/);
    expect(body).toEqual({ token: "abc123", password: "new-password-1" });
  });

  it("shows the server's error for an expired or used token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "Invalid or expired token" }));
    const user = await renderWithToken("?token=stale");
    await user.type(screen.getByTestId("input-new-password"), "new-password-1");
    await user.type(screen.getByTestId("input-confirm-password"), "new-password-1");
    await user.click(screen.getByTestId("button-reset-password"));

    await waitFor(() => expect(screen.getByTestId("reset-error")).toHaveTextContent("Invalid or expired token"));
    expect(screen.queryByTestId("reset-success")).not.toBeInTheDocument();
  });
});

describe("App routing", () => {
  it("serves /reset-password with the reset page, not the /:handle profile route", async () => {
    history.replaceState(null, "", "/reset-password?token=abc123");
    const { AppRouter } = await import("@/App");
    render(<AppRouter />);
    expect(screen.getByTestId("reset-title")).toHaveTextContent("Choose a new password");
  });
});
