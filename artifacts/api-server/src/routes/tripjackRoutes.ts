import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { tjPostWithRetry, handleTjError } from "../lib/tj-retry.js";

const router: IRouter = Router();

// POST /api/tj-search → /fms/v1/air/search
router.post("/tj-search", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/search", req.body, {
      context:    "tj-search",
      timeoutMs:  20_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "tj-search");
  }
});

// POST /api/tj-farequote → TripJack /fms/v1/air-fare-quote
// Accepts: { traceId, resultIndex }
async function handleFareQuote(req: any, res: any): Promise<void> {
  const { traceId, resultIndex } = req.body as {
    traceId?:     string;
    resultIndex?: string;
  };

  logger.info("TRACE:", traceId || "(none)");
  logger.info("RESULT:", resultIndex || "(none)");

  // Explicit stdout logs (always visible regardless of pino log-level config)
  console.log("[fareQuote] traceId:", traceId || "(none)");
  console.log("[fareQuote] resultIndex:", resultIndex || "(none)");

  if (!resultIndex) {
    logger.error("[fareQuote] resultIndex missing");
    console.error("[fareQuote] resultIndex missing — request body:", JSON.stringify(req.body));
    res.status(400).json({ error: "resultIndex is required for fareQuote" });
    return;
  }

  // Build fareQuote body — traceId is optional; test API may not return one
  const fareQuoteBody: Record<string, string> = { resultIndex };
  if (traceId) fareQuoteBody.traceId = traceId;

  logger.info("FareQuote Body:", JSON.stringify(fareQuoteBody));
  console.log("[fareQuote] request payload:", JSON.stringify(fareQuoteBody));

  try {
    // TripJack fareQuote endpoint — path confirmed by 405 (exists) vs 404 (doesn't exist)
    const data = await tjPostWithRetry("/fms/v1/air/farequote", fareQuoteBody, {
      context:    "fareQuote",
      timeoutMs:  15_000,
      maxRetries: 2,
    });

    logger.info("FareQuote Response:", JSON.stringify(data).slice(0, 800));
    console.log("[fareQuote] response:", JSON.stringify(data).slice(0, 800));
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "fareQuote");
  }
}

router.post("/tj-farequote",       handleFareQuote);
router.post("/tripjack/fareQuote", handleFareQuote);

// POST /api/tj-ssr → /fms/v1/air/ssr
router.post("/tj-ssr", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/ssr", req.body, {
      context:    "tj-ssr",
      timeoutMs:  15_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "tj-ssr");
  }
});

// POST /api/tj-book → /fms/v1/air/book
router.post("/tj-book", async (req, res): Promise<void> => {
  try {
    const data = await tjPostWithRetry("/fms/v1/air/book", req.body, {
      context:    "tj-book",
      timeoutMs:  30_000,
      maxRetries: 2,
    });
    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "tj-book");
  }
});

export default router;
