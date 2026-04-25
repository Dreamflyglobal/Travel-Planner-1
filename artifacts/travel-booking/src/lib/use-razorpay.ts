/**
 * Razorpay checkout integration
 *
 * Key modes (returned by backend):
 *   "test"  — rzp_test_* keys → real Razorpay test checkout (use test cards)
 *   "live"  — rzp_live_* keys → real Razorpay live checkout (real money)
 *   "demo"  — no keys configured → payment simulated instantly
 */

declare global {
  interface Window {
    Razorpay: any;
  }
}

// Vite proxy forwards /api/* → http://localhost:8080 in dev
// In production the backend serves /api/* directly
const API_BASE = "";

type KeyMode = "test" | "live" | "demo";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-checkout-js")) {
      resolve(true);
      return;
    }
    const script   = document.createElement("script");
    script.id      = "razorpay-checkout-js";
    script.src     = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export interface RazorpayPaymentOptions {
  /** Amount in rupees (e.g. 500 = ₹500). Backend converts to paise. */
  amount:       number;
  name:         string;
  email:        string;
  phone:        string;
  description?: string;
  onSuccess:    (paymentId: string, orderId: string, signature: string) => void;
  onFailure:    (message: string) => void;
  onDismiss?:   () => void;
}

export async function openRazorpayCheckout(opts: RazorpayPaymentOptions) {
  // ── 1. Create order on backend ─────────────────────────────────────────────
  let order:   any;
  let key:     string;
  let keyMode: KeyMode = "demo";

  try {
    const res = await fetch(`${API_BASE}/api/payments/create-order`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        amount:   opts.amount,     // rupees — backend converts to paise
        currency: "INR",
        receipt:  `rcpt_${Date.now()}`,
        notes:    { customer: opts.name, email: opts.email },
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      opts.onFailure(data.error || "Could not create payment order. Please try again.");
      return;
    }

    order   = data.order;
    key     = data.key     ?? "";
    keyMode = (data.keyMode as KeyMode) ?? "demo";
  } catch {
    opts.onFailure("Network error while creating order. Please check your connection.");
    return;
  }

  // ── 2. Demo mode — instantly simulate successful payment ───────────────────
  if (keyMode === "demo") {
    console.info("[razorpay] Demo mode — simulating payment success (no real keys configured)");
    const fakePayId = `pay_DEMO${Date.now()}`;
    const fakeSig   = "demo_signature";
    setTimeout(() => opts.onSuccess(fakePayId, order.id, fakeSig), 800);
    return;
  }

  // ── 3. Load Razorpay.js SDK ────────────────────────────────────────────────
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    opts.onFailure("Failed to load Razorpay checkout. Please check your internet connection.");
    return;
  }

  // ── 4. Open Razorpay checkout modal ───────────────────────────────────────
  // `order.amount` is already in paise — returned directly from Razorpay Orders API
  const rzpOptions = {
    key,
    amount:      order.amount,           // paise (from Razorpay API)
    currency:    order.currency || "INR",
    name:        "Dream Fly Global",
    description: opts.description || "Travel Booking",
    image:       "",
    order_id:    order.id,               // required — links payment to order
    prefill: {
      name:    opts.name,
      email:   opts.email,
      contact: opts.phone,
    },
    theme: { color: "#2563EB" },

    handler(response: {
      razorpay_payment_id: string;
      razorpay_order_id:   string;
      razorpay_signature:  string;
    }) {
      opts.onSuccess(
        response.razorpay_payment_id,
        response.razorpay_order_id,
        response.razorpay_signature,
      );
    },

    modal: {
      ondismiss() {
        opts.onDismiss?.();
        opts.onFailure("Payment was cancelled.");
      },
      escape:        true,
      animation:     true,
      backdropclose: false,
    },
  };

  console.info(`[razorpay] Opening checkout (${keyMode}) — order: ${order.id}  ₹${opts.amount}`);

  const rzp = new window.Razorpay(rzpOptions);

  rzp.on("payment.failed", (resp: any) => {
    const msg = resp?.error?.description
             || resp?.error?.reason
             || "Payment failed. Please try again.";
    console.error("[razorpay] Payment failed:", resp?.error);
    opts.onFailure(msg);
  });

  rzp.open();
}

export interface BookingContext {
  bookingId:     string;
  passengerName: string;
  phone:         string;
  from:          string;
  to:            string;
  date:          string;
  amount:        number;
  airline?:      string;
  flightNum?:    string;
  referralCode?: string;
}

/**
 * Verify the Razorpay payment signature on the backend.
 * Always call this after the Razorpay handler fires onSuccess.
 */
export async function verifyRazorpayPayment(
  razorpay_payment_id: string,
  razorpay_order_id:   string,
  razorpay_signature:  string,
  bookingContext?: BookingContext,
): Promise<{ success: boolean; paymentId?: string; whatsappSent?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/payments/verify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        bookingContext,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || "Verification failed" };
    }
    return data;
  } catch {
    return { success: false, error: "Network error during payment verification" };
  }
}
