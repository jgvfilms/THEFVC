/**
 * One-off: run when production switches from Stripe test keys to live keys.
 *
 * Stripe IDs minted in test mode don't exist in live mode, so anything that
 * reuses one fails ("No such customer"). This clears the stored IDs so live
 * mode lazily creates fresh ones, and cancels reminders for invoices that only
 * exist in test mode. Rows themselves are kept as history.
 *
 *   DATABASE_PATH=/data/thefvc.db node script/reset-stripe-test-ids.cjs          # dry run
 *   DATABASE_PATH=/data/thefvc.db node script/reset-stripe-test-ids.cjs --apply  # backs up, then changes
 *
 * Run it in the same breath as swapping the Railway keys: after the swap and
 * before anyone sends an invoice. It is idempotent.
 */
const Database = require("better-sqlite3");
const fs = require("node:fs");

const dbPath = process.env.DATABASE_PATH;
if (!dbPath || !fs.existsSync(dbPath)) {
  console.error("Set DATABASE_PATH to the SQLite file (it must exist).");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

if (apply) {
  const backup = `${dbPath}.pre-stripe-live-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  // VACUUM INTO gives a consistent copy even with WAL files present.
  const src = new Database(dbPath, { readonly: true });
  src.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  src.close();
  console.log(`Backup written: ${backup}`);
}

const db = new Database(dbPath);

const steps = [
  {
    label: "profiles with a Stripe customer ID",
    count: "SELECT COUNT(*) AS n FROM profiles WHERE stripe_customer_id IS NOT NULL",
    change: "UPDATE profiles SET stripe_customer_id = NULL WHERE stripe_customer_id IS NOT NULL",
  },
  {
    label: "profiles with a Connect account ID",
    count: "SELECT COUNT(*) AS n FROM profiles WHERE stripe_connect_account_id IS NOT NULL",
    change: "UPDATE profiles SET stripe_connect_account_id = NULL WHERE stripe_connect_account_id IS NOT NULL",
  },
  {
    label: "W-9 rows with a Stripe account ID",
    count: "SELECT COUNT(*) AS n FROM w9_forms WHERE stripe_account_id IS NOT NULL",
    change: "UPDATE w9_forms SET stripe_account_id = NULL WHERE stripe_account_id IS NOT NULL",
  },
  {
    label: "subscription tiers with a Stripe price ID",
    count: "SELECT COUNT(*) AS n FROM subscription_tiers WHERE stripe_price_id IS NOT NULL",
    change: "UPDATE subscription_tiers SET stripe_price_id = NULL WHERE stripe_price_id IS NOT NULL",
  },
  {
    label: "pending reminders on Stripe-linked invoices",
    count:
      "SELECT COUNT(*) AS n FROM invoice_reminders WHERE status = 'pending' AND invoice_id IN (SELECT id FROM invoices WHERE stripe_invoice_id IS NOT NULL)",
    change:
      "UPDATE invoice_reminders SET status = 'cancelled' WHERE status = 'pending' AND invoice_id IN (SELECT id FROM invoices WHERE stripe_invoice_id IS NOT NULL)",
  },
  {
    label: "invoices with a stored Stripe customer ID",
    count: "SELECT COUNT(*) AS n FROM invoices WHERE stripe_customer_id IS NOT NULL",
    change: "UPDATE invoices SET stripe_customer_id = NULL WHERE stripe_customer_id IS NOT NULL",
  },
];

const run = db.transaction(() => {
  for (const s of steps) {
    const n = db.prepare(s.count).get().n;
    console.log(`${apply ? "Clearing" : "Would clear"} ${n} ${s.label}`);
    if (apply && n > 0) db.prepare(s.change).run();
  }
});
run();

const kept = db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE stripe_invoice_id IS NOT NULL").get();
console.log(
  `${kept.n} invoice(s) keep their test-mode stripe_invoice_id as history; ` +
    `the sync button on those will 404 against live Stripe, which is expected.`
);
console.log(apply ? "Done." : "Dry run only. Re-run with --apply to change anything.");
db.close();
