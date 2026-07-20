// import { toNodeHandler } from "better-auth/node";
// import cookieParser from "cookie-parser";
// import cors from "cors";
// import "dotenv/config";
// import express from "express";
// import { connectDB } from "./config/db.js";
// import { createAuth } from "./lib/auth.js";
// import aiRoutes from "./routes/ai.routes.js";
// import { createAuthRoutes } from "./routes/auth.routes.js";
// import itemRoutes from "./routes/items.routes.js";
// import paymentsRoutes from "./routes/payments.routes.js";
// import reviewRoutes from "./routes/reviews.routes.js";
// import uploadRoutes from "./routes/upload.routes.js";
// import dashboardRoutes from "./routes/dashboard.routes.js";
// import adminRoutes from "./routes/admin.routes.js";
// import chatRoutes from "./routes/chat.routes.js";
// import statsRoutes from "./routes/stats.routes.js";

// const PORT = process.env.PORT || 5000;
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// // 1. Initialize the Express app object instantly at module scope level
// const app = express();

// app.use(
//   cors({
//     origin: FRONTEND_URL,
//     credentials: true,
//   }),
// );
// app.use(cookieParser());

// // 2. Wrap runtime database dependent operations in a unified middleware wrapper
// let db: any = null;
// let auth: any = null;

// const initDbAndAuth = async () => {
//   if (!db || !auth) {
//     db = await connectDB();
//     auth = createAuth(db);
//   }
//   return { db, auth };
// };

// // Dynamic middleware injection for endpoints requiring database configurations
// app.use(async (req, res, next) => {
//   try {
//     const { auth } = await initDbAndAuth();
//     req.auth = auth; // Attach to request object if routes need direct access
//     next();
//   } catch (err) {
//     console.error("[server] Database connection error:", err);
//     res.status(500).json({ error: "Internal Database Connection Error" });
//   }
// });

// // 3. Mount Routes cleanly
// app.use("/api/auth", async (req, res, next) => {
//   const { auth } = await initDbAndAuth();
//   return createAuthRoutes(auth)(req, res, next);
// });

// app.use("/api/payments", paymentsRoutes);

// app.all("/api/auth/*", async (req, res, next) => {
//   const { auth } = await initDbAndAuth();
//   return toNodeHandler(auth)(req, res);
// });

// app.use(express.json());

// app.use("/api/uploads", uploadRoutes);
// app.use("/api/items", itemRoutes);
// app.use("/api/ai", aiRoutes);
// app.use("/api/reviews", reviewRoutes);
// app.use("/api/dashboard", dashboardRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/chat", chatRoutes);
// app.use("/api/stats", statsRoutes);
// app.get("/", (req, res) => res.json({ name: "Relive API", version: "1.0.0", status: "running" }));
// app.get("/health", (req, res) => res.json({ status: "ok" }));

// app.use((req, res) => {
//   res.status(404).json({ error: "Not found", path: req.originalUrl });
// });

// // 4. Run local server wrapper only if NOT in production cloud runtime environment
// if (process.env.NODE_ENV !== "production") {
//   initDbAndAuth().then(() => {
//     app.listen(PORT, () => {
//       console.log(`[server] Relive backend running on http://localhost:${PORT}`);
//     });
//   }).catch((err) => {
//     console.error("[server] Failed to start local server instance:", err);
//   });
// }

// // 5. CRITICAL STEP: Export app instance explicitly for Vercel Serverless runtimes
// export default app;


import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { connectDB } from "./config/db.js";
import { createAuth } from "./lib/auth.js";
import aiRoutes from "./routes/ai.routes.js";
import itemRoutes from "./routes/items.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import statsRoutes from "./routes/stats.routes.js";

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// 1. Initialize the Express app
const app = express();

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  }),
);
app.use(cookieParser());

// 2. Lazy DB + auth init, cached after first call
let db: any = null;
let auth: any = null;

const initDbAndAuth = async () => {
  if (!db || !auth) {
    db = await connectDB();
    auth = createAuth(db);
  }
  return { db, auth };
};

// Attach auth instance to every request
app.use(async (req, res, next) => {
  try {
    const { auth } = await initDbAndAuth();
    req.auth = auth;
    next();
  } catch (err) {
    console.error("[server] Database connection error:", err);
    res.status(500).json({ error: "Internal Database Connection Error" });
  }
});

// 3. Better-auth handler — single mount point
app.all("/api/auth/*", async (req, res, next) => {
  try {
    const { auth } = await initDbAndAuth();
    return toNodeHandler(auth)(req, res);
  } catch (err) {
    next(err);
  }
});

// Payments router MUST come before the global express.json(), since it
// has its own per-route body parsers (raw body for the Stripe webhook,
// json for the other routes). If global json() ran first, it would
// consume the request stream and break both the webhook signature
// check and the router's own json parsing.
app.use("/api/payments", paymentsRoutes);

// Global JSON body parser for everything else below this line
app.use(express.json());

app.use("/api/uploads", uploadRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/stats", statsRoutes);

app.get("/", (req, res) => res.json({ name: "Relive API", version: "1.0.0", status: "running" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// 4. Always start the server (Render needs a persistent listener)
initDbAndAuth()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] Relive backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[server] Failed to start server:", err);
  });

export default app;