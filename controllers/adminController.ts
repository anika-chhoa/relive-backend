import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import type { Item, Review, UserDoc } from "../types/domain.js";

export async function getOverview(req: Request, res: Response) {
  try {
    const db = getDB();
    const items = db.collection<Item>("items");
    const reviews = db.collection<Review>("reviews");
    const users = db.collection<UserDoc>("users");

    const [
      totalUsers,
      totalListings,
      soldItems,
      totalReviews,
      salesOverTimeRaw,
      categoryBreakdownRaw,
      newUsersOverTimeRaw,
    ] = await Promise.all([
      users.countDocuments({}),
      items.countDocuments({ status: "active" }),
      items.find({ status: "sold" }).project({ price: 1 }).toArray(),
      reviews.countDocuments({}),
      items
        .aggregate([
          { $match: { status: "sold", soldAt: { $exists: true } } },
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
          { $match: { status: "active" } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ])
        .toArray(),
      users
        .aggregate([
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 6 },
        ])
        .toArray(),
    ]);

    const totalGMV = soldItems.reduce((sum, i) => sum + i.price, 0);

    res.json({
      stats: {
        totalUsers,
        totalListings,
        totalGMV,
        totalReviews,
      },
      salesOverTime: salesOverTimeRaw.map((r) => ({ month: r._id, total: r.total })),
      categoryBreakdown: categoryBreakdownRaw.map((r) => ({ category: r._id, count: r.count })),
      newUsersOverTime: newUsersOverTimeRaw.map((r) => ({ month: r._id, count: r.count })),
    });
  } catch (err) {
    console.error("[admin] getOverview failed:", err);
    res.status(500).json({ error: "Could not load admin overview" });
  }
}

// Platform-wide item moderation — every item regardless of seller.
export async function getAllItems(req: Request, res: Response) {
  try {
    const db = getDB();
    const items = await db
      .collection<Item>("items")
      .find({ status: { $ne: "removed" } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    res.json({ items });
  } catch (err) {
    console.error("[admin] getAllItems failed:", err);
    res.status(500).json({ error: "Could not load listings" });
  }
}

// Unlike the seller's own DELETE /api/items/:id, this has no ownership
// check and no "must be active" restriction — admin can moderate anything.
export async function adminDeleteItem(req: Request, res: Response) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }
    await db
      .collection<Item>("items")
      .updateOne(
        { _id: new ObjectId(id) as any },
        { $set: { status: "removed", updatedAt: new Date() } }
      );
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] adminDeleteItem failed:", err);
    res.status(500).json({ error: "Could not remove this listing" });
  }
}

export async function getAllUsers(req: Request, res: Response) {
  try {
    const db = getDB();
    const users = await db
      .collection<UserDoc>("users")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      users: users.map((u) => ({
        id: u._id!.toString(),
        name: u.name,
        email: u.email,
        image: u.image,
        provider: u.provider,
        suspended: Boolean(u.suspended),
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error("[admin] getAllUsers failed:", err);
    res.status(500).json({ error: "Could not load users" });
  }
}

// Suspends/unsuspends a user. Credential users are blocked at their next
// login attempt; Google users are blocked at their next sync-session call
// (see authController.ts) — both check the same `users` collection now.
export async function toggleSuspendUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { suspended } = req.body as { suspended: boolean };
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const db = getDB();
    await db
      .collection<UserDoc>("users")
      .updateOne({ _id: new ObjectId(id) as any }, { $set: { suspended: Boolean(suspended) } });
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] toggleSuspendUser failed:", err);
    res.status(500).json({ error: "Could not update this user" });
  }
}