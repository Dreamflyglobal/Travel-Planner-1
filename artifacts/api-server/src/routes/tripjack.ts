import { Router, type IRouter } from "express";
import { tjPostWithRetry, handleTjError } from "../lib/tj-retry.js";

const router: IRouter = Router();

// ── POST /api/search → /fms/v1/air/search ─────────────────────────────────
router.post("/search", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/search", req.body, {
      context:    "api/search",
      timeoutMs:  20_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "api/search");
  }
});

// ── POST /api/fareQuote → /fms/v1/air/farequote ───────────────────────────
router.post("/fareQuote", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/farequote", req.body, {
      context:    "api/fareQuote",
      timeoutMs:  15_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "api/fareQuote");
  }
});

// ── POST /api/ssr → /fms/v1/air/ssr ───────────────────────────────────────
router.post("/ssr", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/ssr", req.body, {
      context:    "api/ssr",
      timeoutMs:  15_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "api/ssr");
  }
});

// ── POST /api/book → /fms/v1/air/book ─────────────────────────────────────
router.post("/book", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/book", req.body, {
      context:    "api/book",
      timeoutMs:  30_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "api/book");
  }
});

export default router;
