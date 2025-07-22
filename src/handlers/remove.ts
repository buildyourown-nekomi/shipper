import { removeImage, removeCrate } from '../core/core.js';
import chalk from 'chalk';

// Type definitions for command arguments
interface RemoveOptions {
  force: boolean;
  recursive: boolean;
}

export const removeImageHandler = async (options: RemoveOptions & { name: string }) => {
  const { name, force } = options;
  try {
    await removeImage(name, { force });
    console.log(chalk.green(`✅ Image '${name}' removed successfully.`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error removing image '${name}':`, errorMessage));
    process.exit(1);
  }
};

export const removeContainerHandler = async (options: RemoveOptions & { name: string }) => {
  const { name, force, recursive } = options;
  try {
    await removeCrate(name, { force, recursive });
    console.log(chalk.green(`✅ Container '${name}' removed successfully.`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error removing crate '${name}':`, errorMessage));
    process.exit(1);
  }
};