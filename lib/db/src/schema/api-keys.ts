import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  flightApiKey: text("flight_api_key"),
  busApiKey: text("bus_api_key"),
  hotelApiKey: text("hotel_api_key"),
  hotelApiSecret: text("hotel_api_secret"),
  paymentApiKey: text("payment_api_key"),
  paymentApiSecret: text("payment_api_secret"),
  flightProvider: text("flight_provider").default("tripjack"),
  tboApiKey: text("tbo_api_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
