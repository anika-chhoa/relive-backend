import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "relive";

if (!uri) {
  throw new Error("MONGODB_URI is not set in environment variables");
}

const client = new MongoClient(uri);

let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db) return db;
  // await client.connect();
  db = client.db(dbName);
  console.log(`[db] Connected to MongoDB database: ${dbName}`);
  return db;
}

export function getDB(): Db {
  if (!db) {
    throw new Error("Database not initialized — call connectDB() first");
  }
  return db;
}

export { client as mongoClient };
