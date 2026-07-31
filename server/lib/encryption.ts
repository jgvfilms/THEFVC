/**
 * PRD-018: Security & Compliance Hardening
 * 
 * Encryption utilities for sensitive data (W-9 SSNs/EINs, etc.)
 * Uses AES-256-GCM for encryption at rest.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Encryption key derivation — in production, this should come from a KMS or vault
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY environment variable is required. Generate with: openssl rand -hex 32");
}

/**
 * Derive a 32-byte key from the encryption secret using scrypt.
 */
function deriveKey(): Buffer {
  return scryptSync(ENCRYPTION_KEY as string, "fvc-salt", 32);
}

/**
 * Encrypt a sensitive string value using AES-256-GCM.
 * Returns a string in format: `${ivHex}:${authTagHex}:${encryptedHex}`
 */
export function encryptSensitive(value: string): string {
  const key = deriveKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a value encrypted with encryptSensitive().
 * Returns null if decryption fails (corrupted data or wrong key).
 */
export function decryptSensitive(encryptedStr: string): string | null {
  try {
    const key = deriveKey();
    const parts = encryptedStr.split(":");
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) return null;

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encryptedBuf = Buffer.from(encryptedHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Mask a tax ID, showing only the last 4 digits.
 * "12-3456789" -> "XX-XXX-6789"
 * "123-45-6789" -> "XXX-XX-6789"
 */
export function maskTaxId(taxId: string): string {
  const digits = taxId.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

/**
 * Validate EIN format: XX-XXXXXXX or XXYYYYYYYY (8 digits)
 */
export function isValidEIN(ein: string): boolean {
  const clean = ein.replace(/[-\s]/g, "");
  return /^\d{2}\d{7}$/.test(clean) && clean.length === 9;
}

/**
 * Validate SSN format: XXX-XX-XXXX or XXXXXXXXX (9 digits)
 * Also rejects obviously invalid patterns (all same digit, etc.)
 */
export function isValidSSN(ssn: string): boolean {
  const clean = ssn.replace(/[-\s]/g, "");
  if (!/^\d{9}$/.test(clean)) return false;
  // Reject obviously fake SSNs
  if (/^000/.test(clean) || /^666/.test(clean) || /^9\d{2}/.test(clean)) return false;
  if (/^(\d)\1{8}$/.test(clean)) return false; // all same digit
  return true;
}

/**
 * Validate tax ID — accepts either EIN or SSN format
 */
export function isValidTaxId(taxId: string): boolean {
  const clean = taxId.replace(/[-\s]/g, "");
  return isValidEIN(clean) || isValidSSN(clean);
}
