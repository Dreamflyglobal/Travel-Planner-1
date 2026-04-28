import { Router, type IRouter } from "express";
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

// POST /api/tj-farequote → /fms/v1/air/farequote
// Accepts: { traceId, resultIndex }
// TripJack expects flat: { traceId, resultIndex }
router.post("/tj-farequote", async (req, res): Promise<void> => {
  const { traceId, resultIndex } = req.body as {
    traceId?:     string;
    resultIndex?: string;
  };

  if (!resultIndex) {
    res.status(400).json({ error: "resultIndex is required for fareQuote" });
    return;
  }

  console.log("TRACE:", traceId || "(none)");
  console.log("RESULT:", resultIndex);

  const fareQuoteBody: Record<string, string> = { resultIndex };
  if (traceId) fareQuoteBody.traceId = traceId;

  console.log("FareQuote Body:", JSON.stringify(fareQuoteBody));

  try {
    const data = await tjPostWithRetry("/fms/v1/air/farequote", fareQuoteBody, {
      context:    "tj-farequote",
      timeoutMs:  15_000,
      maxRetries: 2,
    });

    // Surface application-level "could not verify fare" to the client
    const respStr = JSON.stringify(data).toLowerCase();
    if (respStr.includes("could not verify fare") || respStr.includes("verify fare")) {
      console.warn("[tj-farequote] TripJack returned 'could not verify fare' — forwarding to client for retry");
    }

    res.json(data);
  } catch (err: any) {
    handleTjError(res, err, "tj-farequote");
  }
});

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
