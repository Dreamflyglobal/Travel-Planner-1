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

function handleError(res: any, err: any): void {
  if ((err as any).isAuthError) {
    res.status(503).json({ error: err.message });
    return;
  }
  const status  = err.response?.status || 500;
  const message = err.response?.data
    ? extractTripJackError(err.response.data, err.message)
    : err.message;
  res.status(status).json({ error: message });
}

// POST /api/tj-search → /fms/v1/air/search
router.post("/tj-search", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/search", req.body);
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/tj-farequote → /fms/v1/air/farequote
router.post("/tj-farequote", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/farequote", req.body);
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/tj-ssr → /fms/v1/air/ssr
router.post("/tj-ssr", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/ssr", req.body);
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/tj-book → /fms/v1/air/book
router.post("/tj-book", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/book", req.body, 30_000);
    res.json(data);
  } catch (err: any) {
    handleError(res, err);
  }
});

export default router;
