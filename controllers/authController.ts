import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getDB } from "../config/db.js";
import { signAppJWT, setAuthCookie, clearAuthCookie } from "../lib/jwt.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import type { Auth } from "../lib/auth.js";
import type { UserDoc, AuthUser } from "../types/domain.js";

const SALT_ROUNDS = 10;

// role === "admin" is the primary source of truth. ADMIN_EMAILS stays as
// a fallback so you can bootstrap the very first admin before any UI to
// promote users exists.
function computeIsAdmin(doc: Pick<UserDoc, "role" | "email">): boolean {
  return doc.role === "admin" || isAdminEmail(doc.email);
}

function toPublicUser(doc: UserDoc, id: string): AuthUser {
  return {
    id,
    name: doc.name,
    email: doc.email,
    image: doc.image,
    isAdmin: computeIsAdmin(doc),
  };
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
      provider: "credentials",
      role: "user", // ← every new registration gets this explicitly
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

    const valid = await bcrypt.compare(password, doc.passwordHash || "");
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (doc.suspended) {
      return res.status(403).json({ error: "This account has been suspended" });
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

      const db = getDB();
      const users = db.collection<UserDoc>("users");

      // Mirror the Google account into our own `users` collection
      // (keyed by email) so admin panel / role / suspend logic has one
      // place to look, regardless of login method. $setOnInsert makes
      // sure role/createdAt are only set the FIRST time — a later login
      // never overwrites a role an admin promoted.
      await users.updateOne(
        { email: session.user.email },
        {
          $set: {
            name: session.user.name || "",
            email: session.user.email,
            image: session.user.image ?? null,
            provider: "google",
            authId: session.user.id,
          },
          $setOnInsert: { role: "user", createdAt: new Date() },
        },
        { upsert: true }
      );

      const mirrored = await users.findOne({ email: session.user.email });
      if (mirrored?.suspended) {
        return res.status(403).json({ error: "This account has been suspended" });
      }

      const user: AuthUser = {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
        image: session.user.image ?? null,
        isAdmin: mirrored ? computeIsAdmin(mirrored) : isAdminEmail(session.user.email),
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
  // Re-check role/suspension fresh from the DB on every call — a role
  // change or suspension by an admin takes effect immediately, without
  // waiting for the JWT to expire or the user to log in again.
  try {
    const db = getDB();
    const doc = await db.collection<UserDoc>("users").findOne({ email: req.user?.email });
    res.json({
      user: {
        ...req.user,
        isAdmin: doc ? computeIsAdmin(doc) : isAdminEmail(req.user?.email),
      },
    });
  } catch (err) {
    console.error("[auth] me failed:", err);
    res.json({ user: req.user });
  }
}

export function logout(req: Request, res: Response) {
  clearAuthCookie(res);
  res.json({ success: true });
}