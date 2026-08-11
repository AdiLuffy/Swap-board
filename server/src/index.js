import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import apiRouter from "./routes/api.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { initDriver, closeDriver } from "./config/db.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json({ limit: "100kb" }));

// Basic abuse protection. Generous enough for normal browsing, tight
// enough to blunt scripted hammering of the free-tier database.
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please slow down." },
  })
);

app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);

initDriver();

const server = app.listen(PORT, () => {
  console.log(`[server] SwapBoard API listening on :${PORT}`);
});

// Fail gracefully on shutdown signals instead of dropping connections.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await closeDriver();
      process.exit(0);
    });
  });
}
