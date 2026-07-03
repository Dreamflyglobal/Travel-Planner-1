CREATE TABLE "flights" (
	"id" serial PRIMARY KEY NOT NULL,
	"airline" text NOT NULL,
	"flight_number" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"departure_time" text NOT NULL,
	"arrival_time" text NOT NULL,
	"duration" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"class" text DEFAULT 'economy' NOT NULL,
	"seats_available" integer DEFAULT 50 NOT NULL,
	"stops" integer DEFAULT 0 NOT NULL,
	"airline_logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buses" (
	"id" serial PRIMARY KEY NOT NULL,
	"operator" text NOT NULL,
	"bus_number" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"departure_time" text NOT NULL,
	"arrival_time" text NOT NULL,
	"duration" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"bus_type" text DEFAULT 'seater' NOT NULL,
	"seats_available" integer DEFAULT 40 NOT NULL,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"address" text,
	"stars" integer DEFAULT 3 NOT NULL,
	"rating" numeric(3, 1) DEFAULT '4.0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"price_per_night" numeric(10, 2) NOT NULL,
	"image_url" text,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"room_types" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"destination" text NOT NULL,
	"duration" integer NOT NULL,
	"nights" integer DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'beach' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"ai_price" numeric(10, 2),
	"admin_price" numeric(10, 2),
	"original_price" numeric(10, 2),
	"image_url" text,
	"images" text[] DEFAULT '{}' NOT NULL,
	"rating" numeric(3, 1) DEFAULT '4.0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"includes" text[] DEFAULT '{}' NOT NULL,
	"exclusions" text[] DEFAULT '{}' NOT NULL,
	"highlights" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"itinerary" jsonb,
	"package_type" text,
	"category" text,
	"markup_pct" numeric(5, 2),
	"featured" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_by" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_counters" (
	"type" text PRIMARY KEY NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_ref" text,
	"user_id" text,
	"booking_type" text NOT NULL,
	"title" text,
	"reference_id" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"passenger_name" text NOT NULL,
	"passenger_email" text NOT NULL,
	"passenger_phone" text,
	"total_price" numeric(10, 2) NOT NULL,
	"passengers" integer DEFAULT 1 NOT NULL,
	"travel_date" text NOT NULL,
	"details" jsonb,
	"agent_id" text,
	"agent_code" text,
	"agent_email" text,
	"commission_earned" numeric(10, 2),
	"payment_method" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_id" text,
	"razorpay_order_id" text,
	"razorpay_signature" text,
	"emi_details" jsonb,
	"base_fare" numeric(10, 2),
	"markup_amount" numeric(10, 2),
	"convenience_fee" numeric(10, 2),
	"booking_status" text DEFAULT 'confirmed' NOT NULL,
	"failure_reason" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"image_url" text,
	"package_count" integer DEFAULT 0 NOT NULL,
	"starting_price" numeric(10, 2) NOT NULL,
	"rating" numeric(3, 1) DEFAULT '4.5' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followup_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"msg_10min" text DEFAULT 'Hi {name}, just checking 😊
Did you see your {destination} itinerary? Our travel expert is ready to help you plan the perfect trip!' NOT NULL,
	"msg_2hr" text DEFAULT 'We have limited slots for your {destination} trip 🌴
Let us know if you want to customize your plan. Our expert can create a tailored package just for you!' NOT NULL,
	"msg_24hr" text DEFAULT 'Special offer 🎉
Get ₹500 OFF if you confirm your {destination} booking today!
Offer valid for the next 24 hours only. Call us now to avail!' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"lead_name" text NOT NULL,
	"phone" text NOT NULL,
	"destination" text NOT NULL,
	"step" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"type" text DEFAULT 'flight' NOT NULL,
	"source" text DEFAULT 'form' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"package_id" integer,
	"package_name" text,
	"assigned_to" text,
	"assigned_name" text,
	"booking_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_id" text NOT NULL,
	"package_id" integer NOT NULL,
	"package_name" text NOT NULL,
	"destination" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"user_id" text,
	"source" text DEFAULT 'guest' NOT NULL,
	"agent_id" text,
	"agent_name" text,
	"travel_date" text,
	"people" integer DEFAULT 2,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_enquiry_id_unique" UNIQUE("enquiry_id")
);
--> statement-breakpoint
CREATE TABLE "push_notifications_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text,
	"phone" text,
	"email" text,
	"name" text,
	"platform" text DEFAULT 'web' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"agent_code" text,
	"agency_name" text,
	"gst_number" text,
	"commission" numeric(5, 2),
	"is_approved" boolean DEFAULT false,
	"wallet_balance" numeric(10, 2) DEFAULT '0',
	"referral_code" text,
	"referred_by" text,
	"device_id" text,
	"otp_user" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "marketing_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"phone" text NOT NULL,
	"message_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"body" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"phone" text,
	"last_search_type" text,
	"last_search_from" text,
	"last_search_to" text,
	"last_search_at" timestamp with time zone,
	"last_booking_id" text,
	"last_booking_type" text,
	"last_booking_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"flight_api_key" text,
	"bus_api_key" text,
	"hotel_api_key" text,
	"hotel_api_secret" text,
	"payment_api_key" text,
	"payment_api_secret" text,
	"flight_provider" text DEFAULT 'tripjack',
	"tbo_api_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"payment_id" varchar(191) NOT NULL,
	"refund_id" varchar(191),
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"status" varchar(32) DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"initiated_by" varchar(191),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount" numeric(10, 2) NOT NULL,
	"discount_type" text DEFAULT 'fixed' NOT NULL,
	"type" text DEFAULT 'public' NOT NULL,
	"allowed_phone" text,
	"valid_until" text NOT NULL,
	"usage_limit" integer DEFAULT 0 NOT NULL,
	"min_booking_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"service_type" text,
	"flight_type" text,
	"airline" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"namespace" text PRIMARY KEY NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
