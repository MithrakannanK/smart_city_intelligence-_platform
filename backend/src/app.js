const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { authRoutes } = require("./routes/authRoutes");
const { urbanRoutes } = require("./routes/urbanRoutes");

const app = express();

app.use(helmet());
app.use(morgan("dev"));

const corsOriginRaw = process.env.CORS_ORIGIN || "";
const corsOrigin =
  corsOriginRaw.trim().length > 0 ? corsOriginRaw.split(",").map((s) => s.trim()) : true;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use(authRoutes);
app.use(urbanRoutes);

// Basic 404 to keep the API predictable
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = { app };

