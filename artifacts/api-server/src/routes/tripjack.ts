import { Router, type IRouter } from "express";
import axios from "axios";

const router: IRouter = Router();

const TRIPJACK_BASE = "https://apitest.tripjack.com";

function getApiKey(res: any): string | null {
  const apiKey = process.env.TRIPJACK_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "TRIPJACK_API_KEY is not configured." });
    return null;
  }
  return apiKey;
}

// ── POST /api/search → TripJack /fms/v1/air/search ─────────────────────────
router.post("/search", async (req, res): Promise<void> => {
  const apiKey = getApiKey(res);
  if (!apiKey) return;

  console.log("[tripjack/search] Request body:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = await axios.post(
      `${TRIPJACK_BASE}/fms/v1/air/search`,
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        timeout: 20_000,
      }
    );

    console.log("[tripjack/search] Response status: success");
    res.json(data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    const message = err.response?.data || err.message;
    console.error("[tripjack/search] Error:", message);
    res.status(status).json({ error: message });
  }
});

// ── POST /api/fareQuote → TripJack /fms/v1/air/farequote ───────────────────
router.post("/fareQuote", async (req, res): Promise<void> => {
  const apiKey = getApiKey(res);
  if (!apiKey) return;

  console.log("[tripjack/fareQuote] Request body:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = await axios.post(
      `${TRIPJACK_BASE}/fms/v1/air/farequote`,
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        timeout: 20_000,
      }
    );

    console.log("[tripjack/fareQuote] Response status: success");
    res.json(data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    const message = err.response?.data || err.message;
    console.error("[tripjack/fareQuote] Error:", message);
    res.status(status).json({ error: message });
  }
});

// ── POST /api/ssr → TripJack /fms/v1/air/ssr ───────────────────────────────
router.post("/ssr", async (req, res): Promise<void> => {
  const apiKey = getApiKey(res);
  if (!apiKey) return;

  console.log("[tripjack/ssr] Request body:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = await axios.post(
      `${TRIPJACK_BASE}/fms/v1/air/ssr`,
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        timeout: 20_000,
      }
    );

    console.log("[tripjack/ssr] Response status: success");
    res.json(data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    const message = err.response?.data || err.message;
    console.error("[tripjack/ssr] Error:", message);
    res.status(status).json({ error: message });
  }
});

// ── POST /api/book → TripJack /fms/v1/air/book ─────────────────────────────
router.post("/book", async (req, res): Promise<void> => {
  const apiKey = getApiKey(res);
  if (!apiKey) return;

  console.log("[tripjack/book] Request body:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = await axios.post(
      `${TRIPJACK_BASE}/fms/v1/air/book`,
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        timeout: 30_000,
      }
    );

    console.log("[tripjack/book] Response status: success, PNR:", data?.bookingId || data?.pnr || "N/A");
    res.json(data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    const message = err.response?.data || err.message;
    console.error("[tripjack/book] Error:", message);
    res.status(status).json({ error: message });
  }
});

export default router;
