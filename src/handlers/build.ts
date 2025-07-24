import fs from 'fs-extra';
import * as fs_original from 'fs';
import { execSync, spawn } from 'child_process';
import { parse } from 'yaml';
import { KeelanParser } from '../keelan-parser.js';
import { resolveLayer } from '../core/layer.js';
import { checkName, createDirectory, mountOverlayDirectory, removeShip, removeCrate, writeCrateFile, mountBindDrive, mountCrate, writeCrate, unmountCrate } from '../core/core.js';
import chalk from 'chalk';
import { TailLog } from '../utils/logging.js';
import sha256 from 'sha256';
import { compress, getFileDigest } from '../utils/compress.js';
import { removeCrateHandler } from './remove.js';
import path from 'path';
import { createAndMountOverlay } from '../utils/layer.js';
import { PATHS } from '../constants.js';

// Type definitions for command arguments
interface BuildOptions {
  watch: boolean;
  production: boolean;
  workingDirectory: string;
  name: string;
}

export const buildHandler = async (options: BuildOptions) => {
  if (options.workingDirectory) {
    process.chdir(options.workingDirectory);
  }

  if(!options.name || options.name.length == 0) {
    console.error(chalk.red('❌ Error: Name not specified.'));
    process.exit(1);
  }

  if(await checkName(options.name)) {
    console.error(chalk.yellow('⚠️  Error: Name already exists.'));
    // Delete the crate if it exists
    await removeCrate(options.name);
    console.log(chalk.green('✅ Crate deleted successfully.'));
  }

  if (!fs_original.existsSync('Keelanfile.yml')) {
    console.error(chalk.red('❌ Error: Keelanfile.yml not found.'));
    console.error(chalk.red('❌ Please run "Keelan init" to create a new Keelanfile.yml.'));
    process.exit(1);
  }

  const config = KeelanParser.parseFromFile('Keelanfile.yml');

  // So here we start to build the crate
  // Steps
  // 1. Propagate layer (aka resolve from) [v]
  // 2. Reserve OverlayFS (using name to create a directory) [v]
  // 3. Mount OverlayFS (using name to mount the directory) [v]
  // 4. Verify OverlayFS [v]
  // 5. Build the image (run command in the steps config) [-]
  // 6. Save the image to the database (save the upperdir (aka name) to the database)

  // 1. Propagate layer
  console.log(chalk.magenta('🚀 Starting build process for:'), chalk.cyan(options.name));
  console.log(chalk.magenta('🐳 Base image:'), chalk.cyan(config.build_context.base_image));
  
  const image = config.build_context.base_image;
  console.log(chalk.yellow('🔍 Resolving base image layers...'));
  const lowerlayers = await resolveLayer(image);
  console.log(chalk.green('✅ Successfully resolved'), chalk.cyan(lowerlayers.length), chalk.green('layers'));
  
  const upperdir = options.name;
  const upperdir_path = `${PATHS.crates}/${upperdir}`;

  const workdir_path = upperdir_path + "_work";
  const merge_path = upperdir_path + "_merge";

  await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);

  // Update the database
  console.log(chalk.yellow('💾 Updating database...'));
  // Write the image file to the database
  const content = fs.readFileSync("Keelanfile.yml", 'utf8');
  const keelanFile = await writeCrateFile(options.name, content);
  console.log(chalk.green('✅ Successfully updated database.'));

  // Setup crate (later)
  console.log(chalk.yellow('📦 Setting up crate...'));

  // await sleep(3000);
  try {
    for (let step of config.build_steps) {
      console.log(chalk.blue('🔨 Processing build step:'), chalk.yellow(step.action));
      // await sleep(1000);
      if (step.action == "execute_command") {
        if(!step.command || step.command.length == 0) {
          console.error(chalk.red('❌ Error: Command not specified.'));
          process.exit(1);
        }
        console.log(chalk.magenta('🏃 Running command:'), chalk.cyan(step.description), chalk.magenta('with:'), chalk.cyan(step.command.join(" ")));
        await runCommandInCrate(step.command.join(" "), options.name);
      } else if (step.action == "copy_files") {
        if(!step.source || step.source.length == 0) {
          console.error(chalk.red('❌ Error: Source not specified.'));
          process.exit(1);
        }
        if(!step.destination || step.destination.length == 0) {
          console.error(chalk.red('❌ Error: Destination not specified.'));
          process.exit(1);
        }


        console.log(chalk.magenta('📋 Copying files:'), chalk.cyan(step.source), chalk.magenta('to:'), chalk.cyan(step.destination));

        // Destination directory
        const destination_dir = merge_path + step.destination;
        if (!fs_original.existsSync(destination_dir)) {
          console.log(chalk.yellow('📁 Destination directory does not exist. Creating it...'));
          fs_original.mkdirSync(destination_dir, { recursive: true });
        }

        fs.copySync(step.source, destination_dir);
        console.log(chalk.green('✅ Files copied successfully.'));
      }
    }
  } catch (error: any) {
    console.log(error)
    console.log(chalk.red("❌ Build failed. Please check the logs for more information."));
    // Clean up the crate
    console.log(chalk.yellow('🧹 Cleaning up crate...'));
    // await sleep(1000);
    await removeCrateHandler({ name: options.name, force: true, recursive: true });
    process.exit(1);
  }

  // Gzip the crate (upperdir)
  console.log(chalk.yellow('📦 Compressing crate...'));

  const archivePath = `${PATHS.crates}/${options.name}.tar.gz`;

  await compress(path.dirname(upperdir_path), path.basename(upperdir_path), archivePath);

  const { digest, fileSize } = await getFileDigest(archivePath);

  console.log(chalk.green('✅ Crate compressed successfully. Archive path:'), chalk.cyan(archivePath));
  console.log(chalk.yellow('🔑 SHA256 Digest:'), chalk.cyan(digest));
  console.log(chalk.magenta('📊 File Size:'), chalk.cyan(fileSize));
  
  // console.log(keelanFile)

  console.log(chalk.yellow('💾 Writing crate to database...'));
  // Create database for crate
  await writeCrate(
    options.name,
    config.build_context.base_image,
    merge_path,
    fileSize,
    digest,
    keelanFile[0].id);
  console.log(chalk.green('✅ Crate written to database.'));

  // Unmount the crate
  console.log(chalk.yellow('🧹 Unmounting crate...'));
  unmountCrate(merge_path);
  console.log(chalk.green('✅ Crate unmounted successfully.'));

  console.log(chalk.green('✅ Build completed successfully.'));

};

