"use strict";
/**
 * PRD-021: Tax Document Generation & 1099 Reporting
 *
 * Generates 1099-MISC and 1099-NEC forms for contractors
 * paid $600+ in a tax year.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.is1099Eligible = is1099Eligible;
exports.generate1099Forms = generate1099Forms;
exports.generate1099NECData = generate1099NECData;
exports.get1099EligibleContractors = get1099EligibleContractors;
var storage_1 = require("../storage");
var encryption_1 = require("../lib/encryption");
/**
 * Check if a contractor is eligible for a 1099 form.
 * IRS threshold: $600+ in payments in a tax year.
 */
function is1099Eligible(payments) {
    var total = payments.reduce(function (sum, p) {
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
function generate1099Forms(year) {
    var yearStart = new Date(year, 0, 1).getTime();
    var yearEnd = new Date(year + 1, 0, 1).getTime();
    // Get all payments for the year
    var allPayments = storage_1.storage.getAllPayments(100000);
    var yearPayments = allPayments.filter(function (p) {
        var ts = new Date(p.createdAt).getTime();
        return ts >= yearStart && ts < yearEnd;
    });
    // Group by user
    var paymentsByUser = new Map();
    for (var _i = 0, yearPayments_1 = yearPayments; _i < yearPayments_1.length; _i++) {
        var p = yearPayments_1[_i];
        if (!paymentsByUser.has(p.userId)) {
            paymentsByUser.set(p.userId, []);
        }
        paymentsByUser.get(p.userId).push(p);
    }
    // Get all verified W-9 forms
    var w9Forms = storage_1.storage.getW9Forms("verified");
    var w9ByUser = new Map();
    for (var _a = 0, w9Forms_1 = w9Forms; _a < w9Forms_1.length; _a++) {
        var w9 = w9Forms_1[_a];
        w9ByUser.set(w9.userId, w9);
    }
    var forms = [];
    // Convert Map entries to array to avoid downlevelIteration issues
    var entries = Array.from(paymentsByUser.entries());
    for (var _b = 0, entries_1 = entries; _b < entries_1.length; _b++) {
        var _c = entries_1[_b], userId = _c[0], userPayments = _c[1];
        if (!is1099Eligible(userPayments))
            continue;
        var w9 = w9ByUser.get(userId);
        if (!w9)
            continue; // Can't generate 1099 without tax info
        var profile = storage_1.storage.getProfile(userId);
        // Calculate box amounts
        var box1 = 0; // NEC - Nonemployee compensation
        var box2 = 0; // Royalties
        var box3 = 0; // Other income
        var box4 = 0; // Federal income tax withheld
        for (var _d = 0, userPayments_1 = userPayments; _d < userPayments_1.length; _d++) {
            var p = userPayments_1[_d];
            if (p.status === "succeeded" || p.status === "paid") {
                // Categorize based on description or metadata
                var desc = (p.description || "").toLowerCase();
                if (desc.includes("royalty")) {
                    box2 += p.amount;
                }
                else if (desc.includes("other") || desc.includes("bonus")) {
                    box3 += p.amount;
                }
                else {
                    // Default to NEC (Box 1) for crew payments
                    box1 += p.amount;
                }
            }
        }
        var total = box1 + box2 + box3;
        forms.push({
            taxYear: year,
            recipientName: w9.fullName || (profile === null || profile === void 0 ? void 0 : profile.displayName) || "",
            recipientTIN: w9.einOrSsn ? (0, encryption_1.maskTaxId)((0, encryption_1.decryptSensitive)(w9.einOrSsn) || "") : "",
            recipientAddress: w9.address || "",
            recipientCity: w9.city || "",
            recipientState: w9.state || "",
            recipientZipCode: w9.zipCode || "",
            box1: box1,
            box2: box2,
            box3: box3,
            box4: box4,
            box5: 0,
            total: total,
        });
    }
    return forms;
}
/**
 * Generate a formatted 1099-NEC PDF data structure.
 * In production, this would be rendered to PDF using a library like PDFKit or Puppeteer.
 */
function generate1099NECData(form) {
    return {
        formType: "1099-NEC",
        taxYear: form.taxYear,
        payer: {
            name: "Film Video Collective (THEFVC.IS)",
            tin: "81-2345678", // Payer's EIN
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
            1: form.box1, // Nonemployee compensation
            2: form.box2, // Payer makes no federal income tax payments
            3: form.box3, // Reserved
            4: form.box4, // Federal income tax withheld
            5: form.box5, // State tax withheld
        },
        total: form.total,
        formattedTotal: "$".concat((form.total / 100).toFixed(2)),
    };
}
/**
 * Get all eligible contractors for 1099 generation.
 * Returns summary data for review before generating forms.
 */
function get1099EligibleContractors(year) {
    var yearStart = new Date(year, 0, 1).getTime();
    var yearEnd = new Date(year + 1, 0, 1).getTime();
    var allPayments = storage_1.storage.getAllPayments(100000);
    var yearPayments = allPayments.filter(function (p) {
        var ts = new Date(p.createdAt).getTime();
        return ts >= yearStart && ts < yearEnd;
    });
    var paymentsByUser = new Map();
    for (var _i = 0, yearPayments_2 = yearPayments; _i < yearPayments_2.length; _i++) {
        var p = yearPayments_2[_i];
        if (!paymentsByUser.has(p.userId)) {
            paymentsByUser.set(p.userId, []);
        }
        paymentsByUser.get(p.userId).push(p);
    }
    var w9Forms = storage_1.storage.getW9Forms("verified");
    var w9ByUser = new Set(w9Forms.map(function (w) { return w.userId; }));
    var results = [];
    var entries = Array.from(paymentsByUser.entries());
    for (var _a = 0, entries_2 = entries; _a < entries_2.length; _a++) {
        var _b = entries_2[_a], userId = _b[0], userPayments = _b[1];
        var total = userPayments.reduce(function (sum, p) {
            if (p.status === "succeeded" || p.status === "paid") {
                return sum + p.amount;
            }
            return sum;
        }, 0);
        var profile = storage_1.storage.getProfile(userId);
        results.push({
            userId: userId,
            displayName: (profile === null || profile === void 0 ? void 0 : profile.displayName) || "User #".concat(userId),
            totalPaid: total,
            paymentCount: userPayments.length,
            w9Verified: w9ByUser.has(userId),
        });
    }
    return results.sort(function (a, b) { return b.totalPaid - a.totalPaid; });
}
