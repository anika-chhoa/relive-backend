import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { getHistory, postMessage } from "../controllers/chatController.js";

const router = Router();
router.get("/history", verifyJWT, getHistory);
router.post("/message", verifyJWT, postMessage);
export default router;