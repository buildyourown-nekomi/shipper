import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

// Initialize database
const sqlite = new Database('database.db');
export const db = drizzle(sqlite);
