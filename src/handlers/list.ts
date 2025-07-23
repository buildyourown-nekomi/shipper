import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
// Type definitions for command arguments
interface ListOptions {
  type: 'crate' | 'ships';
  all: boolean;
}

async function listCrates() {
  console.log(chalk.blue('📦 Crates:'));
  const crates = await db.select().from(keelanCrate);
  for (const crate of crates) {
    console.log(chalk.blue(`- ${crate.name}`));
    console.log(chalk.gray(`  🔗 Image: ${crate.baseImage}`));
  }
}

async function listShips() {
  console.log(chalk.blue('🚢 Ships:'));
  const ships = await db.select({
    name: keelanShips.name,
    imageName: keelanCrate.name,
    status: keelanShips.status,
    startedAt: keelanShips.startedAt,
    stoppedAt: keelanShips.stoppedAt,
    exitCode: keelanShips.exitCode
  })
  .from(keelanShips)
  .leftJoin(keelanCrate, eq(keelanShips.imageId, keelanCrate.id));
  
  for (const ship of ships) {
    console.log(chalk.blue(`- ${ship.name}`));
    console.log(chalk.gray(`  🔗 Image: ${ship.imageName || 'Unknown'}`));
    console.log(chalk.gray(`  🟢 Status: ${ship.status}`));
    console.log(chalk.gray(`  📅 Started: ${ship.startedAt}`));
    console.log(chalk.gray(`  📅 Stopped: ${ship.stoppedAt}`));
    console.log(chalk.gray(`  💀 Exit code: ${ship.exitCode}`));
    console.log(chalk.gray(`  📁 Logs: ${process.env.BASE_DIRECTORY}/logs/${ship.name}/`));
  }
}

export const listHandler = async (options: ListOptions) => {
  console.log(chalk.cyan(`📕 Listing ${options.type}...`));
  if (options.all) {
    console.log(chalk.yellow(' ⚠️  Listing all items'));
    await listCrates();
    await listShips();
  } else {
    console.log(chalk.green(`Items of type ${options.type} would be listed here`));
    if (options.type === 'crate') {
      await listCrates();
    } else if (options.type === 'ships') {
      await listShips();
    }
  }
}