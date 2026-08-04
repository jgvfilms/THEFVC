/**
 * Shared request/process logger.
 *
 * Pulled out of server/index.ts so that modules which only need to log
 * (server/routes.ts, server/jobs/scheduler.ts) don't have to import
 * server/index.ts itself to get it. server/index.ts is the app entry
 * point — it builds the Express app and, at the bottom of the module,
 * immediately starts listening on a real port as a side effect of being
 * imported. Importing it just for `log()` created a circular dependency
 * (index.ts -> routes.ts -> index.ts, and index.ts -> jobs -> scheduler.ts
 * -> index.ts) that made every test importing server/routes.ts transitively
 * re-trigger that startup side effect, and — depending on how vite-node's
 * SSR transform handles the circular live bindings — occasionally throw
 * "Cannot access '<binding>' before initialization" while doing so.
 */
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
