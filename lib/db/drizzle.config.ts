import { defineConfig } from "drizzle-kit";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Auto-load .env from project root so drizzle-kit CLI commands
// (push, generate, studio) work without manually sourcing .env first.
// `override: false` means platform env vars always win over .env values.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.resolve(__dirname, "../../.env"), override: false });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
    "  • On your server: ensure .env contains DATABASE_URL=postgresql://...\n" +
    "  • In CI/CD: set DATABASE_URL as an environment variable."
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: false,
});
