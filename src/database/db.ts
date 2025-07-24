import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import load_env from "dotenv";
import { PATHS } from '../constants.js';
load_env.config({ quiet: true });

// Initialize database
const sqlite = new Database(`${PATHS.database}/keelan.db`);
export const db = drizzle(sqlite);
