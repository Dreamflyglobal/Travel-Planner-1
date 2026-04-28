import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes (/api/*) ──────────────────────────────────────────────────────
app.use("/api", router);

// ── Production static file serving ──────────────────────────────────────────
// When deployed as a single service (Railway, Render, etc.), the Express server
// also serves the Vite-built frontend so both share the same origin — no CORS or
// proxy config required on the client side.
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
    app.get("*", (_req, res) => {
      res.sendFile(join(staticDir, "index.html"));
    });
  } else {
    logger.warn(
      { staticDir },
      "Frontend build not found — serving API only. Run the travel-booking build first.",
    );
  }
}

export default app;