async function runCommandInCrate(command: string, crate: string) {
  // Run the command in the crate
  const crate_path = `${PATHS.crates}/${crate}_merge`;
  console.log(chalk.magenta('🏃 Running command in crate:'), chalk.cyan(crate_path));
  console.log(chalk.blue('🔧 Command:'), chalk.yellow(command));

  const command_w_proot = `chroot ${crate_path} ${command}`;

  // Execute the command
  try {
    await executeCommandRealtime(command_w_proot);
    console.log(chalk.green('✅ Command executed successfully.'));
  } catch (error: any) {
    console.error(chalk.red('❌ Error executing command:'), chalk.yellow(command));
    console.error(chalk.red('❌ Error:'), chalk.yellow(error.toString()));
    throw error;
  }
}

async function executeCommandRealtime(commandString: string) {

  const parts = commandString.split(' ');
  const command = parts[0];
  const args = parts.slice(1);

  console.log(chalk.magenta('🚀 Running command realtime:'), chalk.cyan(command), chalk.magenta('with args:'), chalk.cyan(args.toString()));

  return new Promise((resolve, reject) => {
    // Spawn the child process
    const child = spawn(command, args);

    const logg = new TailLog();

    // Listen for data on standard output (stdout)
    child.stdout.on('data', (data: any) => {
      // console.log(`[stdout]: ${data.toString().trim()}`);
      logg.log(chalk.gray(data.toString().trim()));
    });

    // Listen for data on standard error (stderr)
    child.stderr.on('data', (data: any) => {
      // console.error(`[stderr]: ${data.toString().trim()}`);
      logg.log(chalk.red(data.toString().trim()));
    });

    // Listen for the child process to close
    child.on('close', (code: number) => {
      if (code === 0) {
        // console.log(`3. Child process exited successfully with code ${code}.`);
        resolve(code);
      } else {
        // console.error(`3. Child process exited with non-zero code ${code}.`);
        // We don't reject here because stderr would have already captured the error details.
        // The promise resolves with the non-zero code, indicating a command-level error.
        reject(code);
      }
    });

    // Listen for errors (e.g., command not found, permission issues)
    child.on('error', (err: any) => {
      logg.log(`4. Failed to spawn child process or an internal error occurred: ${err.message}`);
      reject(err); // Reject the promise on spawn errors
    });
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}