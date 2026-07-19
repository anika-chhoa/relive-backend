import type { Request, Response } from "express";
import { geminiModel, extractJSON } from "../lib/gemini.js";
import type {
  GenerateDescriptionInput,
  GenerateDescriptionOutput,
  ImproveDescriptionInput,
  ListingLength,
} from "../types/domain.js";

const LENGTH_GUIDE: Record<ListingLength, string> = {
  short: "1 short sentence for the short description, and a 2-3 sentence full description.",
  medium: "1-2 sentences for the short description, and a 4-6 sentence full description.",
  detailed:
    "1-2 sentences for the short description, and a detailed 7-10 sentence full description covering condition, features, and why a buyer would want it.",
};

// --- Custom prompt template: listing generation -----------------------
function buildGenerationPrompt({
  title,
  keywords,
  category,
  condition,
  length,
}: GenerateDescriptionInput): string {
  const lengthInstruction = LENGTH_GUIDE[length || "medium"];

  return `You are a copywriter for Relive, a trusted second-hand marketplace.
Write a marketplace listing for the item below. Be honest, specific, and
warm — never invent details the seller didn't mention. Do not use emojis
or hype words like "amazing" or "must-have".

Item title: ${title}
Category: ${category || "Not specified"}
Condition: ${condition || "Not specified"}
Seller's notes/keywords: ${keywords || "None provided"}

Length requirement: ${lengthInstruction}

Respond with ONLY valid JSON in this exact shape, no markdown fences:
{"shortDescription": "...", "fullDescription": "..."}`;
}

export async function generateDescription(req: Request, res: Response) {
  try {
    const { title, keywords, category, condition, length = "medium" } =
      req.body as GenerateDescriptionInput;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required to generate a description" });
    }

    const prompt = buildGenerationPrompt({ title, keywords, category, condition, length });
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();

    const parsed = extractJSON<GenerateDescriptionOutput>(text);
    res.json(parsed);
  } catch (err) {
    console.error("[ai] generateDescription failed:", err);
    res.status(500).json({ error: "Could not generate a description right now" });
  }
}

// --- Custom prompt template: improve/polish existing text --------------
function buildImprovePrompt({ text, field }: ImproveDescriptionInput): string {
  return `You are editing a "${field === "short" ? "short" : "full"}" listing
description for a second-hand marketplace called Relive. Improve grammar,
clarity and tone WITHOUT changing any facts, adding new claims, or
changing the length category drastically. Keep the seller's original
meaning and voice.

Original text:
"""
${text}
"""

Respond with ONLY valid JSON in this exact shape, no markdown fences:
{"improved": "..."}`;
}

export async function improveDescription(req: Request, res: Response) {
  try {
    const { text, field } = req.body as ImproveDescriptionInput;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    const prompt = buildImprovePrompt({ text, field });
    const result = await geminiModel.generateContent(prompt);
    const parsed = extractJSON<{ improved: string }>(result.response.text());
    res.json(parsed);
  } catch (err) {
    console.error("[ai] improveDescription failed:", err);
    res.status(500).json({ error: "Could not improve this description right now" });
  }
}
