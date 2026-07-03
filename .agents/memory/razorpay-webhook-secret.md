---
name: Razorpay webhook secret vs API key secret
description: Razorpay webhook signature verification requires a distinct secret from the payment API key secret.
---

Razorpay signs incoming webhook POST bodies (`x-razorpay-signature` header) using a dedicated "Webhook Secret" configured separately in Razorpay Dashboard → Settings → Webhooks. This is a different value from `RAZORPAY_KEY_SECRET` (the API key secret used for order creation and payment-signature verification, i.e. `order_id|payment_id` HMAC).

**Why:** A previous implementation reused `RAZORPAY_KEY_SECRET` to verify webhook signatures. That always mismatches for real webhook deliveries since Razorpay signs webhooks with the separate Webhook Secret, silently breaking webhook-based flows (or requiring verification to be skipped entirely).

**How to apply:** Use a distinct `RAZORPAY_WEBHOOK_SECRET` env var for webhook HMAC verification. If it's not set, log a clear warning that webhook signatures are unverified rather than silently using the wrong secret. Payment-signature verification (`/verify-payment`, `/api/payments/verify`) correctly uses `RAZORPAY_KEY_SECRET` — that part is unrelated and should not change.
