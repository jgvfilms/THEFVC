"use strict";
/**
 * PRD-018: Security & Compliance Hardening
 *
 * Encryption utilities for sensitive data (W-9 SSNs/EINs, etc.)
 * Uses AES-256-GCM for encryption at rest.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSensitive = encryptSensitive;
exports.decryptSensitive = decryptSensitive;
exports.maskTaxId = maskTaxId;
exports.isValidEIN = isValidEIN;
exports.isValidSSN = isValidSSN;
exports.isValidTaxId = isValidTaxId;
var node_crypto_1 = require("node:crypto");
// Encryption key derivation — in production, this should come from a KMS or vault
var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "thefvc-encryption-key-change-in-production";
/**
 * Derive a 32-byte key from the encryption secret using scrypt.
 */
function deriveKey() {
    return (0, node_crypto_1.scryptSync)(ENCRYPTION_KEY, "fvc-salt", 32);
}
/**
 * Encrypt a sensitive string value using AES-256-GCM.
 * Returns a string in format: `${ivHex}:${authTagHex}:${encryptedHex}`
 */
function encryptSensitive(value) {
    var key = deriveKey();
    var iv = (0, node_crypto_1.randomBytes)(12); // 96-bit IV for GCM
    var cipher = (0, node_crypto_1.createCipheriv)("aes-256-gcm", key, iv);
    var encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    var authTag = cipher.getAuthTag();
    return "".concat(iv.toString("hex"), ":").concat(authTag.toString("hex"), ":").concat(encrypted.toString("hex"));
}
/**
 * Decrypt a value encrypted with encryptSensitive().
 * Returns null if decryption fails (corrupted data or wrong key).
 */
function decryptSensitive(encryptedStr) {
    try {
        var key = deriveKey();
        var parts = encryptedStr.split(":");
        if (parts.length !== 3)
            return null;
        var ivHex = parts[0], authTagHex = parts[1], encryptedHex = parts[2];
        if (!ivHex || !authTagHex || !encryptedHex)
            return null;
        var iv = Buffer.from(ivHex, "hex");
        var authTag = Buffer.from(authTagHex, "hex");
        var encryptedBuf = Buffer.from(encryptedHex, "hex");
        var decipher = (0, node_crypto_1.createDecipheriv)("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        var decrypted = Buffer.concat([
            decipher.update(encryptedBuf),
            decipher.final(),
        ]);
        return decrypted.toString("utf8");
    }
    catch (_a) {
        return null;
    }
}
/**
 * Mask a tax ID, showing only the last 4 digits.
 * "12-3456789" -> "XX-XXX-6789"
 * "123-45-6789" -> "XXX-XX-6789"
 */
function maskTaxId(taxId) {
    var digits = taxId.replace(/\D/g, "");
    if (digits.length < 4)
        return "****";
    var last4 = digits.slice(-4);
    return "***-***-".concat(last4);
}
/**
 * Validate EIN format: XX-XXXXXXX or XXYYYYYYYY (8 digits)
 */
function isValidEIN(ein) {
    var clean = ein.replace(/[-\s]/g, "");
    return /^\d{2}\d{7}$/.test(clean) && clean.length === 9;
}
/**
 * Validate SSN format: XXX-XX-XXXX or XXXXXXXXX (9 digits)
 * Also rejects obviously invalid patterns (all same digit, etc.)
 */
function isValidSSN(ssn) {
    var clean = ssn.replace(/[-\s]/g, "");
    if (!/^\d{9}$/.test(clean))
        return false;
    // Reject obviously fake SSNs
    if (/^000/.test(clean) || /^666/.test(clean) || /^9\d{2}/.test(clean))
        return false;
    if (/^(\d)\1{8}$/.test(clean))
        return false; // all same digit
    return true;
}
/**
 * Validate tax ID — accepts either EIN or SSN format
 */
function isValidTaxId(taxId) {
    var clean = taxId.replace(/[-\s]/g, "");
    return isValidEIN(clean) || isValidSSN(clean);
}
