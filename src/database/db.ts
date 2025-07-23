import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import load_env from "dotenv";
load_env.config();

// Initialize database
const sqlite = new Database(process.env.BASE_DIRECTORY + "/database/keelan.db");
export const db = drizzle(sqlite);
