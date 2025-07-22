import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from './database/migrate.js';

// Define schema
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Initialize database
const sqlite = new Database('database.db');
const db = drizzle(sqlite);

// Database operations
async function createUser(name: string, email: string) {
  const result = await db.insert(users).values({ name, email }).returning();
  return result[0];
}

async function getUsers() {
  return await db.select().from(users);
}

async function getUserById(id: number) {
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0];
}

async function deleteUser(id: number) {
  const result = await db.delete(users).where(eq(users.id, id)).returning();
  return result[0];
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting Drizzle SQLite Minimal Demo');
    console.log('=====================================\n');
    
    // Run migrations
    await runMigrations();
    
    console.log('\n📊 Database Operations Demo');
    console.log('---------------------------');
    
    // Clear existing users for clean demo
    sqlite.exec('DELETE FROM users');
    
    // Create sample users
    console.log('1. Creating users...');
    const user1 = await createUser('Alice Johnson', 'alice@example.com');
    const user2 = await createUser('Bob Smith', 'bob@example.com');
    const user3 = await createUser('Carol Davis', 'carol@example.com');
    
    console.log(`   ✓ Created: ${user1.name} (${user1.email})`);
    console.log(`   ✓ Created: ${user2.name} (${user2.email})`);
    console.log(`   ✓ Created: ${user3.name} (${user3.email})`);
    
    // Get all users
    console.log('\n2. Fetching all users...');
    const allUsers = await getUsers();
    console.log(`   📋 Found ${allUsers.length} users:`);
    allUsers.forEach(user => {
      console.log(`      - ${user.name} (${user.email})`);
    });
    
    // Get specific user
    console.log('\n3. Fetching user by ID...');
    const specificUser = await getUserById(user2.id);
    console.log(`   🔍 Found: ${specificUser?.name} (${specificUser?.email})`);
    
    // Delete a user
    console.log('\n4. Deleting a user...');
    const deletedUser = await deleteUser(user3.id);
    console.log(`   🗑️  Deleted: ${deletedUser?.name}`);
    
    // Final count
    console.log('\n5. Final user count...');
    const remainingUsers = await getUsers();
    console.log(`   📊 Total users: ${remainingUsers.length}`);
    
    console.log('\n✅ Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    sqlite.close();
    console.log('\n🔒 Database connection closed');
  }
}

// Run if called directly
// if (import.meta.url === `file://${process.argv[1]}`) {
main();
// }

// Export for programmatic use
export { db, users, createUser, getUsers, getUserById, deleteUser, main };