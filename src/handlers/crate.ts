import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate } from '../database/schema.js';

// List crates
export const listCratesHandler = async () => {
  console.log(chalk.cyan('📦 Listing all crates in the database bestie...'));
  const crates = await db.select().from(keelanCrate);
  
  if (crates.length === 0) {
    console.log(chalk.yellow('📦 No crates found in the database bestie.'));
    return;
  }
  
  console.log(chalk.green(`📦 Found ${crates.length} crate(s) bestie:`));
  
  for (const crate of crates) {
    console.log(chalk.blue(`- ${crate.name}`));
    console.log(chalk.gray(`  🔗 Base Image: ${crate.baseImage}`));
    console.log(); // Empty line for readability
  }
};