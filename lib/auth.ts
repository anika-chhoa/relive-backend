// import { betterAuth } from "better-auth";
// import { mongodbAdapter } from "better-auth/adapters/mongodb";
// import type { Db } from "mongodb";

// /**
//  * Better Auth is used ONLY for Google OAuth (handshake + storing the
//  * social user record via the native MongoDB adapter). Email/password is
//  * intentionally disabled here — that flow is fully custom, see
//  * controllers/authController.ts + lib/jwt.ts.
//  *
//  * After a successful Google sign-in, the frontend calls
//  * POST /api/auth/sync-session, which reads the Better Auth session and
//  * mints OUR OWN app JWT for that user (same `relive_jwt` cookie the
//  * custom email/password flow uses). That keeps verifyJWT.ts — and every
//  * protected route — checking exactly one thing, regardless of how the
//  * person logged in.
//  */
// export function createAuth(db: Db) {
//   return betterAuth({
//     database: mongodbAdapter(db),
//     secret: process.env.BETTER_AUTH_SECRET,
//     baseURL: process.env.BACKEND_URL || "http://localhost:5000",
//     basePath: "/api/auth",

//     trustedOrigins: [process.env.FRONTEND_URL || "http://localhost:3000"],

//     emailAndPassword: {
//       enabled: false,
//     },

//     socialProviders: {
//       google: {
//         clientId: process.env.GOOGLE_CLIENT_ID as string,
//         clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
//       },
//     },
//   });
// }

// export type Auth = ReturnType<typeof createAuth>;

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

    advanced: {
      cookies: {
        state: {
          attributes: {
            sameSite: "none",
            secure: true,
          },
        },
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