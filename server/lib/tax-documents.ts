/**
 * PRD-021: Tax Document Generation & 1099 Reporting
 *
 * Generates 1099-MISC and 1099-NEC forms for contractors
 * paid $600+ in a tax year.
 */

import { storage } from "../storage";
import { decryptSensitive } from "../lib/encryption";
import type { Payment, W9Form, Profile } from "@shared/schema";

export interface Form1099 {
  taxYear: number;
  recipientName: string;
  recipientTIN: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState: string;
  recipientZipCode: string;
  box1: number; // Nonemployee compensation (NEC Box 1)
  box2: number; // Royalties
  box3: number; // Other income
  box4: number; // Federal income tax withheld
  box5: number; // State tax withheld
  total: number;
}

/**
 * Check if a contractor is eligible for a 1099 form.
 * IRS threshold: $600+ in payments in a tax year.
 */
export function is1099Eligible(payments: Payment[]): boolean {
  const total = payments.reduce((sum: number, p: Payment) => {
    if (p.status === "succeeded" || p.status === "paid") {
      return sum + p.amount;
    }
    return sum;
  }, 0);
  return total >= 60000; // $600 in cents
}

/**
 * Generate 1099 forms for all eligible contractors for a given tax year.
 */
export function generate1099Forms(year: number): Form1099[] {
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year + 1, 0, 1).getTime();

  // Get all payments for the year
  const allPayments = storage.getAllPayments(100000);
  const yearPayments = allPayments.filter((p) => {
    const ts = new Date(p.createdAt).getTime();
    return ts >= yearStart && ts < yearEnd;
  });

  // Group by user
  const paymentsByUser = new Map<number, Payment[]>();
  for (const p of yearPayments) {
    if (!paymentsByUser.has(p.userId)) {
      paymentsByUser.set(p.userId, []);
    }
    paymentsByUser.get(p.userId)!.push(p);
  }

  // Get all verified W-9 forms
  const w9Forms = storage.getW9Forms("verified");
  const w9ByUser = new Map<number, W9Form>();
  for (const w9 of w9Forms) {
    w9ByUser.set(w9.userId, w9);
  }

  const forms: Form1099[] = [];

  // Convert Map entries to array to avoid downlevelIteration issues
  const entries: Array<[number, Payment[]]> = Array.from(paymentsByUser.entries());
  for (const [userId, userPayments] of entries) {
    if (!is1099Eligible(userPayments)) continue;

    const w9 = w9ByUser.get(userId);
    if (!w9) continue; // Can't generate 1099 without tax info

    const profile = storage.getProfile(userId);

    // Calculate box amounts
    let box1 = 0; // NEC - Nonemployee compensation
    let box2 = 0; // Royalties
    let box3 = 0; // Other income
    let box4 = 0; // Federal income tax withheld

    for (const p of userPayments) {
      if (p.status === "succeeded" || p.status === "paid") {
        // Categorize based on description or metadata
        const desc = (p.description || "").toLowerCase();
        if (desc.includes("royalty")) {
          box2 += p.amount;
        } else if (desc.includes("other") || desc.includes("bonus")) {
          box3 += p.amount;
        } else {
          // Default to NEC (Box 1) for crew payments
          box1 += p.amount;
        }
      }
    }

    const total = box1 + box2 + box3;

    forms.push({
      taxYear: year,
      recipientName: w9.fullName || profile?.displayName || "",
      // PRD-024: Full TIN required — this feeds actual IRS 1099-NEC filing data,
      // not a UI display. Callers are admin-gated and audit-logged (see routes.ts).
      // Do not mask here; mask only in human-facing display endpoints.
      recipientTIN: w9.einOrSsn ? (decryptSensitive(w9.einOrSsn) || "") : "",
      recipientAddress: w9.address || "",
      recipientCity: w9.city || "",
      recipientState: w9.state || "",
      recipientZipCode: w9.zipCode || "",
      box1,
      box2,
      box3,
      box4,
      box5: 0,
      total,
    });
  }

  return forms;
}

/**
 * Generate a formatted 1099-NEC PDF data structure.
 * In production, this would be rendered to PDF using a library like PDFKit or Puppeteer.
 */
export function generate1099NECData(form: Form1099): Record<string, unknown> {
  return {
    formType: "1099-NEC",
    taxYear: form.taxYear,
    payer: {
      name: "Film Video Collective (THEFVC.IS)",
      tin: process.env.PAYER_TIN || (() => { throw new Error("PAYER_TIN environment variable is required for 1099 generation"); })(), // Payer's EIN
      address: "New York, NY",
    },
    recipient: {
      name: form.recipientName,
      tin: form.recipientTIN,
      address: form.recipientAddress,
      city: form.recipientCity,
      state: form.recipientState,
      zip: form.recipientZipCode,
    },
    boxes: {
      1: form.box1,       // Nonemployee compensation
      2: form.box2,       // Payer makes no federal income tax payments
      3: form.box3,       // Reserved
      4: form.box4,       // Federal income tax withheld
      5: form.box5,       // State tax withheld
    },
    total: form.total,
    formattedTotal: `$${(form.total / 100).toFixed(2)}`,
  };
}

/**
 * Get all eligible contractors for 1099 generation.
 * Returns summary data for review before generating forms.
 */
export function get1099EligibleContractors(year: number): Array<{
  userId: number;
  displayName: string;
  totalPaid: number;
  paymentCount: number;
  w9Verified: boolean;
}> {
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year + 1, 0, 1).getTime();

  const allPayments = storage.getAllPayments(100000);
  const yearPayments = allPayments.filter((p) => {
    const ts = new Date(p.createdAt).getTime();
    return ts >= yearStart && ts < yearEnd;
  });

  const paymentsByUser = new Map<number, Payment[]>();
  for (const p of yearPayments) {
    if (!paymentsByUser.has(p.userId)) {
      paymentsByUser.set(p.userId, []);
    }
    paymentsByUser.get(p.userId)!.push(p);
  }

  const w9Forms = storage.getW9Forms("verified");
  const w9ByUser = new Set(w9Forms.map((w) => w.userId));

  const results: Array<{
    userId: number;
    displayName: string;
    totalPaid: number;
    paymentCount: number;
    w9Verified: boolean;
  }> = [];

  const entries: Array<[number, Payment[]]> = Array.from(paymentsByUser.entries());
  for (const [userId, userPayments] of entries) {
    const total = userPayments.reduce((sum: number, p: Payment) => {
      if (p.status === "succeeded" || p.status === "paid") {
        return sum + p.amount;
      }
      return sum;
    }, 0);

    const profile = storage.getProfile(userId);

    results.push({
      userId,
      displayName: profile?.displayName || `User #${userId}`,
      totalPaid: total,
      paymentCount: userPayments.length,
      w9Verified: w9ByUser.has(userId),
    });
  }

  return results.sort((a, b) => b.totalPaid - a.totalPaid);
}
