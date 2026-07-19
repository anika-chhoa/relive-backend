import type { Request, Response } from "express";
import { getDB } from "../config/db.js";
import type { Item, Review } from "../types/domain.js";

export async function getMyDashboard(req: Request, res: Response) {
  try {
    const db = getDB();
    const userId = req.user!.id;
    const items = db.collection<Item>("items");
    const reviews = db.collection<Review>("reviews");

    const [
      activeListings,
      soldByMe,
      boughtByMe,
      reviewStats,
      recentSales,
      recentPurchases,
      recentReviews,
      salesOverTimeRaw,
      categoryBreakdownRaw,
    ] = await Promise.all([
      items.countDocuments({ sellerId: userId, status: "active" }),
      items.find({ sellerId: userId, status: "sold" }).toArray(),
      items.find({ buyerId: userId, status: "sold" }).toArray(),
      reviews.find({ sellerId: userId }).toArray(),
      items
        .find({ sellerId: userId, status: "sold" })
        .sort({ soldAt: -1 })
        .limit(5)
        .project({ title: 1, price: 1, soldAt: 1 })
        .toArray(),
      items
        .find({ buyerId: userId, status: "sold" })
        .sort({ soldAt: -1 })
        .limit(5)
        .project({ title: 1, price: 1, soldAt: 1, sellerName: 1 })
        .toArray(),
      reviews.find({ sellerId: userId }).sort({ createdAt: -1 }).limit(3).toArray(),
      items
        .aggregate([
          { $match: { sellerId: userId, status: "sold", soldAt: { $exists: true } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$soldAt" } },
              total: { $sum: "$price" },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 6 },
        ])
        .toArray(),
      items
        .aggregate([
          { $match: { sellerId: userId, status: "active" } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const totalSalesAmount = soldByMe.reduce((sum, i) => sum + i.price, 0);
    const totalPurchasesAmount = boughtByMe.reduce((sum, i) => sum + i.price, 0);
    const reviewCount = reviewStats.length;
    const avgRating =
      reviewCount > 0 ? reviewStats.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;

    res.json({
      stats: {
        activeListings,
        totalSalesAmount,
        salesCount: soldByMe.length,
        itemsPurchased: boughtByMe.length,
        totalPurchasesAmount,
        sellerRating: Number(avgRating.toFixed(1)),
        reviewCount,
      },
      recentSales,
      recentPurchases,
      recentReviews,
      salesOverTime: salesOverTimeRaw.map((r) => ({ month: r._id, total: r.total })),
      categoryBreakdown: categoryBreakdownRaw.map((r) => ({ category: r._id, count: r.count })),
    });
  } catch (err) {
    console.error("[dashboard] getMyDashboard failed:", err);
    res.status(500).json({ error: "Could not load your dashboard" });
  }
}