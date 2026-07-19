import type { Request, Response, NextFunction } from "express";
import { verifyAppJWT, COOKIE_NAME } from "../lib/jwt.js";

export async function verifyJWT(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (req.cookies?.[COOKIE_NAME] as string | undefined);

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    req.user = await verifyAppJWT(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
