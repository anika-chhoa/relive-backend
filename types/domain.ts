export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
  isAdmin?: boolean; 
}

// Only credential (email/password) users live here — Google users are
// created and owned entirely by Better Auth's own collections.
export interface UserDoc {
  _id?: unknown;
  name: string;
  email: string;
  passwordHash?: string;
  image: string | null;
  provider: "credentials" | "google";
  authId?: string;
  role: "user" | "admin";
  suspended?: boolean;
  createdAt: Date;
}

export type ItemCondition = "Like New" | "Good" | "Fair" | "Needs Repair";

export interface Item {
  _id?: unknown;
  title: string;
  category: string;
  condition: ItemCondition | string;
  price: number;
  location: string;
  shortDescription: string;
  fullDescription: string;
  images: string[]; // images[0] is the cover image; max 7 total
  sellerId: string;
  sellerName?: string;
  status: "active" | "sold" | "removed";
  buyerId?: string;
  soldAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Computed via aggregation from the separate `reviews` collection —
  // this is the SELLER's aggregate rating (see note below), never
  // stored directly on the item document.
  avgRating?: number;
  reviewCount?: number;
}

// Reviews are about the SELLER, not the item. Each used item is a
// one-off listing — once sold it never comes back, so an "item rating"
// has no future value for other buyers. What matters (and matches how
// OLX/Bikroi/eBay/Facebook Marketplace work) is the seller's reputation
// across everything they've ever sold. `itemId`/`itemTitle` are kept
// only as display context ("reviewed after buying {itemTitle}") — all
// aggregation (avgRating/reviewCount) happens on `sellerId`.
export interface Review {
  _id?: unknown;
  sellerId: string;
  itemId: unknown; // ObjectId — the item this review references, for context only
  itemTitle?: string; // denormalized at write time for fast display
  rating: number; // 1-5
  comment: string;
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewerImage: string | null;
  createdAt: Date;
}

export interface CreateReviewInput {
  itemId: string;
  rating: number;
  comment: string;
}

export interface CreateItemInput {
  title: string;
  category: string;
  condition: string;
  price: number | string;
  location: string;
  shortDescription: string;
  fullDescription: string;
  images: string[];
}

export type ListingLength = "short" | "medium" | "detailed";

export interface GenerateDescriptionInput {
  title: string;
  keywords?: string;
  category?: string;
  condition?: string;
  length?: ListingLength;
}

export interface GenerateDescriptionOutput {
  shortDescription: string;
  fullDescription: string;
}

export interface ImproveDescriptionInput {
  text: string;
  field: "short" | "full";
}

export interface ChatMessage {
  _id?: unknown;
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}
