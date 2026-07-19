import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB, mongoClient } from "../config/db.js";
import type { UserDoc } from "../types/domain.js";

const DEMO_EMAIL = "demo@relive.app";
const DEMO_PASSWORD = "DemoRelive123!";
const DEMO_NAME = "Demo Explorer";

async function seedDemoUser() {
  const db = await connectDB();
  const users = db.collection<UserDoc>("users");

  try {
    const existing = await users.findOne({ email: DEMO_EMAIL });
    if (existing) {
      console.log(`[seed] Demo user already exists: ${DEMO_EMAIL}`);
      return;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await users.insertOne({
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      passwordHash,
      image: null,
      role: "user",
       provider: "credentials",
      createdAt: new Date(),
    });
    console.log(`[seed] Demo user created: ${DEMO_EMAIL}`);
  } finally {
    await mongoClient.close();
  }
}

seedDemoUser();
