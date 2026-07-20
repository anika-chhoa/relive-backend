import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Db } from "mongodb";

export function createAuth(db: Db) {
  return betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BACKEND_URL || "http://localhost:5000",
    basePath: "/api/auth",

    trustedOrigins: [process.env.FRONTEND_URL || "http://localhost:3000"],

    emailAndPassword: {
      enabled: false,
    },

    // Cross-site cookie config — frontend (vercel.app) and backend
    // (onrender.com) are different domains, so ALL Better Auth cookies
    // (OAuth state cookie AND the session cookie used by getSession())
    // need sameSite=none + secure=true. Using defaultCookieAttributes
    // instead of a single "state" override covers both.
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;