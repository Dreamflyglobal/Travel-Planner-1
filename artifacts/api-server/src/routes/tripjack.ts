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

// ── POST /api/fareQuote → /fms/v1/review ──────────────────────────────────
// NOTE: real endpoint is /fms/v1/review (TripJack calls this step "review",
// not "farequote"), and it expects { priceIds: string[] }, not a single
// `resultIndex` field. /fms/v1/air/farequote is an unmapped GET-only stub —
// see tripjackRoutes.ts's handleFareQuote for the full investigation notes.
router.post("/fareQuote", async (req, res): Promise<void> => {
  try {
    const { resultIndex, priceIds } = req.body as { resultIndex?: string; priceIds?: string[] };
    const body = priceIds?.length ? { priceIds } : { priceIds: resultIndex ? [resultIndex] : [] };
    const data = await tjPostWithRetry("/fms/v1/review", body, {
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

// ── POST /api/book → /oms/v1/air/book ─────────────────────────────────────
// NOTE: real path is /oms/v1/air/book, not /fms/v1/air/book — the latter is
// an unmapped GET-only stub. See tripjackRoutes.ts's tj-book route for the
// full investigation notes.
router.post("/book", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/oms/v1/air/book", req.body, {
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
