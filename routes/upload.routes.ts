import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { getAvatarUploadSignature, getItemUploadSignature } from "../controllers/uploadController.js";

const router = Router();

// Avatar signature: intentionally NOT behind verifyJWT — during
// registration the user isn't authenticated yet. It only hands out a
// short-lived signature, never the API secret itself.
router.post("/signature", getAvatarUploadSignature);

// Item image signature: only logged-in sellers can request one.
router.post("/signature/item", verifyJWT, getItemUploadSignature);

export default router;
