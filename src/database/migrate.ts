import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import fs from 'fs';
import load_env from 'dotenv';
load_env.config({ quiet: true });

// Initialize database
fs.mkdirSync(process.env.BASE_DIRECTORY + '/database', { recursive: true });
const sqlite = new Database(process.env.BASE_DIRECTORY + '/database/keelan.db');
const db = drizzle(sqlite);

// Migration functions
export async function runMigrations() {
  console.log('Running migrations...');
  
  const migratesql = fs.readFileSync('src/database/migrate.sql', 'utf8');

  console.log(migratesql);

  // Create users table if it doesn't exist
  sqlite.exec(migratesql);
  
  console.log('Migrations completed successfully');
}

// Reset database (for testing)
export async function resetDatabase() {
  console.log('Resetting database...');
  
  // Drop existing tables
  sqlite.exec(`DROP TABLE IF EXISTS users`);
  
  // Run migrations again
  await runMigrations();
  
  console.log('Database reset completed');
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