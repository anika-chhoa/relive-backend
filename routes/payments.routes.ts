import { Router } from "express";
import express from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import {
  createCheckoutSession,
  handleWebhook,
  getSessionStatus,
  confirmPayment,
} from "../controllers/paymentsController.js";

const router = Router();

router.post("/create-checkout-session", express.json(), verifyJWT, createCheckoutSession);

// Raw body required for Stripe's signature check — must NOT go through
// express.json(). Scoped to this route only, same pattern as auth.routes.ts.
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

router.get("/session/:sessionId", getSessionStatus);
router.post("/confirm/:sessionId", express.json(), verifyJWT, confirmPayment);

export default router;
