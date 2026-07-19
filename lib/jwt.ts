import type { Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { AuthUser } from "../types/domain.js";

const COOKIE_NAME = "relive_jwt";
const EXPIRY = "7d";

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set in environment variables");
  }
  return new TextEncoder().encode(secret);
}

export async function signAppJWT(user: AuthUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    image: user.image ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecretKey());
}

export async function verifyAppJWT(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getSecretKey());
  return {
    id: payload.sub as string,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    image: payload.image as string | null | undefined,
  };
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" works across localhost:3000 <-> localhost:5000 (same site,
    // different port). Switch to "none" + secure if frontend/backend end
    // up on different registrable domains in production.
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export { COOKIE_NAME };
