import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("[gemini] GEMINI_API_KEY is not set — AI routes will fail");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// Model name current as of early 2026 — check Google AI Studio / the
// Gemini API docs for the latest recommended flash model before shipping,
// naming changes fairly often.
export const geminiModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
});

// Gemini sometimes wraps JSON responses in ```json fences — strip them
// before parsing so callers can just JSON.parse() the result.
export function extractJSON<T = unknown>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as T;
}
