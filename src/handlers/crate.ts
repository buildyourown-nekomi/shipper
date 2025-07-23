import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate } from '../database/schema.js';

// List crates
export const listCratesHandler = async () => {
  console.log(chalk.blue('📦 Crates:'));
  const crates = await db.select().from(keelanCrate);
  
  if (crates.length === 0) {
    console.log(chalk.gray('  No crates found.'));
    return;
  }
  
  for (const crate of crates) {
    console.log(chalk.blue(`- ${crate.name}`));
    console.log(chalk.gray(`  🔗 Base Image: ${crate.baseImage}`));
    console.log(); // Empty line for readability
  }
};