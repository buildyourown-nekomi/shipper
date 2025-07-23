import { checkName, removeCrate, removeGzipCrate, removeShip } from '../core/core.js';
import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate, keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';

// Type definitions for command arguments
interface RemoveOptions {
  force: boolean;
  recursive: boolean;
}

export const removeCrateHandler = async (options: RemoveOptions & { name: string }) => {
  const { name, force } = options;
  try {
    if (!await checkName(name)) {
      console.log(chalk.yellow(`Crate ${name} does not exist. Skipping removal.`));
      return;
    }
    await removeCrate(name, { force });
    await removeGzipCrate(name, { force });
      // remove the Gzip file

    await db.delete(keelanFiles)
      .where(eq(keelanFiles.name, name))
      .execute();

    await db.delete(keelanCrate)
      .where(eq(keelanCrate.name, name))
      .execute();

    console.log(chalk.green(`✅ Crate '${name}' removed successfully.`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error removing crate '${name}':`, errorMessage));
    process.exit(1);
  }
};

export const removeShipHandler = async (options: RemoveOptions & { name: string }) => {
  const { name, force, recursive } = options;
  try {
    await removeShip(name, { force, recursive });
    await db.delete(keelanShips)
      .where(eq(keelanShips.name, name))
      .execute();
    console.log(chalk.green(`✅ Ship '${name}' removed successfully.`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error removing ship '${name}':`, errorMessage));
    process.exit(1);
  }
};