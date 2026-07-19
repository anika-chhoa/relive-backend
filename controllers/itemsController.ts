import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import type { CreateItemInput, Item } from "../types/domain.js";

const MAX_IMAGES = 7; // 1 cover + up to 6 additional

const REQUIRED_FIELDS: (keyof CreateItemInput)[] = [
  "title",
  "category",
  "condition",
  "price",
  "location",
  "shortDescription",
  "fullDescription",
];

function validateItemBody(body: Partial<CreateItemInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of REQUIRED_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      errors[field] = `${field} is required`;
    }
  }
  if (body.price !== undefined && Number.isNaN(Number(body.price))) {
    errors.price = "Price must be a number";
  }

  const images = body.images;
  if (!images || !Array.isArray(images) || images.length === 0) {
    errors.images = "A cover image is required";
  } else if (images.length > MAX_IMAGES) {
    errors.images = `You can add at most ${MAX_IMAGES} images`;
  } else {
    for (const url of images) {
      try {
        new URL(url);
      } catch {
        errors.images = "One or more image URLs are invalid";
        break;
      }
    }
  }

  return errors;
}

export async function createItem(req: Request, res: Response) {
  try {
    const errors = validateItemBody(req.body as Partial<CreateItemInput>);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const db = getDB();
    const {
      title,
      category,
      condition,
      price,
      location,
      shortDescription,
      fullDescription,
      images,
    } = req.body as CreateItemInput;

    const doc: Item = {
      title: title.trim(),
      category,
      condition,
      price: Number(price),
      location: location.trim(),
      shortDescription: shortDescription.trim(),
      fullDescription: fullDescription.trim(),
      images,
      sellerId: req.user!.id,
      sellerName: req.user!.name,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<Item>("items").insertOne(doc);
    res.status(201).json({ id: result.insertedId, ...doc });
  } catch (err) {
    console.error("[items] createItem failed:", err);
    res.status(500).json({ error: "Could not create the listing" });
  }
}

// Powers the homepage Featured Listings section and the Explore page —
// supports the category/price filters and pagination the requirements ask for.
// Each item is joined with its reviews to attach avgRating/reviewCount
// for card display, without ever storing that on the item document.
export async function getItems(req: Request, res: Response) {
  try {
    const db = getDB();
    const {
      search,
      category,
      minPrice,
      maxPrice,
      sort = "newest",
      page = "1",
      limit = "8",
      excludeId,
    } = req.query as Record<string, string>;

    const query: Record<string, unknown> = { status: "active" };
    if (search) {
      query.title = { $regex: search, $options: "i" };
    }
    if (category) query.category = category;
    if (excludeId && ObjectId.isValid(excludeId)) {
      query._id = { $ne: new ObjectId(excludeId) };
    }
    if (minPrice || maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);
      query.price = priceFilter;
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      "price-low": { price: 1 },
      "price-high": { price: -1 },
    };

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      db
        .collection<Item>("items")
        .aggregate([
          { $match: query },
          { $sort: sortMap[sort] || sortMap.newest },
          { $skip: skip },
          { $limit: limitNum },
          {
            $lookup: {
              from: "reviews",
              localField: "sellerId",
              foreignField: "sellerId",
              as: "reviews",
            },
          },
          {
            $addFields: {
              reviewCount: { $size: "$reviews" },
              avgRating: {
                $cond: [
                  { $gt: [{ $size: "$reviews" }, 0] },
                  { $round: [{ $avg: "$reviews.rating" }, 1] },
                  0,
                ],
              },
            },
          },
          { $project: { reviews: 0 } },
        ])
        .toArray(),
      db.collection<Item>("items").countDocuments(query),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[items] getItems failed:", err);
    res.status(500).json({ error: "Could not load listings" });
  }
}

export async function getItemById(req: Request, res: Response) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }

    const results = await db
      .collection<Item>("items")
      .aggregate([
        { $match: { _id: new ObjectId(id) } },
        {
          $lookup: {
            from: "reviews",
            localField: "sellerId",
            foreignField: "sellerId",
            as: "reviews",
          },
        },
        {
          $addFields: {
            reviewCount: { $size: "$reviews" },
            avgRating: {
              $cond: [
                { $gt: [{ $size: "$reviews" }, 0] },
                { $round: [{ $avg: "$reviews.rating" }, 1] },
                0,
              ],
            },
          },
        },
        { $project: { reviews: 0 } },
      ])
      .toArray();

    const item = results[0];
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) {
    console.error("[items] getItemById failed:", err);
    res.status(500).json({ error: "Could not load this item" });
  }
}

// Manage Items page — every item this seller has ever listed, regardless
// of status (active/sold/removed), unlike the public getItems which only
// ever returns "active" ones.
export async function getMyItems(req: Request, res: Response) {
  try {
    const db = getDB();
    const items = await db
      .collection<Item>("items")
      .find({ sellerId: req.user!.id, status: { $ne: "removed" } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ items });
  } catch (err) {
    console.error("[items] getMyItems failed:", err);
    res.status(500).json({ error: "Could not load your listings" });
  }
}

export async function updateItem(req: Request, res: Response) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }

    const existing = await db.collection<Item>("items").findOne({ _id: new ObjectId(id) as any });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    if (existing.sellerId !== req.user!.id) {
      return res.status(403).json({ error: "You can only edit your own listings" });
    }
    if (existing.status !== "active") {
      return res.status(400).json({ error: "Sold listings can't be edited" });
    }

    const errors = validateItemBody(req.body as Partial<CreateItemInput>);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const {
      title,
      category,
      condition,
      price,
      location,
      shortDescription,
      fullDescription,
      images,
    } = req.body as CreateItemInput;

    await db.collection<Item>("items").updateOne(
      { _id: new ObjectId(id) as any },
      {
        $set: {
          title: title.trim(),
          category,
          condition,
          price: Number(price),
          location: location.trim(),
          shortDescription: shortDescription.trim(),
          fullDescription: fullDescription.trim(),
          images,
          updatedAt: new Date(),
        },
      }
    );

    const updated = await db.collection<Item>("items").findOne({ _id: new ObjectId(id) as any });
    res.json(updated);
  } catch (err) {
    console.error("[items] updateItem failed:", err);
    res.status(500).json({ error: "Could not update this listing" });
  }
}

// Soft-delete only — a sold item's record is kept (transaction/dispute
// reference), and even "removed" active listings just stop showing up
// in public queries rather than being erased.
export async function deleteItem(req: Request, res: Response) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item id" });
    }

    const existing = await db.collection<Item>("items").findOne({ _id: new ObjectId(id) as any });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    if (existing.sellerId !== req.user!.id) {
      return res.status(403).json({ error: "You can only delete your own listings" });
    }
    if (existing.status !== "active") {
      return res.status(400).json({ error: "Sold listings can't be deleted" });
    }

    await db.collection<Item>("items").updateOne(
      { _id: new ObjectId(id) as any },
      { $set: { status: "removed", updatedAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[items] deleteItem failed:", err);
    res.status(500).json({ error: "Could not delete this listing" });
  }
}
