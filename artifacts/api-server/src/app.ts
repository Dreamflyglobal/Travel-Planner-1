import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOADS_DIR } from "./lib/uploads.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(cookieParser());

// Increase JSON body size limit to 20 MB so base64-encoded logo / favicon
// data URLs (stored directly in the settings DB) can be saved without a 413.
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ── Uploaded assets (logos, favicons) ────────────────────────────────────────
// Served at /uploads/<filename> in both dev and production.
// In dev the Vite proxy already forwards /uploads → port 8080.
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));

// ── API routes (/api/*) ──────────────────────────────────────────────────────
app.use("/api", router);

// ── Production static file serving ──────────────────────────────────────────
// When deployed, Express serves the Vite-built frontend so both share the same
// origin — no CORS or proxy config needed on the client side.
//
// Build order: pnpm --filter @workspace/travel-booking run build  THEN
//              pnpm --filter @workspace/api-server  run build
//
// At runtime `import.meta.url` resolves to dist/index.mjs, so ../../travel-booking
// points at  artifacts/travel-booking/dist/public correctly.
if (process.env.NODE_ENV === "production") {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const staticDir  = resolve(currentDir, "../../travel-booking/dist/public");

  if (existsSync(staticDir)) {
    logger.info({ staticDir }, "Serving frontend static files");
    app.use(express.static(staticDir, { maxAge: "1d", index: false }));

    // SPA catch-all — any non-/api route gets index.html so client-side routing works
    app.use((_req, res) => {
      res.sendFile(join(staticDir, "index.html"));
    });
  } else {
    logger.warn(
      { staticDir },
      "Frontend build not found — serving API only. Run the travel-booking build first.",
    );
  }
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status  = err?.status ?? err?.statusCode ?? 500;
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : (err?.message ?? "Internal server error");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
