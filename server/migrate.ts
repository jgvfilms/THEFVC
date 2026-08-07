import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { scryptSync, randomBytes } from "node:crypto";
import { encryptSensitive } from "./lib/encryption";
import { PROFILE_UPLOADS_DIR } from "./lib/paths";

// Respects DATABASE_PATH so deploy targets with a mounted persistent
// volume (e.g. Railway) can point this at a durable path. Falls back
// to the historical relative "data.db" for local dev.
const dbPath = process.env.DATABASE_PATH || "data.db";
const dbDir = dirname(dbPath);
if (dbDir && dbDir !== ".") {
  mkdirSync(dbDir, { recursive: true });
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON"); // PRD-018: Enable foreign key enforcement

// Idempotent migration: add new columns if they don't exist
// This ensures the published app doesn't crash when code references
// columns that the preserved production DB doesn't have yet.
const PROFILE_COLUMNS: Array<{ name: string; def: string }> = [
  { name: "avatar_url", def: "TEXT" },
  { name: "cover_url", def: "TEXT" },
  { name: "theme_preset", def: "TEXT DEFAULT 'cinema_gold'" },
  { name: "accent_color", def: "TEXT" },
  { name: "video_links", def: "TEXT DEFAULT '[]'" },
  { name: "social_links", def: "TEXT DEFAULT '{}'" },
  { name: "imdb_credits", def: "TEXT DEFAULT '[]'" },
  // PRD-007: Payments & Monetization — subscription columns
  { name: "stripe_customer_id", def: "TEXT" },
  { name: "stripe_connect_account_id", def: "TEXT" },
  { name: "subscription_tier", def: "TEXT DEFAULT 'free'" },
  { name: "subscription_status", def: "TEXT DEFAULT 'inactive'" },
  { name: "w9_collected", def: "INTEGER DEFAULT 0" },
];

const USER_COLUMNS: Array<{ name: string; def: string }> = [
  { name: "is_admin", def: "INTEGER DEFAULT 0" },
  { name: "access_status", def: "TEXT DEFAULT 'active'" },
  { name: "invited_by", def: "INTEGER" },
  { name: "activated_at", def: "INTEGER" },
  { name: "last_login_at", def: "INTEGER" },
  { name: "google_id", def: "TEXT" },
];

const BLOCKED_IPS_COLUMNS: Array<{ name: string; def: string }> = [
  { name: "scope", def: "TEXT" },
];

const NEW_TABLES = [
  `CREATE TABLE IF NOT EXISTS beta_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    email TEXT,
    display_name TEXT,
    role TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS beta_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    handle TEXT,
    display_name TEXT,
    role TEXT,
    city TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    invite_id INTEGER,
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS beta_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    page_url TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at INTEGER NOT NULL,
    admin_notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity_feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    target_type TEXT,
    target_id INTEGER,
    message TEXT,
    metadata TEXT DEFAULT '{}',
    is_public INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS feed_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    link_url TEXT,
    visibility TEXT DEFAULT 'public',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS security_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1,
    details TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL
   ,request_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    event_type TEXT NOT NULL,
    event_name TEXT,
    properties TEXT DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    session_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    html TEXT NOT NULL,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT DEFAULT 'resend',
    provider_message_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    scheduled_at INTEGER NOT NULL,
    sent_at INTEGER,
    failed_at INTEGER,
    error TEXT,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS blocked_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    scope TEXT,
    blocked_by INTEGER REFERENCES users(id),
    blocked_at INTEGER NOT NULL,
    expires_at INTEGER,
    is_active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS news_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    pub_date INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link_url TEXT,
    metadata TEXT DEFAULT '{}',
    is_read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  // ===== PRD-007: Payments & Monetization =====
  `CREATE TABLE IF NOT EXISTS subscription_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    interval TEXT NOT NULL DEFAULT 'month',
    features TEXT NOT NULL DEFAULT '[]',
    max_productions INTEGER,
    max_crew_members INTEGER,
    stripe_price_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    stripe_subscription_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL,
    description TEXT,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    processed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS w9_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
    full_name TEXT NOT NULL,
    business_name TEXT,
    tax_classification TEXT NOT NULL,
    ein_or_ssn TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    stripe_account_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_at INTEGER NOT NULL,
    verified_at INTEGER
  )`,
  // ===== INVOICING =====
  `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    stripe_invoice_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    issuer_user_id INTEGER REFERENCES users(id),
    recipient_user_id INTEGER NOT NULL REFERENCES users(id),
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    production_id INTEGER REFERENCES productions(id),
    status TEXT NOT NULL DEFAULT 'draft',
    currency TEXT NOT NULL DEFAULT 'usd',
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    amount_paid_cents INTEGER NOT NULL DEFAULT 0,
    amount_due_cents INTEGER NOT NULL DEFAULT 0,
    due_date INTEGER,
    issued_at INTEGER,
    paid_at INTEGER,
    voided_at INTEGER,
    hosted_invoice_url TEXT,
    invoice_pdf_url TEXT,
    memo TEXT,
    internal_note TEXT,
    reminders_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_profile TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    stripe_invoice_item_id TEXT,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_amount_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    offset_days INTEGER NOT NULL,
    send_at INTEGER NOT NULL,
    tone TEXT NOT NULL DEFAULT 'neutral',
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at INTEGER,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE(invoice_id, offset_days)
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    payload TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER,
    error TEXT
  )`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_recipient ON invoices(recipient_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_reminders_pending ON invoice_reminders(status, send_at)`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events(invoice_id, created_at)`,
  // Unique so a Google account can never be linked to two FVC users. Partial,
  // because every password-only row has google_id NULL.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`,
];

