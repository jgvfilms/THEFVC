import cron from "node-cron";
import { log } from "../lib/logger";
import { processEmailQueue } from "../email/queue";
import { cleanupExpiredBlocks } from "../middleware/rateLimit";
import { runDunningPass } from "./dunning";

// Track scheduled tasks for graceful shutdown
const scheduledTasks: cron.ScheduledTask[] = [];

/**
 * Start the background job scheduler.
 * All jobs run in-process (monolith) as per the architecture decision.
 */
export function startJobScheduler(): void {
  // Process email queue every 2 minutes
  const emailJob = cron.schedule("*/2 * * * *", async () => {
    try {
      const result = await processEmailQueue();
      if (result.sent > 0 || result.failed > 0) {
        log(`[jobs] Email queue: ${result.sent} sent, ${result.failed} failed`, "jobs");
      }
    } catch (err) {
      log(`[jobs] Email queue error: ${err}`, "jobs");
    }
  });
  scheduledTasks.push(emailJob);

  // Clean up expired blocked IPs every hour
  const cleanupJob = cron.schedule("0 * * * *", async () => {
    try {
      const cleaned = await cleanupExpiredBlocks();
      if (cleaned > 0) {
        log(`[jobs] Cleaned up ${cleaned} expired IP blocks`, "jobs");
      }
    } catch (err) {
      log(`[jobs] IP cleanup error: ${err}`, "jobs");
    }
  });
  scheduledTasks.push(cleanupJob);

  // Invoice follow-ups every 15 minutes.
  //
  // SINGLE WORKER ONLY. If this app is ever scaled past one instance, this job
  // must move to a dedicated single-replica service or be guarded by a lock —
  // otherwise every instance sends the same reminder.
  const dunningJob = cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await runDunningPass();
      if (result.queued > 0 || result.failed > 0) {
        log(
          `[jobs] Dunning: ${result.queued} queued, ${result.skipped} skipped, ${result.failed} failed`,
          "jobs"
        );
      }
    } catch (err) {
      log(`[jobs] Dunning error: ${err}`, "jobs");
    }
  });
  scheduledTasks.push(dunningJob);

  // Log scheduler start
  log(`[jobs] Background job scheduler started (email queue + IP cleanup + invoice dunning)`, "jobs");
}

/**
 * Stop all scheduled jobs (for graceful shutdown).
 */
export function stopJobScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  log("[jobs] Background job scheduler stopped", "jobs");
}

/**
 * Run a one-off job immediately (useful for testing or manual triggers).
 */
export async function runJobNow(jobName: string): Promise<string> {
  switch (jobName) {
    case "email":
      const result = await processEmailQueue();
      return `Email queue: ${result.sent} sent, ${result.failed} failed`;
    case "cleanup":
      const cleaned = await cleanupExpiredBlocks();
      return `Cleaned up ${cleaned} expired IP blocks`;
    case "dunning":
      const dunning = await runDunningPass();
      return `Dunning: ${dunning.queued} queued, ${dunning.skipped} skipped, ${dunning.failed} failed`;
    default:
      return `Unknown job: ${jobName}`;
  }
}
