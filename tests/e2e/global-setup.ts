/**
 * Playwright global setup for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Boots the Express server in a child process before all E2E tests run,
 * and tears it down after. The server runs on a random ephemeral port.
 */
import type { GlobalSetup } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

let serverProcess: ChildProcessWithoutNullStreams | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(`${url}/api/auth/me`);
        if (res.ok) {
          resolve();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server did not start within ${timeoutMs}ms`));
        } else {
          setTimeout(check, 500);
        }
      }
    };
    check();
  });
}

const globalSetup: GlobalSetup = async (config) => {
  // Use a test database file so we get fresh data each run
  process.env.NODE_ENV = "test";
  process.env.PORT = "5050";

  // Spawn the server
  serverProcess = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", PORT: "5050" },
  });

  // Wait for server to be ready
  const baseUrl = `http://127.0.0.1:${process.env.PORT}`;
  await waitForServer(baseUrl, 30000);

  // Seed the database with test data
  try {
    await fetch(`${baseUrl}/api/seed`, { method: "POST" });
  } catch {
    // Seed might fail if already seeded — that's fine
  }

  return async () => {
    // Teardown: kill the server
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      try {
        await new Promise((resolve) => serverProcess!.on("exit", resolve));
      } catch {
        serverProcess.kill("SIGKILL");
      }
    }
  };
};

export default globalSetup;
