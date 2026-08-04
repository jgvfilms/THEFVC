import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { randomUUID } from "node:crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { startJobScheduler, stopJobScheduler } from "./jobs";
import { securityHeaders } from "./middleware/securityHeaders";
import { sanitize } from "./middleware/sanitize";
import { rateLimit } from "./middleware/rateLimit";
import { log } from "./lib/logger";
import { wss } from "./ws";

// Import migrate to run idempotent column additions on startup
import "./migrate";

const app = express();
const httpServer = createServer(app);

// Ensure uploads directory exists
const uploadsDir = join(process.cwd(), "uploads", "profiles");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use("/uploads", express.static(join(process.cwd(), "uploads")));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Extend Express Request to include requestId
declare module "express" {
  interface Request {
    requestId?: string;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Apply security middleware
app.use(securityHeaders);
app.use(sanitize);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, identifier: "global" }));

// Start background job scheduler
startJobScheduler();

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// PRD-018v2: Request ID middleware — attach unique ID to every request for audit trail correlation
app.use((req: any, res: any, next: any) => {
  req.requestId = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);

  // WebSocket upgrade handler (PRD-009: Real-Time & WebSocket)
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
