import { Router } from "express";
import { getPublicStats } from "../controllers/statsController.js";

const router = Router();
router.get("/public", getPublicStats);
export default router;