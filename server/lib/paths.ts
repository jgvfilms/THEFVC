import { join } from "node:path";

// Configurable via UPLOADS_DIR so uploaded files (avatars, cover photos)
// land on the same persistent volume as the database (see DATABASE_PATH),
// not the container's ephemeral filesystem. Previously hardcoded to
// process.cwd()/uploads, which is wiped on every redeploy — exactly the
// same class of bug RATE_LIMIT_DIR already fixes for the rate-limit store.
export const UPLOADS_ROOT = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
export const PROFILE_UPLOADS_DIR = join(UPLOADS_ROOT, "profiles");
