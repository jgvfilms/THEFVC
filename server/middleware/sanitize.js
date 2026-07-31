"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitize = sanitize;
/**
 * Sanitization middleware.
 * Recursively strips potentially dangerous content from request body,
 * query params, and URL params.
 *
 * - Removes keys starting with `$` (MongoDB NoSQL injection)
 * - Strips HTML tags from string values
 * - Trims whitespace
 * - Removes null bytes
 */
function sanitizeValue(value) {
    if (typeof value === "string") {
        // Remove null bytes
        var cleaned = value.replace(/\0/g, "");
        // Strip HTML tags
        cleaned = cleaned.replace(/<[^>]*>/g, "");
        // Trim whitespace
        cleaned = cleaned.trim();
        return cleaned;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === "object") {
        var obj = {};
        for (var _i = 0, _a = Object.entries(value); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], val = _b[1];
            // Skip keys that look like NoSQL injection attempts
            if (key.startsWith("$"))
                continue;
            obj[key] = sanitizeValue(val);
        }
        return obj;
    }
    return value;
}
function sanitize(req, _res, next) {
    if (req.body && typeof req.body === "object") {
        req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === "object") {
        req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === "object") {
        req.params = sanitizeValue(req.params);
    }
    next();
}
