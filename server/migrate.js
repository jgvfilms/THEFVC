"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlite = void 0;
exports.runMigrations = runMigrations;
var better_sqlite3_1 = require("better-sqlite3");
var fs_1 = require("fs");
var path_1 = require("path");
var node_crypto_1 = require("node:crypto");
var sqlite = new better_sqlite3_1.default("data.db");
exports.sqlite = sqlite;
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON"); // PRD-018: Enable foreign key enforcement
// Idempotent migration: add new columns if they don't exist
// This ensures the published app doesn't crash when code references
// columns that the preserved production DB doesn't have yet.
var PROFILE_COLUMNS = [
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
var USER_COLUMNS = [
    { name: "is_admin", def: "INTEGER DEFAULT 0" },
    { name: "access_status", def: "TEXT DEFAULT 'active'" },
    { name: "invited_by", def: "INTEGER" },
    { name: "activated_at", def: "INTEGER" },
    { name: "last_login_at", def: "INTEGER" },
];
var NEW_TABLES = [
    "CREATE TABLE IF NOT EXISTS beta_invites (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    token TEXT NOT NULL UNIQUE,\n    email TEXT,\n    display_name TEXT,\n    role TEXT,\n    status TEXT NOT NULL DEFAULT 'active',\n    max_uses INTEGER NOT NULL DEFAULT 1,\n    used_count INTEGER NOT NULL DEFAULT 0,\n    created_by INTEGER NOT NULL REFERENCES users(id),\n    created_at INTEGER NOT NULL,\n    used_at INTEGER,\n    notes TEXT\n  )",
    "CREATE TABLE IF NOT EXISTS beta_requests (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    email TEXT NOT NULL,\n    handle TEXT,\n    display_name TEXT,\n    role TEXT,\n    city TEXT,\n    message TEXT,\n    status TEXT NOT NULL DEFAULT 'pending',\n    invite_id INTEGER,\n    created_at INTEGER NOT NULL,\n    approved_at INTEGER,\n    notes TEXT\n  )",
    "CREATE TABLE IF NOT EXISTS beta_feedback (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    category TEXT NOT NULL,\n    message TEXT NOT NULL,\n    page_url TEXT,\n    status TEXT NOT NULL DEFAULT 'new',\n    created_at INTEGER NOT NULL,\n    admin_notes TEXT\n  )",
    "CREATE TABLE IF NOT EXISTS activity_feed (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    type TEXT NOT NULL,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    target_type TEXT,\n    target_id INTEGER,\n    message TEXT,\n    metadata TEXT DEFAULT '{}',\n    is_public INTEGER DEFAULT 1,\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS feed_posts (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    body TEXT NOT NULL,\n    link_url TEXT,\n    visibility TEXT DEFAULT 'public',\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS security_audit_log (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER REFERENCES users(id),\n    action TEXT NOT NULL,\n    ip_address TEXT,\n    user_agent TEXT,\n    success INTEGER DEFAULT 1,\n    details TEXT DEFAULT '{}',\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS analytics_events (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER REFERENCES users(id),\n    event_type TEXT NOT NULL,\n    event_name TEXT,\n    properties TEXT DEFAULT '{}',\n    ip_address TEXT,\n    user_agent TEXT,\n    session_id TEXT,\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS email_queue (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    to TEXT NOT NULL,\n    from TEXT NOT NULL,\n    subject TEXT NOT NULL,\n    html TEXT NOT NULL,\n    text TEXT,\n    status TEXT NOT NULL DEFAULT 'pending',\n    provider TEXT DEFAULT 'resend',\n    provider_message_id TEXT,\n    retry_count INTEGER NOT NULL DEFAULT 0,\n    max_retries INTEGER NOT NULL DEFAULT 3,\n    scheduled_at INTEGER NOT NULL,\n    sent_at INTEGER,\n    failed_at INTEGER,\n    error TEXT,\n    metadata TEXT DEFAULT '{}',\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS password_resets (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    token TEXT NOT NULL UNIQUE,\n    email TEXT NOT NULL,\n    expires_at INTEGER NOT NULL,\n    used INTEGER DEFAULT 0,\n    used_at INTEGER,\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS email_verifications (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    email TEXT NOT NULL,\n    token TEXT NOT NULL UNIQUE,\n    expires_at INTEGER NOT NULL,\n    used INTEGER DEFAULT 0,\n    used_at INTEGER,\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS blocked_ips (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    ip_address TEXT NOT NULL UNIQUE,\n    reason TEXT NOT NULL,\n    blocked_by INTEGER REFERENCES users(id),\n    blocked_at INTEGER NOT NULL,\n    expires_at INTEGER,\n    is_active INTEGER DEFAULT 1\n  )",
    "CREATE TABLE IF NOT EXISTS news_cache (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    source TEXT NOT NULL,\n    title TEXT NOT NULL,\n    link TEXT NOT NULL,\n    description TEXT,\n    category TEXT NOT NULL,\n    pub_date INTEGER NOT NULL,\n    fetched_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS notifications (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    type TEXT NOT NULL,\n    title TEXT NOT NULL,\n    message TEXT,\n    link_url TEXT,\n    metadata TEXT DEFAULT '{}',\n    is_read INTEGER DEFAULT 0,\n    created_at INTEGER NOT NULL\n  )",
    // ===== PRD-007: Payments & Monetization =====
    "CREATE TABLE IF NOT EXISTS subscription_tiers (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL UNIQUE,\n    display_name TEXT NOT NULL,\n    price_cents INTEGER NOT NULL,\n    interval TEXT NOT NULL DEFAULT 'month',\n    features TEXT NOT NULL DEFAULT '[]',\n    max_productions INTEGER,\n    max_crew_members INTEGER,\n    stripe_price_id TEXT,\n    is_active INTEGER DEFAULT 1,\n    created_at INTEGER NOT NULL\n  )",
    "CREATE TABLE IF NOT EXISTS payments (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id),\n    stripe_payment_intent_id TEXT,\n    stripe_charge_id TEXT,\n    stripe_subscription_id TEXT,\n    amount INTEGER NOT NULL,\n    currency TEXT NOT NULL DEFAULT 'usd',\n    status TEXT NOT NULL,\n    description TEXT,\n    metadata TEXT DEFAULT '{}',\n    created_at INTEGER NOT NULL,\n    processed_at INTEGER\n  )",
    "CREATE TABLE IF NOT EXISTS w9_forms (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,\n    full_name TEXT NOT NULL,\n    business_name TEXT,\n    tax_classification TEXT NOT NULL,\n    ein_or_ssn TEXT NOT NULL,\n    address TEXT NOT NULL,\n    city TEXT NOT NULL,\n    state TEXT NOT NULL,\n    zip_code TEXT NOT NULL,\n    stripe_account_id TEXT,\n    status TEXT NOT NULL DEFAULT 'pending',\n    submitted_at INTEGER NOT NULL,\n    verified_at INTEGER\n  )",
];
function runMigrations() {
    // Profile columns
    var profileCols = sqlite.prepare("PRAGMA table_info(profiles)").all();
    var profileExisting = new Set(profileCols.map(function (c) { return c.name; }));
    for (var _i = 0, PROFILE_COLUMNS_1 = PROFILE_COLUMNS; _i < PROFILE_COLUMNS_1.length; _i++) {
        var col = PROFILE_COLUMNS_1[_i];
        if (!profileExisting.has(col.name)) {
            sqlite.exec("ALTER TABLE profiles ADD COLUMN ".concat(col.name, " ").concat(col.def));
            console.log("[migration] Added column profiles.".concat(col.name));
        }
    }
    // User columns
    var userCols = sqlite.prepare("PRAGMA table_info(users)").all();
    var userExisting = new Set(userCols.map(function (c) { return c.name; }));
    for (var _a = 0, USER_COLUMNS_1 = USER_COLUMNS; _a < USER_COLUMNS_1.length; _a++) {
        var col = USER_COLUMNS_1[_a];
        if (!userExisting.has(col.name)) {
            sqlite.exec("ALTER TABLE users ADD COLUMN ".concat(col.name, " ").concat(col.def));
            console.log("[migration] Added column users.".concat(col.name));
        }
    }
    // New tables
    for (var _b = 0, NEW_TABLES_1 = NEW_TABLES; _b < NEW_TABLES_1.length; _b++) {
        var sql = NEW_TABLES_1[_b];
        sqlite.exec(sql);
    }
    // PRD-018: Add indexes for performance on frequently queried columns
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);");
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_payments_stripe_sub ON payments(stripe_subscription_id);");
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent ON payments(stripe_payment_intent_id);");
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id);");
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_security_audit_action ON security_audit_log(action);");
    // Bootstrap admin: create jgvfilms@gmail.com if missing, always set is_admin
    var adminEmail = "jgvfilms@gmail.com";
    var adminUser = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
    if (!adminUser) {
        // Create admin user
        var salt = (0, node_crypto_1.randomBytes)(16).toString("hex");
        var hash = (0, node_crypto_1.scryptSync)("FVCbuf2024!", salt, 64).toString("hex");
        var now = Date.now();
        var result = sqlite.prepare("INSERT INTO users (handle, email, password_hash, is_admin, access_status, created_at) VALUES (?, ?, ?, 1, 'active', ?)").run("jgvfilms", adminEmail, "".concat(salt, ":").concat(hash), now);
        var adminId = result.lastInsertRowid;
        console.log("[migration] Created admin user id=".concat(adminId));
        // Create admin profile
        sqlite.prepare("INSERT INTO profiles (user_id, display_name, role, city, state, country, bio, avatar_initials, imdb_url, imdb_credits, website_url, theme_preset, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(adminId, "J. Garrett Vorreuter", "Director / Producer / Cinematographer", "Buffalo", "NY", "US", "Filmmaker and founder of the Film Video Collective. Director, producer, and cinematographer with credits spanning features, shorts, TV series, and music videos.", "JV", "https://www.imdb.com/name/nm7102371/", JSON.stringify([
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
        ]), "https://thefvc.is", "cinema_gold", now, now);
        console.log("[migration] Created admin profile");
    }
    else {
        sqlite.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(adminUser.id);
        // One-time password upgrade: if admin still has old default password, upgrade to new one
        var adminRow = sqlite.prepare("SELECT password_hash FROM users WHERE id = ?").get(adminUser.id);
        var _c = adminRow.password_hash.split(":"), oldSalt = _c[0], oldHash = _c[1];
        var oldVerify = (0, node_crypto_1.scryptSync)("admin123", oldSalt, 64).toString("hex");
        if (oldVerify === oldHash) {
            var newSalt = (0, node_crypto_1.randomBytes)(16).toString("hex");
            var newHash = (0, node_crypto_1.scryptSync)("FVCbuf2024!", newSalt, 64).toString("hex");
            sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run("".concat(newSalt, ":").concat(newHash), adminUser.id);
            console.log("[migration] Upgraded admin password from default");
        }
        // Also ensure profile exists
        var adminProfile = sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(adminUser.id);
        if (!adminProfile) {
            sqlite.prepare("INSERT INTO profiles (user_id, display_name, role, city, state, country, bio, avatar_initials, imdb_url, website_url, theme_preset, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(adminUser.id, "J. Garrett Vorreuter", "Director / Producer / Cinematographer", "Buffalo", "NY", "US", "Filmmaker and founder of the Film Video Collective.", "JV", "https://www.imdb.com/name/nm7102371/", "https://thefvc.is", "cinema_gold", Date.now(), Date.now());
            console.log("[migration] Created admin profile for existing user");
        }
    }
    // Ensure uploads directory exists
    var uploadsDir = (0, path_1.join)(process.cwd(), "uploads", "profiles");
    if (!(0, fs_1.existsSync)(uploadsDir)) {
        (0, fs_1.mkdirSync)(uploadsDir, { recursive: true });
    }
    // Backfill activity feed from existing data
    var feedCount = sqlite.prepare("SELECT COUNT(*) as count FROM activity_feed").get();
    if (feedCount.count === 0) {
        var existingUsers = sqlite.prepare("SELECT id, handle, created_at FROM users ORDER BY created_at ASC").all();
        for (var _d = 0, existingUsers_1 = existingUsers; _d < existingUsers_1.length; _d++) {
            var u = existingUsers_1[_d];
            sqlite.prepare("INSERT INTO activity_feed (type, user_id, target_type, message, is_public, created_at) VALUES (?, ?, ?, ?, 1, ?)").run("member_joined", u.id, "user", "just joined thefvc", u.created_at);
        }
        console.log("[migration] Backfilled ".concat(existingUsers.length, " member_joined activities"));
        // Update old join messages
        sqlite.prepare("UPDATE activity_feed SET message = 'just joined thefvc' WHERE type = 'member_joined' AND message = 'joined the collective'").run();
        var existingProds = sqlite.prepare("SELECT id, creator_id, title, created_at FROM productions ORDER BY created_at ASC").all();
        for (var _e = 0, existingProds_1 = existingProds; _e < existingProds_1.length; _e++) {
            var p = existingProds_1[_e];
            sqlite.prepare("INSERT INTO activity_feed (type, user_id, target_type, target_id, message, is_public, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").run("production_created", p.creator_id, "production", p.id, "started production \"".concat(p.title, "\""), p.created_at);
        }
        console.log("[migration] Backfilled ".concat(existingProds.length, " production_created activities"));
    }
    // Always update old join messages (outside the if block so it runs every time)
    sqlite.prepare("UPDATE activity_feed SET message = 'just joined thefvc' WHERE type = 'member_joined' AND message = 'joined the collective'").run();
}
runMigrations();
