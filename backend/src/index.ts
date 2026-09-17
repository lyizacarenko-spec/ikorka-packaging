import "dotenv/config";
import express from "express";
import cors from "cors";
import { ensureSchema } from "./db";
import { login } from "./auth";
import referenceRoutes from "./routes/reference";
import pricesRoutes from "./routes/prices";
import deliveriesRoutes from "./routes/deliveries";
import stockRoutes from "./routes/stock";
import reportsRoutes from "./routes/reports";
import npSyncRoutes from "./routes/npSync";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/login", async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "pin обов'язковий" });
  const result = await login(String(pin));
  if (!result) return res.status(401).json({ error: "Невірний PIN" });
  res.json(result);
});

app.use("/api", referenceRoutes);
app.use("/api", pricesRoutes);
app.use("/api", deliveriesRoutes);
app.use("/api", stockRoutes);
app.use("/api", reportsRoutes);
app.use("/api", npSyncRoutes);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

const PORT = Number(process.env.PORT) || 3000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`ikorka-packaging backend listening on :${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to apply schema:", err);
    process.exit(1);
  });
