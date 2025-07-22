import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// Initialize database
const sqlite = new Database('database.db');
const db = drizzle(sqlite);

// Migration functions
export async function runMigrations() {
  console.log('Running migrations...');
  
  // Create users table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);
  
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