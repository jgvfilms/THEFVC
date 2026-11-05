/**
 * The "Automatic follow-ups" switch on the New invoice dialog was reported as
 * ignored. These pin the round trip: what the admin UI posts is what is stored,
 * and a stored "off" arms nothing at send time.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { storage, db } from "../../server/storage";
import { hashPassword, generateToken } from "../../server/middleware/auth";
import { scheduleReminders } from "../../server/lib/invoicing";
import { createTestServer } from "../server";

let baseUrl: string;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ baseUrl, close } = await createTestServer());
});
afterAll(async () => {
  await close();
});
beforeEach(() => {
  for (const t of ["invoice_reminders", "invoice_events", "invoice_line_items", "invoices", "profiles", "sessions", "users"]) {
    db.run(`DELETE FROM ${t}`);
  }
});

function makeUser(handle: string, isAdmin: boolean) {
  const user = storage.createUser({
    handle,
    email: `${handle}@example.com`,
    passwordHash: hashPassword("TestPass123!"),
    isAdmin,
    accessStatus: "active",
    invitedBy: null,
  } as any);
  storage.createProfile({ userId: user.id, displayName: handle, role: "Director" });
  const token = generateToken();
  storage.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 86400000) });
  return { user, token };
}

async function createInvoice(token: string, recipientUserId: number, remindersEnabled: boolean) {
  const res = await fetch(`${baseUrl}/api/admin/invoices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipientUserId,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      remindersEnabled,
      reminderProfileName: "standard",
      lineItems: [{ description: "Test", quantity: 1, unitAmountCents: 100 }],
    }),
  });
  expect(res.status).toBeLessThan(300);
  return ((await res.json()) as { invoice: { id: number; remindersEnabled: boolean } }).invoice;
}

describe("automatic follow-ups switch", () => {
  it("off at creation is stored as off and arms no reminders", async () => {
    const admin = makeUser("boss", true);
    const member = makeUser("payer", false);
    const created = await createInvoice(admin.token, member.user.id, false);
    expect(created.remindersEnabled).toBe(false);
    expect(storage.getInvoice(created.id)!.remindersEnabled).toBe(false);
    expect(scheduleReminders(created.id)).toBe(0);
  });

  it("on at creation arms the standard cadence", async () => {
    const admin = makeUser("boss", true);
    const member = makeUser("payer", false);
    const created = await createInvoice(admin.token, member.user.id, true);
    expect(created.remindersEnabled).toBe(true);
    expect(scheduleReminders(created.id)).toBeGreaterThan(0);
  });
});
