import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("SERVER STARTED");

// correct absolute path
const publicPath = path.join(__dirname, "dist/public");

app.use(express.static(publicPath));

app.get("*", (req, res) => {
  console.log("REQUEST:", req.url);
  res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
