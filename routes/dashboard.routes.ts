import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { getMyDashboard } from "../controllers/dashboardController.js";

const router = Router();
router.get("/me", verifyJWT, getMyDashboard);
export default router;