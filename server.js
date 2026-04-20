import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  express.static(
    path.join(process.cwd(), "artifacts/travel-booking/dist/public"),
  ),
);

app.get("*", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "artifacts/travel-booking/dist/public/index.html"),
  );
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
