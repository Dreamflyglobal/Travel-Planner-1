import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

// Resolve uploads dir relative to this compiled module file so the path is
// identical whether the process is launched from the workspace root (production)
// or from inside artifacts/api-server (development).
// After esbuild bundling: import.meta.url → .../artifacts/api-server/dist/index.mjs
// → path.resolve(moduleDir, "../uploads") → artifacts/api-server/uploads/
const _moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR: string =
  process.env["UPLOADS_DIR"] ?? path.resolve(_moduleDir, "../uploads");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
