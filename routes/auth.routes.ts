import { Router } from "express";
import express from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import {
  registerUser,
  loginUser,
  syncGoogleSession,
  me,
  logout,
} from "../controllers/authController.js";
import type { Auth } from "../lib/auth.js";

// JSON body parsing is scoped to each individual route (not router-wide)
// so that unmatched paths under /api/auth — e.g. Better Auth's
// /api/auth/sign-in/social, /api/auth/callback/google — reach the
// Better Auth handler with their raw, unconsumed request body.
export function createAuthRoutes(auth: Auth) {
  const router = Router();

  router.post("/register", express.json(), registerUser);
  router.post("/login", express.json(), loginUser);
  router.post("/sync-session", syncGoogleSession(auth));
  router.get("/me", verifyJWT, me);
  router.post("/logout", logout);

  return router;
}
