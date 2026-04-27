// ── Referral System ───────────────────────────────────────────────────────────
//
// Reward structure:
//   Referee  → ₹50 wallet credit IMMEDIATELY on signup (if referral code used)
//   Referrer → ₹50 wallet credit when referred user completes FIRST booking
//
// Storage:
//   localStorage.referrals             — Referral[] records
//   localStorage.users[].referralCode  — unique WWXXXXX code per user
//
// Fraud prevention:
//   • Unique email + phone on signup (checked in auth-context)
//   • One referral record per referred user
//   • Self-referral blocked (referrer.id !== newUser.id)
//   • Reward given exactly once (referral_status: "pending" → "completed")
//   • Device ID stamped on signup

import { creditWallet } from "./wallet";

export interface Referral {
  id: string;
  referrer_id: string;       // userId of who shared the code
  referred_user_id: string;  // userId of the new user
  referral_code: string;     // the code that was used
  created_at: string;
  referral_status: "pending" | "completed"; // pending = referee signed up; completed = referee booked
  reward_given: boolean;     // true once referrer's ₹50 has been credited
}

const REFERRALS_KEY = "referrals";
const DEVICE_KEY    = "ww_device_id";

// ── Device fingerprint helpers ────────────────────────────────────────────────

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function isDeviceAlreadyRegistered(): boolean {
  const deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) return false;
  try {
    const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
    return users.some((u: any) => u.deviceId === deviceId);
  } catch { return false; }
}

// ── Code generation ────────────────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "DFG";
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export function getUniqueReferralCode(): string {
  try {
    const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
    const used = new Set(users.map((u: any) => u.referralCode).filter(Boolean));
    let code: string;
    do { code = generateCode(); } while (used.has(code));
    return code;
  } catch {
    return generateCode();
  }
}

// ── Storage helpers ────────────────────────────────────────────────────────────

export function getReferrals(): Referral[] {
  try {
    const raw = JSON.parse(localStorage.getItem(REFERRALS_KEY) ?? "[]");
    // Migrate old records that don't have referral_status
    return raw.map((r: any) => ({
      ...r,
      referral_status: r.referral_status ?? (r.reward_given ? "completed" : "pending"),
    }));
  } catch { return []; }
}

function saveReferrals(referrals: Referral[]): void {
  localStorage.setItem(REFERRALS_KEY, JSON.stringify(referrals));
}

// ── Lookup ─────────────────────────────────────────────────────────────────────

export function findUserByReferralCode(code: string): any | null {
  if (!code?.trim()) return null;
  try {
    const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
    return users.find((u: any) => u.referralCode === code.toUpperCase().trim()) ?? null;
  } catch { return null; }
}

// ── Create a referral record ──────────────────────────────────────────────────
// Called during signup AFTER the new user has been saved to localStorage.users.

export function createReferral(
  referrerId: string,
  referredUserId: string,
  code: string,
): void {
  const referrals = getReferrals();
  // Prevent: duplicate referral for same new user
  if (referrals.some((r) => r.referred_user_id === referredUserId)) return;
  // Prevent: self-referral
  if (referrerId === referredUserId) return;
  referrals.push({
    id: `ref_${Date.now()}`,
    referrer_id: referrerId,
    referred_user_id: referredUserId,
    referral_code: code.toUpperCase(),
    created_at: new Date().toISOString(),
    referral_status: "pending",
    reward_given: false,
  });
  saveReferrals(referrals);
}

// ── Per-user reward notification queue ───────────────────────────────────────
// Pushed whenever a wallet credit happens; consumed on the payment-success
// page (and also shown in a toast on signup completion).

const NOTIF_PREFIX = "ww_reward_notifs_";

export interface RewardNotif {
  id: number;
  amount: number;
  message: string;
  seen: boolean;
}

export function pushRewardNotification(userId: string, amount: number, message: string): void {
  const key = `${NOTIF_PREFIX}${userId}`;
  try {
    const notifs: RewardNotif[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    notifs.push({ id: Date.now(), amount, message, seen: false });
    localStorage.setItem(key, JSON.stringify(notifs));
  } catch { /* silent */ }
}

/** Returns unseen notifications and marks them all as seen. */
export function popUnseenRewardNotifications(userId: string): RewardNotif[] {
  const key = `${NOTIF_PREFIX}${userId}`;
  try {
    const notifs: RewardNotif[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const unseen = notifs.filter((n) => !n.seen);
    if (unseen.length === 0) return [];
    localStorage.setItem(key, JSON.stringify(notifs.map((n) => ({ ...n, seen: true }))));
    return unseen;
  } catch { return []; }
}

// ── Process referrer reward on first booking ──────────────────────────────────
// Called from convertLeadToBooked via tryProcessReferralByPhone.
// Credits the REFERRER ₹50 only — referee already received ₹50 at signup.

export function processReferralReward(referredUserId: string): boolean {
  const referrals = getReferrals();
  const idx = referrals.findIndex(
    (r) =>
      r.referred_user_id === referredUserId &&
      r.referral_status === "pending" &&
      !r.reward_given,
  );
  if (idx < 0) return false;

  const referral = referrals[idx];

  // Credit referrer ₹50
  creditWallet(referral.referrer_id, 50, "Referral reward — your friend completed their first booking!");
  pushRewardNotification(
    referral.referrer_id,
    50,
    "₹50 referral reward added to your Travel Credits!",
  );

  // Mark referral as completed
  referrals[idx] = { ...referral, referral_status: "completed", reward_given: true };
  saveReferrals(referrals);
  return true;
}

// Called from convertLeadToBooked — looks up user by phone, then fires referrer reward
export function tryProcessReferralByPhone(phone: string): void {
  if (!phone) return;
  const normalized = phone.replace(/\D/g, "").slice(-10);
  try {
    const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
    const user = users.find(
      (u: any) => u.phone?.replace(/\D/g, "").slice(-10) === normalized,
    );
    if (user) processReferralReward(user.id);
  } catch { /* non-blocking */ }
}

// ── Stats for profile dashboard ───────────────────────────────────────────────

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;       // all referrals sent by this user
  rewardedReferrals: number;    // referrals where referrer got ₹50
  pendingReferrals: number;     // referred but not yet booked
  totalEarnings: number;        // ₹50 × rewardedReferrals
  signupBonusReceived: boolean; // did THIS user receive ₹50 at signup via referral?
}

export function getUserReferralStats(userId: string): ReferralStats {
  const all = getReferrals();
  const mine = all.filter((r) => r.referrer_id === userId);
  const rewarded = mine.filter((r) => r.reward_given);
  const signupBonus = all.find((r) => r.referred_user_id === userId);

  const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
  const user = users.find((u: any) => u.id === userId);

  return {
    referralCode:         user?.referralCode ?? "—",
    totalReferrals:       mine.length,
    rewardedReferrals:    rewarded.length,
    pendingReferrals:     mine.length - rewarded.length,
    totalEarnings:        rewarded.length * 50,
    signupBonusReceived:  !!signupBonus,
  };
}
