/**
 * TBO (Travel Boutique Online) flight API stub.
 *
 * Replace the stub handlers below with real TBO API calls once
 * TBO credentials are configured via Admin → API Settings.
 *
 * TBO REST API base: https://api.tbo.com/rest (example)
 * Auth: Bearer token or key-based depending on the TBO plan.
 */
import { Router, type IRouter } from "express";
import { getProviderConfig } from "../lib/provider-config.js";

const router: IRouter = Router();

function notConfigured(res: any, endpoint: string) {
  res.status(503).json({
    status: false,
    error: `TBO ${endpoint} not yet integrated. Add your TBO API key in Admin → API Settings and implement the endpoint.`,
  });
}

router.post("/tbo-search",    async (_req, res) => notConfigured(res, "search"));
router.post("/tbo-farequote", async (_req, res) => notConfigured(res, "fareQuote"));
router.post("/tbo-ssr",       async (_req, res) => notConfigured(res, "SSR"));
router.post("/tbo-book",      async (_req, res) => notConfigured(res, "book"));

export default router;
