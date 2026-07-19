import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getDB } from "../config/db.js";
import { signAppJWT, setAuthCookie, clearAuthCookie } from "../lib/jwt.js";
import type { Auth } from "../lib/auth.js";
import type { UserDoc, AuthUser } from "../types/domain.js";

const SALT_ROUNDS = 10;

function toPublicUser(doc: UserDoc, id: string): AuthUser {
  return { id, name: doc.name, email: doc.email, image: doc.image };
}

function toFetchHeaders(expressHeaders: Request["headers"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(expressHeaders)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

// --- Custom credentials register/login (no Better Auth involved) -------

export async function registerUser(req: Request, res: Response) {
  try {
    const { name, email, password, image } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      image?: string;
    };

    const errors: Record<string, string> = {};
    if (!name || !name.trim()) errors.name = "Full name is required";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address";
    if (!password || password.length < 8) errors.password = "Password must be at least 8 characters";
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const db = getDB();
    const users = db.collection<UserDoc>("users");

    const existing = await users.findOne({ email: email!.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password!, SALT_ROUNDS);
    const doc: UserDoc = {
      name: name!.trim(),
      email: email!.toLowerCase(),
      passwordHash,
      image: image || null,
      createdAt: new Date(),
    };

    const result = await users.insertOne(doc);
    const user = toPublicUser(doc, result.insertedId.toString());

    const token = await signAppJWT(user);
    setAuthCookie(res, token);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error("[auth] registerUser failed:", err);
    res.status(500).json({ error: "Could not create your account" });
  }
}

export async function loginUser(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const db = getDB();
    const users = db.collection<UserDoc>("users");
    const doc = await users.findOne({ email: email.toLowerCase() });
    if (!doc) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, doc.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = toPublicUser(doc, doc._id!.toString());
    const token = await signAppJWT(user);
    setAuthCookie(res, token);

    res.json({ user, token });
  } catch (err) {
    console.error("[auth] loginUser failed:", err);
    res.status(500).json({ error: "Could not log you in right now" });
  }
}

// --- Bridge: Better Auth (Google) session -> our own app JWT -----------

export function syncGoogleSession(auth: Auth) {
  return async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({
        headers: toFetchHeaders(req.headers),
      });

      if (!session?.user) {
        return res.status(401).json({ error: "No active Google session" });
      }

      const user: AuthUser = {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
        image: session.user.image ?? null,
      };

      const token = await signAppJWT(user);
      setAuthCookie(res, token);

      res.json({ user });
    } catch (err) {
      console.error("[auth] syncGoogleSession failed:", err);
      res.status(500).json({ error: "Could not complete Google sign-in" });
    }
  };
}

// --- Shared: who am I / log out -----------------------------------------

export async function me(req: Request, res: Response) {
  res.json({ user: req.user });
}

export function logout(req: Request, res: Response) {
  clearAuthCookie(res);
  res.json({ success: true });
}
