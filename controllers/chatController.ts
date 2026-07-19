import type { Request, Response } from "express";
import { getDB } from "../config/db.js";
import { geminiModel } from "../lib/gemini.js";
import { RELIVE_SYSTEM_PROMPT } from "../lib/chatContext.js";
import type { ChatMessage, Item } from "../types/domain.js";

const HISTORY_LIMIT = 50;

const STOPWORDS = new Set([
  "i", "want", "to", "buy", "do", "you", "have", "any", "tell", "me", "about",
  "which", "products", "product", "available", "the", "a", "an", "for", "is",
  "are", "in", "of", "on", "and", "that", "this", "please", "can", "could",
  "would", "like", "looking", "find", "show", "list", "section", "its",
  "get", "need", "with", "there",
]);

function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// The actual RAG step: pull real, currently-active listings that match
// the user's message so Gemini answers with real titles/prices/links
// instead of generic "go check /explore" filler.
async function searchRelevantItems(message: string): Promise<Item[]> {
  const db = getDB();
  const items = db.collection<Item>("items");
  const keywords = extractKeywords(message);

  let results: Item[] = [];
  if (keywords.length > 0) {
    const orConditions = keywords.flatMap((k) => [
      { title: { $regex: k, $options: "i" } },
      { category: { $regex: k, $options: "i" } },
      { shortDescription: { $regex: k, $options: "i" } },
    ]);
    results = await items
      .find({ status: "active", $or: orConditions })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
  }

  // Nothing matched (or the message had no useful keywords, e.g. "what's
  // available?") — fall back to a small sample of recent active items
  // instead of returning nothing.
  if (results.length === 0) {
    results = await items.find({ status: "active" }).sort({ createdAt: -1 }).limit(5).toArray();
  }

  return results;
}

function formatItemsForPrompt(items: Item[]): string {
  if (items.length === 0) {
    return "No items are currently listed on Relive.";
  }
  return items
    .map(
      (it) =>
        `- "${it.title}" — ৳${it.price.toLocaleString("en-BD")} — ${it.category} — Condition: ${it.condition} — Location: ${it.location} — Details & Book: /items/${it._id}`
    )
    .join("\n");
}

export async function getHistory(req: Request, res: Response) {
  try {
    const db = getDB();
    const messages = await db
      .collection<ChatMessage>("chat_messages")
      .find({ userId: req.user!.id })
      .sort({ createdAt: 1 })
      .limit(HISTORY_LIMIT)
      .toArray();
    res.json({ messages });
  } catch (err) {
    console.error("[chat] getHistory failed:", err);
    res.status(500).json({ error: "Could not load chat history" });
  }
}

export async function postMessage(req: Request, res: Response) {
  const { message } = req.body as { message?: string };
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const db = getDB();
  const chatMessages = db.collection<ChatMessage>("chat_messages");
  const userId = req.user!.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function send(payload: unknown) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  try {
    await chatMessages.insertOne({ userId, role: "user", content: message, createdAt: new Date() });

    const recent = await chatMessages.find({ userId }).sort({ createdAt: -1 }).limit(12).toArray();
    const history = recent
      .reverse()
      .slice(0, -1)
      .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));

    // Real listing data for THIS turn — fetched fresh every message so
    // it's never stale, and never saved to chat_messages (it's scaffolding
    // for the model, not part of the visible conversation).
    const relevantItems = await searchRelevantItems(message);
    const itemsContext = formatItemsForPrompt(relevantItems);

    const chat = geminiModel.startChat({
      history: [
        { role: "user", parts: [{ text: RELIVE_SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Understood — I'm ready to help with Relive." }] },
        ...history,
        {
          role: "user",
          parts: [
            {
              text: `[LIVE MARKETPLACE DATA — not part of the visible conversation, use it to answer the next message accurately]
Currently relevant listings on Relive:
${itemsContext}

Rules for using this data:
- If the user is asking about buying/browsing/availability/price, base your answer on these REAL listings — use their exact title, price, and condition. Never invent items or prices.
- If nothing here is genuinely relevant to what they asked, say so honestly and suggest checking /explore — don't force-fit unrelated items.
- When mentioning an item, include how to get it: open its page (the "Details & Book" path above) and click "Book Now" to pay via Stripe.
- Keep the reply conversational, not just a raw list dump, unless they're asking to browse multiple items.`,
            },
          ],
        },
        { role: "model", parts: [{ text: "Got it — I'll use this real listing data in my next reply." }] },
      ],
    });

    const result = await chat.sendMessageStream(message);
    let fullText = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullText += text;
        send({ type: "chunk", text });
      }
    }

    await chatMessages.insertOne({ userId, role: "assistant", content: fullText, createdAt: new Date() });

    try {
      const suggestionPrompt = `Based on this assistant reply on a marketplace app, suggest exactly 3 short follow-up questions the user might ask next (each under 8 words). Reply with ONLY valid JSON: {"items": ["...", "...", "..."]}\n\nReply: """${fullText}"""`;
      const suggestionResult = await geminiModel.generateContent(suggestionPrompt);
      const cleaned = suggestionResult.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      send({ type: "suggestions", items: parsed.items || [] });
    } catch {
      send({ type: "suggestions", items: [] });
    }

    send({ type: "done" });
    res.end();
  } catch (err) {
    console.error("[chat] postMessage failed:", err);
    send({ type: "error", message: "Something went wrong. Please try again." });
    res.end();
  }
}