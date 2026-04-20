import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicPath = path.join(__dirname, "dist/public");

console.log("DIR:", __dirname);
console.log("PUBLIC:", publicPath);

app.use(express.static(publicPath));

app.get("*", (req, res) => {
  const filePath = path.join(publicPath, "index.html");
  console.log("TRY FILE:", filePath);
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
