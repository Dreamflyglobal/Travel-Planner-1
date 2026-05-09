import { Router } from "express";
import multer from "multer";
import path from "node:path";

const ALLOWED_MIME: Record<string, string> = {
  "image/png":                "png",
  "image/jpeg":               "jpeg",
  "image/jpg":                "jpeg",
  "image/webp":               "webp",
  "image/svg+xml":            "svg+xml",
  "image/gif":                "gif",
  "image/x-icon":             "x-icon",
  "image/vnd.microsoft.icon": "vnd.microsoft.icon",
};

const MAX_LOGO_BYTES    = 5  * 1024 * 1024;
const MAX_FAVICON_BYTES = 2  * 1024 * 1024;
const RAW_CAP_BYTES     = 20 * 1024 * 1024;

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_MIME[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPG, WEBP, SVG, ICO, GIF.`));
  }
}

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: Math.min(MAX_LOGO_BYTES, RAW_CAP_BYTES) },
  fileFilter,
});

const uploadFavicon = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: Math.min(MAX_FAVICON_BYTES, RAW_CAP_BYTES) },
  fileFilter,
});

function toDataUrl(file: Express.Multer.File): string {
  const subtype = ALLOWED_MIME[file.mimetype] ?? path.extname(file.originalname).replace(".", "");
  const mimeType = subtype.includes("/") ? `image/${subtype}` : file.mimetype;
  const b64 = file.buffer.toString("base64");
  return `data:${mimeType};base64,${b64}`;
}

const router = Router();

router.post("/upload/logo", uploadLogo.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file received." });
    return;
  }
  const url = toDataUrl(req.file);
  res.json({ url });
});

router.post("/upload/favicon", uploadFavicon.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file received." });
    return;
  }
  const url = toDataUrl(req.file);
  res.json({ url });
});

router.use(
  (err: any, _req: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large. Please compress the image and try again." });
      return;
    }
    res.status(400).json({ error: err?.message ?? "Upload failed." });
  },
);

export default router;
