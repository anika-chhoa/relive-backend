import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { stripe } from "../lib/stripe.js";
import { getDB } from "../config/db.js";
import type { Item } from "../types/domain.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// NOTE: Stripe does not support BDT (Bangladeshi Taka) for Checkout.
// For this demo, the item's price is charged 1:1 in USD instead of doing
// a real currency conversion — clearly flagged here and on the button.
const DEMO_CURRENCY = "usd";

export async function createCheckoutSession(req: Request, res: Response) {
  try {
    const { itemId } = req.body as { itemId?: string };
    if (!itemId || !ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: "Invalid item" });
    }

    const db = getDB();
    const item = await db.collection<Item>("items").findOne({ _id: new ObjectId(itemId) as any });
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    if (item.status !== "active") {
      return res.status(400).json({ error: "This item is no longer available" });
    }
    if (item.sellerId === req.user!.id) {
      return res.status(400).json({ error: "You can't buy your own listing" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: DEMO_CURRENCY,
            product_data: {
              name: item.title,
              images: item.images?.[0] ? [item.images[0]] : undefined,
            },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/items/${itemId}`,
      metadata: {
        itemId,
        buyerId: req.user!.id,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[payments] createCheckoutSession failed:", err);
    res.status(500).json({ error: "Could not start checkout" });
  }
}

// Stripe calls this directly — never trust a client-side "payment done"
// signal, only mark an item sold once Stripe confirms the charge here.
export async function handleWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, webhookSecret as string);
  } catch (err) {
    console.error("[payments] webhook signature verification failed:", err);
    return res.status(400).send("Webhook signature verification failed");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { itemId?: string; buyerId?: string } };
    const { itemId, buyerId } = session.metadata || {};

    if (itemId && ObjectId.isValid(itemId)) {
      const db = getDB();
      await db.collection<Item>("items").updateOne(
        { _id: new ObjectId(itemId) as any },
        { $set: { status: "sold", buyerId, soldAt: new Date(), updatedAt: new Date() } }
      );
    }
  }

  res.json({ received: true });
}

// Used by the frontend success page to show a real confirmation
// (item title, amount) instead of a generic "thanks" message.
export async function getSessionStatus(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      status: session.payment_status,
      itemId: session.metadata?.itemId,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  } catch (err) {
    console.error("[payments] getSessionStatus failed:", err);
    res.status(404).json({ error: "Session not found" });
  }
}
