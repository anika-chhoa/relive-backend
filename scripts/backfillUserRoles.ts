import "dotenv/config";
import { connectDB, mongoClient } from "../config/db.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import type { UserDoc } from "../types/domain.js";

// One-off migration: every existing user document that doesn't have a
// `role` field yet gets "user" — except emails listed in ADMIN_EMAILS,
// which get promoted to "admin" right away so you don't lose admin
// access after this migration runs.
async function backfillUserRoles() {
  const db = await connectDB();
  const users = db.collection<UserDoc>("users");

  const missingRole = await users.find({ role: { $exists: false } }).toArray();
  console.log(`[migrate] Found ${missingRole.length} user(s) without a role`);

  let userCount = 0;
  let adminCount = 0;

  for (const doc of missingRole) {
    const role = isAdminEmail(doc.email) ? "admin" : "user";
    await users.updateOne({ _id: doc._id }, { $set: { role } });
    role === "admin" ? adminCount++ : userCount++;
  }

  console.log(`[migrate] Done. Set role="user" for ${userCount}, role="admin" for ${adminCount}`);
  await mongoClient.close();
}

backfillUserRoles().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});