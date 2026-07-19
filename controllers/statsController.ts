import type { Request, Response } from "express";
import { getDB } from "../config/db.js";
import type { Item, Review, UserDoc } from "../types/domain.js";

export async function getPublicStats(req: Request, res: Response) {
  try {
    const db = getDB();
    const [totalUsers, totalListings, soldItems, totalReviews] = await Promise.all([
      db.collection<UserDoc>("users").countDocuments({}),
      db.collection<Item>("items").countDocuments({ status: "active" }),
      db.collection<Item>("items").find({ status: "sold" }).project({ price: 1 }).toArray(),
      db.collection<Review>("reviews").countDocuments({}),
    ]);

    const totalGMV = soldItems.reduce((sum, i) => sum + i.price, 0);

    res.json({ totalUsers, totalListings, totalGMV, totalReviews });
  } catch (err) {
    console.error("[stats] getPublicStats failed:", err);
    res.status(500).json({ error: "Could not load stats" });
  }
}