export function runMigrations() {
  // Profile columns
  const profileCols = sqlite.prepare("PRAGMA table_info(profiles)").all() as Array<{ name: string }>;
  const profileExisting = new Set(profileCols.map((c) => c.name));
  for (const col of PROFILE_COLUMNS) {
    if (!profileExisting.has(col.name)) {
      sqlite.exec(`ALTER TABLE profiles ADD COLUMN ${col.name} ${col.def}`);
      console.log(`[migration] Added column profiles.${col.name}`);
    }
  }

  // User columns
  const userCols = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const userExisting = new Set(userCols.map((c) => c.name));
  for (const col of USER_COLUMNS) {
    if (!userExisting.has(col.name)) {
      sqlite.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`);
      console.log(`[migration] Added column users.${col.name}`);
    }
  }

  // New tables
  for (const sql of NEW_TABLES) {
    sqlite.exec(sql);
  }

  // Indexes (after tables exist)
  for (const sql of INDEXES) {
    sqlite.exec(sql);
  }

  // blocked_ips columns (table itself created above via NEW_TABLES, but
  // CREATE TABLE IF NOT EXISTS is a no-op on an already-existing table, so
  // new columns on it still need the same idempotent ALTER TABLE pattern)
  const blockedIpsCols = sqlite.prepare("PRAGMA table_info(blocked_ips)").all() as Array<{ name: string }>;
  const blockedIpsExisting = new Set(blockedIpsCols.map((c) => c.name));
  for (const col of BLOCKED_IPS_COLUMNS) {
    if (!blockedIpsExisting.has(col.name)) {
      sqlite.exec(`ALTER TABLE blocked_ips ADD COLUMN ${col.name} ${col.def}`);
      console.log(`[migration] Added column blocked_ips.${col.name}`);
    }
  }

  // PRD-018: Add indexes for performance on frequently queried columns
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_payments_stripe_sub ON payments(stripe_subscription_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent ON payments(stripe_payment_intent_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_security_audit_action ON security_audit_log(action);`);

  // PRD-022v2: Add UNIQUE constraint on subscription_tiers.name
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_tiers_name ON subscription_tiers(name);`);

  // Bootstrap admin
  const auditCols = sqlite.prepare("PRAGMA table_info(security_audit_log)").all() as Array<{ name: string }>;
  if (!auditCols.some((c) => c.name === "request_id")) {
    sqlite.exec(`ALTER TABLE security_audit_log ADD COLUMN request_id TEXT`);
    console.log("[migration] Added column security_audit_log.request_id");
  }

  // PRD-018v2: One-time migration — encrypt existing plaintext Stripe IDs
  const profilesToEncrypt = sqlite.prepare(
    "SELECT id, user_id, stripe_customer_id, stripe_connect_account_id FROM profiles WHERE stripe_customer_id IS NOT NULL OR stripe_connect_account_id IS NOT NULL"
  ).all() as Array<{ id: number; user_id: number; stripe_customer_id: string | null; stripe_connect_account_id: string | null }>;
  for (const p of profilesToEncrypt) {
    const updates: string[] = [];
    const params: any[] = [];
    if (p.stripe_customer_id && p.stripe_customer_id.startsWith("cus_")) {
      updates.push("stripe_customer_id = ?");
      params.push(encryptSensitive(p.stripe_customer_id));
    }
    if (p.stripe_connect_account_id && p.stripe_connect_account_id.startsWith("acct_")) {
      updates.push("stripe_connect_account_id = ?");
      params.push(encryptSensitive(p.stripe_connect_account_id));
    }
    if (updates.length > 0) {
      params.push(p.id);
      sqlite.prepare(`UPDATE profiles SET ${updates.join(", ")} WHERE id = ?`).run(...params);
      console.log(`[migration] Encrypted Stripe IDs for profile id=${p.id}`);
    }
  }

  // Bootstrap admin: create from env vars if missing, always set is_admin
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.warn("[migration] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin bootstrap");
  } else {
  const adminUser = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail) as { id: number } | undefined;
  if (!adminUser) {
    // Create admin user
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(adminPassword, salt, 64).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const result = sqlite.prepare(
      "INSERT INTO users (handle, email, password_hash, is_admin, access_status, created_at) VALUES (?, ?, ?, 1, 'active', ?)"
    ).run("jgvfilms", adminEmail, `${salt}:${hash}`, now);
    const adminId = result.lastInsertRowid as number;
    console.log(`[migration] Created admin user id=${adminId}`);

    // Create admin profile
    sqlite.prepare(
      "INSERT INTO profiles (user_id, display_name, role, city, state, country, bio, avatar_initials, imdb_url, imdb_credits, website_url, theme_preset, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(
      adminId,
      "J. Garrett Vorreuter",
      "Director / Producer / Cinematographer",
      "Buffalo", "NY", "US",
      "Filmmaker and founder of the Film Video Collective. Director, producer, and cinematographer with credits spanning features, shorts, TV series, and music videos.",
      "JV",
      "https://www.imdb.com/name/nm7102371/",
      JSON.stringify([
        { title: "Unbillievable", year: 2023, role: "Director", rating: "7.8", imdbUrl: "https://www.imdb.com/title/tt27449919/" },
        { title: "Unbillievable", year: 2023, role: "Producer", rating: "7.8", imdbUrl: "https://www.imdb.com/title/tt27449919/" },
        { title: "If She Screams", year: 2021, role: "Director", rating: "3.1", imdbUrl: "https://www.imdb.com/title/tt8278572/" },
        { title: "If She Screams", year: 2021, role: "Writer", rating: "3.1", imdbUrl: "https://www.imdb.com/title/tt8278572/" },
        { title: "Making Peace", year: 2021, role: "Co-Producer", rating: "9.0", imdbUrl: null },
        { title: "The Lovers' Pas de Deux", year: 2020, role: "Producer", rating: null, imdbUrl: null },
        { title: "Spent Saints & Other Stories", year: 2019, role: "Director", rating: null, imdbUrl: null },
        { title: "Spent Saints & Other Stories", year: 2019, role: "Cinematographer", rating: null, imdbUrl: null },
        { title: "My Friend, Tucker", year: 2019, role: "Cinematographer", rating: "6.8", imdbUrl: null },
        { title: "The Rainbow Bridge Motel", year: 2018, role: "Director", rating: "4.2", imdbUrl: "https://www.imdb.com/title/tt6492186/" },
        { title: "The Rainbow Bridge Motel", year: 2018, role: "Producer", rating: "4.2", imdbUrl: "https://www.imdb.com/title/tt6492186/" },
        { title: "Cecilia", year: 2018, role: "Cinematographer", rating: null, imdbUrl: null },
        { title: "Trickster", year: 2018, role: "Cinematographer", rating: "3.3", imdbUrl: null },
        { title: "Mojave", year: 2017, role: "Cinematographer", rating: null, imdbUrl: null },
        { title: "American Portrait", year: 2017, role: "Cinematographer", rating: null, imdbUrl: null },
        { title: "Sophie: Quai du Louvre", year: 2016, role: "Cinematographer", rating: null, imdbUrl: null },
        { title: "One Night Stay", year: 2016, role: "Director", rating: null, imdbUrl: "https://www.imdb.com/title/tt5720024/" },
        { title: "One Night Stay", year: 2016, role: "Writer", rating: null, imdbUrl: "https://www.imdb.com/title/tt5720024/" },
        { title: "Loyal to the Game", year: 2015, role: "Producer", rating: "9.6", imdbUrl: null },
        { title: "Wild Orkids", year: null, role: "Director", rating: null, imdbUrl: null },
      ]),
      "https://thefvc.is",
      "cinema_gold",
      now, now
    );
    console.log(`[migration] Created admin profile`);
  } else {
    sqlite.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(adminUser.id);
    // One-time password upgrade: if admin still has old default password, upgrade to new one
    const adminRow = sqlite.prepare("SELECT password_hash FROM users WHERE id = ?").get(adminUser.id) as { password_hash: string };
    const [oldSalt, oldHash] = adminRow.password_hash.split(":");
    const oldVerify = scryptSync("admin123", oldSalt, 64).toString("hex");
    if (oldVerify === oldHash) {
      const newSalt = randomBytes(16).toString("hex");
      const newHash = scryptSync(adminPassword, newSalt, 64).toString("hex");
      sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(`${newSalt}:${newHash}`, adminUser.id);
      console.log("[migration] Upgraded admin password from default");
    }
    // Also ensure profile exists
    const adminProfile = sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(adminUser.id) as { id: number } | undefined;
    if (!adminProfile) {
      sqlite.prepare(
        "INSERT INTO profiles (user_id, display_name, role, city, state, country, bio, avatar_initials, imdb_url, website_url, theme_preset, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
      ).run(
        adminUser.id, "J. Garrett Vorreuter", "Director / Producer / Cinematographer", "Buffalo", "NY", "US",
        "Filmmaker and founder of the Film Video Collective.", "JV",
        "https://www.imdb.com/name/nm7102371/", "https://thefvc.is", "cinema_gold", Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
      );
      console.log(`[migration] Created admin profile for existing user`);
    }
  }
  } // end else (ADMIN_EMAIL/ADMIN_PASSWORD set)

  // Ensure uploads directory exists
  if (!existsSync(PROFILE_UPLOADS_DIR)) {
    mkdirSync(PROFILE_UPLOADS_DIR, { recursive: true });
  }

  // Backfill activity feed from existing data
  const feedCount = sqlite.prepare("SELECT COUNT(*) as count FROM activity_feed").get() as { count: number };
  if (feedCount.count === 0) {
    const existingUsers = sqlite.prepare("SELECT id, handle, created_at FROM users ORDER BY created_at ASC").all() as Array<{ id: number; handle: string; created_at: number }>;
    for (const u of existingUsers) {
      sqlite.prepare("INSERT INTO activity_feed (type, user_id, target_type, message, is_public, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(
        "member_joined", u.id, "user", "just joined thefvc", u.created_at
      );
    }
    console.log(`[migration] Backfilled ${existingUsers.length} member_joined activities`);

    // Update old join messages
    sqlite.prepare("UPDATE activity_feed SET message = 'just joined thefvc' WHERE type = 'member_joined' AND message = 'joined the collective'").run();

    const existingProds = sqlite.prepare("SELECT id, creator_id, title, created_at FROM productions ORDER BY created_at ASC").all() as Array<{ id: number; creator_id: number; title: string; created_at: number }>;
    for (const p of existingProds) {
      sqlite.prepare("INSERT INTO activity_feed (type, user_id, target_type, target_id, message, is_public, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").run(
        "production_created", p.creator_id, "production", p.id, `started production \"${p.title}\"`, p.created_at
      );
    }
    console.log(`[migration] Backfilled ${existingProds.length} production_created activities`);
  }

  // Always update old join messages (outside the if block so it runs every time)
  sqlite.prepare("UPDATE activity_feed SET message = 'just joined thefvc' WHERE type = 'member_joined' AND message = 'joined the collective'").run();
}

runMigrations();

export { sqlite };
