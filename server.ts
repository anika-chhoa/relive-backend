import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { connectDB } from "./config/db.js";
import { createAuth } from "./lib/auth.js";
import aiRoutes from "./routes/ai.routes.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import itemRoutes from "./routes/items.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

async function start() {
  const db = await connectDB();
  const auth = createAuth(db);

  const app = express();

  app.use(
    cors({
      origin: FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(cookieParser());

  // Our own credentials auth (register/login/sync-session/me/logout) —
  // JSON parsing is scoped per-route inside this router so it never
  // touches Better Auth's raw request body below.
  app.use("/api/auth", createAuthRoutes(auth));

  // Payments — mounted here too (before the global json() below) since
  // the Stripe webhook needs its raw, unparsed body for signature
  // verification. JSON parsing for the other payments route is scoped
  // per-route inside routes/payments.routes.ts.
  app.use("/api/payments", paymentsRoutes);

  // Better Auth — Google OAuth only. Handles anything under /api/auth
  // the router above didn't match (e.g. /sign-in/social, /callback/google).
  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json());

  app.use("/api/uploads", uploadRoutes);
  app.use("/api/items", itemRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/admin", adminRoutes);
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.listen(PORT, () => {
    console.log(`[server] Relive backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
