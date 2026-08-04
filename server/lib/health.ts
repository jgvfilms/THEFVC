/**
 * PRD-023v2: Infrastructure Health Monitoring
 * Basic health check endpoint for operational visibility.
 */
import { sqlite } from "../migrate";
import { statfsSync } from "node:fs";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    database: { status: string; latencyMs: number };
    disk: { status: string; freeGB: number };
  };
}

export async function getHealth(): Promise<HealthCheck> {
  const checks = {
    database: await checkDatabase(),
    disk: checkDisk(),
  };

  const hasUnhealthy = Object.values(checks).some(c => c.status === "unhealthy");
  const hasDegraded = Object.values(checks).some(c => c.status === "degraded");

  return {
    status: hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    checks,
  };
}

async function checkDatabase(): Promise<{ status: string; latencyMs: number }> {
  try {
    const start = Date.now();
    sqlite.prepare("SELECT 1").get();
    const latencyMs = Date.now() - start;
    return { status: latencyMs < 1000 ? "healthy" : "degraded", latencyMs };
  } catch {
    return { status: "unhealthy", latencyMs: -1 };
  }
}

function checkDisk(): { status: string; freeGB: number } {
  try {
    // fs.statfsSync is cross-platform (unlike shelling out to `df`, whose
    // flags differ between GNU/Linux and BSD/macOS — `df -BG` is GNU-only
    // and errors out on macOS, silently degrading this check).
    const stats = statfsSync(process.cwd());
    const freeGB = (stats.bavail * stats.bsize) / 1024 ** 3;
    const freeGBRounded = Math.floor(freeGB);
    return { status: freeGB > 1 ? "healthy" : freeGB > 0 ? "degraded" : "unhealthy", freeGB: freeGBRounded };
  } catch {
    return { status: "unknown", freeGB: -1 };
  }
}
