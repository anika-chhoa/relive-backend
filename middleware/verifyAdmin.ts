import type { Request, Response, NextFunction } from "express";
import { isAdminEmail } from "../lib/adminEmails.js";

// Must run AFTER verifyJWT — relies on req.user being already populated.
export function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}