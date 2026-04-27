import { Router, type IRouter } from "express";
import axios from "axios";
import { getProviderConfig } from "../lib/provider-config.js";

const router: IRouter = Router();

const BASE_URL = "https://apitest.tripjack.com";

async function buildHeaders() {
  const cfg = await getProviderConfig();
  const key = cfg.flightApiKey;
  return {
    "Content-Type": "application/json",
    apikey: key,
  };
}

// POST /api/tj-search → /fms/v1/air/search
router.post("/tj-search", async (req, res): Promise<void> => {
  try {
    const response = await axios.post(`${BASE_URL}/fms/v1/air/search`, req.body, {
      headers: await buildHeaders(),
    });
    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// POST /api/tj-farequote → /fms/v1/air/farequote
router.post("/tj-farequote", async (req, res): Promise<void> => {
  try {
    const response = await axios.post(`${BASE_URL}/fms/v1/air/farequote`, req.body, {
      headers: await buildHeaders(),
    });
    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// POST /api/tj-ssr → /fms/v1/air/ssr
router.post("/tj-ssr", async (req, res): Promise<void> => {
  try {
    const response = await axios.post(`${BASE_URL}/fms/v1/air/ssr`, req.body, {
      headers: await buildHeaders(),
    });
    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// POST /api/tj-book → /fms/v1/air/book
router.post("/tj-book", async (req, res): Promise<void> => {
  try {
    const response = await axios.post(`${BASE_URL}/fms/v1/air/book`, req.body, {
      headers: await buildHeaders(),
    });
    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

export default router;
