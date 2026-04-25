import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";


const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// try both possible paths
const path1 = path.join(__dirname, "dist/public");
const path2 = path.join(__dirname, "artifacts/travel-booking/dist/public");

// auto detect correct folder
let publicPath = fs.existsSync(path1) ? path1 : path2;

console.log("USING PATH:", publicPath);

app.use(express.static(publicPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
