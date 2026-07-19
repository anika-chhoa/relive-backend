import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import type { Review, CreateReviewInput, Item } from "../types/domain.js";

const MIN_RATING = 1;
const MAX_RATING = 5;

export async function createReview(req: Request, res: Response) {
  try {
    const { itemId, rating, comment } = req.body as CreateReviewInput;

    const errors: Record<string, string> = {};
    if (!itemId || !ObjectId.isValid(itemId)) errors.itemId = "Invalid item";
    if (!rating || rating < MIN_RATING || rating > MAX_RATING) {
      errors.rating = `Rating must be between ${MIN_RATING} and ${MAX_RATING}`;
    }
    if (!comment || !comment.trim()) errors.comment = "Review text is required";
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const db = getDB();
    const item = await db.collection<Item>("items").findOne({ _id: new ObjectId(itemId) as any });
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    if (item.sellerId === req.user!.id) {
      return res.status(400).json({ error: "You can't review your own listing" });
    }

    // One review per reviewer-per-seller: reviewing again (about any of
    // that seller's items) updates the existing review instead of
    // stacking duplicates — keeps the seller's rating honest.
    const update = {
      $set: {
        sellerId: item.sellerId,
        itemId: new ObjectId(itemId) as any,
        itemTitle: item.title,
        rating: Number(rating),
        comment: comment.trim(),
        reviewerId: req.user!.id,
        reviewerName: req.user!.name || "Relive user",
        reviewerEmail: req.user!.email || "",
        reviewerImage: req.user!.image ?? null,
        createdAt: new Date(),
      },
    };

    const result = await db
      .collection<Review>("reviews")
      .findOneAndUpdate(
        { reviewerId: req.user!.id, sellerId: item.sellerId },
        update,
        { upsert: true, returnDocument: "after" }
      );

    res.status(201).json(result);
  } catch (err) {
    console.error("[reviews] createReview failed:", err);
    res.status(500).json({ error: "Could not submit your review" });
  }
}

// A seller's reviews, aggregated across every item they've ever sold —
// this is what shows on Details pages and item cards as "the" rating.
export async function getSellerReviews(req: Request, res: Response) {
  try {
    const { sellerId } = req.params;
    if (!sellerId) {
      return res.status(400).json({ error: "Invalid seller id" });
    }

    const db = getDB();
    const reviews = await db
      .collection<Review>("reviews")
      .find({ sellerId })
      .sort({ createdAt: -1 })
      .toArray();

    const count = reviews.length;
    const avgRating = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

    res.json({ reviews, avgRating: Number(avgRating.toFixed(1)), count });
  } catch (err) {
    console.error("[reviews] getSellerReviews failed:", err);
    res.status(500).json({ error: "Could not load reviews" });
  }
}

// Homepage Testimonials — highest-rated, most substantial reviews first.
export async function getFeaturedReviews(req: Request, res: Response) {
  try {
    const db = getDB();
    const limit = Number(req.query.limit) || 6;

    const reviews = await db
      .collection<Review>("reviews")
      .find({ rating: { $gte: 4 }, comment: { $exists: true, $ne: "" } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ reviews });
  } catch (err) {
    console.error("[reviews] getFeaturedReviews failed:", err);
    res.status(500).json({ error: "Could not load reviews" });
  }
}
