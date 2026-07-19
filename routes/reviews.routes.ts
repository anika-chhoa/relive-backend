import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { createReview, getSellerReviews, getFeaturedReviews } from "../controllers/reviewsController.js";

const router = Router();

router.get("/featured", getFeaturedReviews);
router.get("/seller/:sellerId", getSellerReviews);
router.post("/", verifyJWT, createReview);

export default router;
