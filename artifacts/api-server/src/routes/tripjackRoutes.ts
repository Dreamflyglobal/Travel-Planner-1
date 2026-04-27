import { Router, type IRouter } from "express";
import axios from "axios";

const router: IRouter = Router();

const BASE_URL = "https://apitest.tripjack.com";

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: process.env.TRIPJACK_API_KEY || "",
  };
}

// POST /api/tj-search → /fms/v1/air/search
router.post("/tj-search", async (req, res): Promise<void> => {
  try {
    const response = await axios.post(`${BASE_URL}/fms/v1/air/search`, req.body, {
      headers: buildHeaders(),
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
      headers: buildHeaders(),
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
      headers: buildHeaders(),
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
      headers: buildHeaders(),
    });
    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

export default router;
