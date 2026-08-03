# Deploying THEFVC.IS to Railway

This covers getting `thefvc-deploy-ready.bundle` into a live, shareable URL on Railway,
with data that actually survives redeploys.

## What's different in this bundle

Two files were changed from what you sent (`drizzle.config.ts` and `server/migrate.ts`).
The app's `.env.example` documents a `DATABASE_PATH` variable, but nothing in the code
actually read it — the SQLite file path was hardcoded to `data.db`. That's fine on a
single machine, but it means there was no way to point the database at a persistent
volume, which Railway (or any host) needs in order to keep your data across deploys.
Both files now respect `DATABASE_PATH`, falling back to the old default for local dev.
Verified locally: production build + start against both the default path and a custom
`DATABASE_PATH` pointing at a separate directory.

Nothing else was touched — no feature or business logic changes.

## Step 1 — Get the code onto GitHub ✅ done

The code is live at https://github.com/jgvfilms/THEFVC — full commit history, verified
directly against the remote.

## Step 2 — Create the Railway project

1. Sign in at railway.app, click **New Project → Deploy from GitHub repo**, pick the
   repo you just pushed.
2. Railway auto-detects this as a Node app (via Nixpacks) and will run `npm install`,
   then `npm run build`, then `npm start` — no config file needed, that's exactly what
   was verified locally.

## Step 3 — Add a persistent volume

By default, a Railway container's filesystem resets on every redeploy — same problem
as before, just on a different host. Fix:

1. In the service, go to **Settings → Volumes → New Volume**.
2. Mount path: `/data`
3. In **Variables**, set:

```
   DATABASE_PATH=/data/thefvc.db
```

## Step 4 — Set the rest of the environment variables

In the Railway service's **Variables** tab, add (see `.env.example` in the repo for
the full list):

| Variable | What to put |
|---|---|
| `ENCRYPTION_KEY` | Generate fresh: `openssl rand -hex 32` — **don't** reuse any key from local testing |
| `SESSION_SECRET` | Generate fresh the same way |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Real credentials for the first admin account |
| `PAYER_TIN` | Real EIN if you want 1099 generation to work; leave blank to test everything else first |
| `DATABASE_PATH` | `/data/thefvc.db` (from Step 3) |
| `RATE_LIMIT_DIR` | `/data` — same volume as above, or rate-limit state resets on every redeploy |
| `NODE_ENV` | `production` |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_CLIENT_ID` | Use **test-mode** Stripe keys for now — leave blank if you're not testing payments yet |

## Step 5 — Deploy

Railway deploys automatically once variables are set. You'll get a live URL in the
form `<project>.up.railway.app` — that's your real, shareable test link.

## Step 6 — Run the first-time schema setup

The very first deploy needs its database tables created. Easiest path: open the
service's **Shell** tab in Railway's dashboard (or use the Railway CLI) and run:

```bash
npm run db:push -- --force
```

Only needs to happen once — after that, `server/migrate.ts` handles any future
column additions automatically on startup.

## Later — pointing thefvc.is at it

Once you're happy with what's on the `.up.railway.app` URL, add it as a custom
domain in Railway's **Settings → Networking**, then update your DNS for thefvc.is
to match what Railway gives you.

## Before this touches real users

This app handles SSNs/EINs and real payments. The codebase's own review docs
(`REVIEW_REPORT_SPRINT5_PRD018_022.md`) flag several things worth a second look —
treat that as a starting checklist, not a clean bill of health, before onboarding
real members.
