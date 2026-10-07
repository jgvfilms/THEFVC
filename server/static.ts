import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      const rel = path.relative(distPath, filePath).split(path.sep).join("/");
      // Vite fingerprints everything under assets/, so a changed file gets a new name.
      if (rel.startsWith("assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      // Portfolio stills and scripts keep their names when replaced: cache for a
      // day, then serve the cached copy while fetching the new one in the background.
      } else if (rel.startsWith("portfolio/")) {
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
