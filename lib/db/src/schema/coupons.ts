import {
  pgTable,
  text,
  serial,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";

export const couponsTable = pgTable("coupons", {
  id:               serial("id").primaryKey(),
  code:             text("code").notNull().unique(),
  discount:         numeric("discount", { precision: 10, scale: 2 }).notNull(),
  discountType:     text("discount_type").notNull().default("fixed"),   // "fixed" | "percentage"
  type:             text("type").notNull().default("public"),            // "public" | "welcome" | "user_specific"
  allowedPhone:     text("allowed_phone"),                              // only for user_specific
  validUntil:       text("valid_until").notNull(),                      // ISO date string YYYY-MM-DD
  usageLimit:       integer("usage_limit").notNull().default(0),        // 0 = unlimited
  minBookingAmount: numeric("min_booking_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  serviceType:      text("service_type"),                               // "flight"|"bus"|"hotel"|"holiday"|null=all
  flightType:       text("flight_type"),                                // "domestic"|"international"|null
  airline:          text("airline"),
  description:      text("description"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const couponUsageTable = pgTable("coupon_usage", {
  id:        serial("id").primaryKey(),
  code:      text("code").notNull(),
  phone:     text("phone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CouponRow      = typeof couponsTable.$inferSelect;
export type CouponUsageRow = typeof couponUsageTable.$inferSelect;
