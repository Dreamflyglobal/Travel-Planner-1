import { Router, type IRouter } from "express";
import axios from "axios";
import { getTripJackHeaders, bustTripJackToken, TRIPJACK_BASE } from "../lib/tripjack-auth.js";

const router: IRouter = Router();

async function tjPost(path: string, body: unknown, timeoutMs = 20_000): Promise<any> {
  const headers = await getTripJackHeaders();
  const url     = `${TRIPJACK_BASE}${path}`;
  try {
    const { data } = await axios.post(url, body, { headers, timeout: timeoutMs });
    return data;
  } catch (err: any) {
    if (err.response?.status === 401) bustTripJackToken();
    throw err;
  }
}

// POST /api/tj-search → /fms/v1/air/search
router.post("/tj-search", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/search", req.body);
    res.json(data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// POST /api/tj-farequote → /fms/v1/air/farequote
router.post("/tj-farequote", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/farequote", req.body);
    res.json(data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// POST /api/tj-ssr → /fms/v1/air/ssr
router.post("/tj-ssr", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/ssr", req.body);
    res.json(data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// POST /api/tj-book → /fms/v1/air/book
router.post("/tj-book", async (req, res): Promise<void> => {
  try {
    const data = await tjPost("/fms/v1/air/book", req.body, 30_000);
    res.json(data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

export default router;
