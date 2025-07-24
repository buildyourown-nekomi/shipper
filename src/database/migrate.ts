import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { PATHS } from '../constants.js';
dotenv.config({ quiet: true });

// Initialize database
fs.mkdirSync(PATHS.database, { recursive: true });
const sqlite = new Database(`${PATHS.database}/keelan.db`);
const db = drizzle(sqlite);

// Migration functions
export async function runMigrations() {
  console.log(chalk.blue('🔄 Running database migrations like we\'re upgrading to the latest version...'));
  
  const migratesql = fs.readFileSync('src/database/migrate.sql', 'utf8');

  console.log(migratesql);

  // Create users table if it doesn't exist
  sqlite.exec(migratesql);
  
  console.log(chalk.green('✅ Database migrations completed and it\'s giving fresh start vibes!'));
}

// Reset database (for testing)
export async function resetDatabase() {
  console.log(chalk.yellow('🔄 Time to reset the database like it never existed...'));
  
  // Drop existing tables
  sqlite.exec(`DROP TABLE IF EXISTS users`);
  
  // Run migrations again
  await runMigrations();
  
  console.log(chalk.green('✅ Database reset completed and it\'s giving fresh start energy!'));
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'reset':
      resetDatabase();
      break;
    case 'migrate':
    default:
      runMigrations();
      break;
  }
}

export { db };