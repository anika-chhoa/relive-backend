import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { generateDescription, improveDescription } from "../controllers/aiController.js";

const router = Router();

router.post("/generate-description", verifyJWT, generateDescription);
router.post("/improve-description", verifyJWT, improveDescription);

export default router;
