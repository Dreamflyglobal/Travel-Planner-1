import { Router, type IRouter } from "express";
import axios from "axios";
import {
  getTripJackHeaders,
  bustTripJackToken,
  extractTripJackError,
  TRIPJACK_BASE,
} from "../lib/tripjack-auth.js";

const router: IRouter = Router();

async function tjPost(path: string, body: unknown, timeoutMs = 20_000): Promise<any> {
  let headers: Record<string, string>;
  try {
    headers = await getTripJackHeaders();
  } catch (authErr: any) {
    const e = new Error(authErr.message) as any;
    e.isAuthError = true;
    throw e;
  }
  const url = `${TRIPJACK_BASE}${path}`;
  try {
    const { data } = await axios.post(url, body, { headers, timeout: timeoutMs });
    return data;
  } catch (err: any) {
    if (err.response?.status === 401) bustTripJackToken();
    throw err;
  }
}

function handleError(res: any, err: any, context: string): void {
  if ((err as any).isAuthError) {
    console.error(`[${context}] Auth error:`, err.message);
    res.status(503).json({ error: err.message });
    return;
  }
  const status  = err.response?.status || 502;
  const message = err.response?.data
    ? extractTripJackError(err.response.data, err.message)
    : err.message;
  console.error(`[${context}] Error (${status}):`, message);
  res.status(status).json({ error: message });
}

// ── POST /api/search → /fms/v1/air/search ─────────────────────────────────
router.post("/search", async (req, res): Promise<void> => {
  console.log("[tripjack/search] Request body:", JSON.stringify(req.body, null, 2));
  try {
    const data = await tjPost("/fms/v1/air/search", req.body);
    console.log("[tripjack/search] Response: success");
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "tripjack/search");
  }
});

// ── POST /api/fareQuote → /fms/v1/air/farequote ───────────────────────────
router.post("/fareQuote", async (req, res): Promise<void> => {
  console.log("[tripjack/fareQuote] Request body:", JSON.stringify(req.body, null, 2));
  try {
    const data = await tjPost("/fms/v1/air/farequote", req.body);
    console.log("[tripjack/fareQuote] Response: success");
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "tripjack/fareQuote");
  }
});

// ── POST /api/ssr → /fms/v1/air/ssr ───────────────────────────────────────
router.post("/ssr", async (req, res): Promise<void> => {
  console.log("[tripjack/ssr] Request body:", JSON.stringify(req.body, null, 2));
  try {
    const data = await tjPost("/fms/v1/air/ssr", req.body, 20_000);
    console.log("[tripjack/ssr] Response: success");
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "tripjack/ssr");
  }
});

// ── POST /api/book → /fms/v1/air/book ─────────────────────────────────────
router.post("/book", async (req, res): Promise<void> => {
  console.log("[tripjack/book] Request body:", JSON.stringify(req.body, null, 2));
  try {
    const data = await tjPost("/fms/v1/air/book", req.body, 30_000);
    console.log("[tripjack/book] Response: success");
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "tripjack/book");
  }
});

export default router;
