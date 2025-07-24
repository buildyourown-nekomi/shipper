import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { PATHS } from '../constants.js';
// Type definitions for command arguments
interface ListOptions {
  type: 'crate' | 'ships';
  all: boolean;
}

async function listCrates() {
  console.log(chalk.blue('📦 Here are all our crates and they\'re absolutely iconic:'));
  const crates = await db.select().from(keelanCrate);
  for (const crate of crates) {
    console.log(chalk.blue(`- ${crate.name} (bestie is serving container energy)`));
    console.log(chalk.gray(`  🔗 Image: ${crate.baseImage}`));
  }
}

async function listShips() {
  console.log(chalk.blue('🚢 Ships are about to serve status updates:'));
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
    console.log(chalk.blue(`- ${ship.name} (bestie is serving ship energy)`));
    console.log(chalk.gray(`  🔗 Image: ${ship.imageName || 'Unknown'}`));
    console.log(chalk.gray(`  🟢 Status: ${ship.status}`));
    console.log(chalk.gray(`  📅 Started: ${ship.startedAt}`));
    console.log(chalk.gray(`  📅 Stopped: ${ship.stoppedAt}`));
    console.log(chalk.gray(`  💀 Exit code: ${ship.exitCode}`));
    console.log(chalk.gray(`  📁 Logs: ${PATHS.logs}/${ship.name}/`));
  }
}

export const listHandler = async (options: ListOptions) => {
  console.log(chalk.cyan(`📕 About to list ${options.type} and it\'s giving organized vibes...`));
  if (options.all) {
    console.log(chalk.yellow(' ⚠️  Listing all items - we\'re going full send'));
    await listCrates();
    await listShips();
  } else {
    console.log(chalk.green(`Items of type ${options.type} are about to serve looks here`));
    if (options.type === 'crate') {
      await listCrates();
    } else if (options.type === 'ships') {
      await listShips();
    }
  }
}