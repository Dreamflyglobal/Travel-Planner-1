import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME: Record<string, string> = {
  "image/png":  ".png",
  "image/jpeg": ".jpg",
  "image/jpg":  ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/gif":  ".gif",
};

const MAX_LOGO_BYTES    = 5 * 1024 * 1024;
const MAX_FAVICON_BYTES = 1 * 1024 * 1024;

function makeStorage(prefix: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] ?? path.extname(file.originalname).toLowerCase();
      const uid = crypto.randomBytes(8).toString("hex");
      cb(null, `${prefix}-${uid}${ext}`);
    },
  });
}

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_MIME[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPG, WEBP, SVG.`));
  }
}

const uploadLogo = multer({
  storage: makeStorage("logo"),
  limits:  { fileSize: MAX_LOGO_BYTES },
  fileFilter,
});

const uploadFavicon = multer({
  storage: makeStorage("favicon"),
  limits:  { fileSize: MAX_FAVICON_BYTES },
  fileFilter,
});

const router = Router();

router.post("/upload/logo", uploadLogo.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file received." });
    return;
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

router.post("/upload/favicon", uploadFavicon.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file received." });
    return;
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

router.use(
  (err: any, _req: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large." });
      return;
    }
    res.status(400).json({ error: err?.message ?? "Upload failed." });
  },
);

export default router;
