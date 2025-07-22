import * as fs from 'fs';
import { execSync, spawn } from 'child_process';
import { parse } from 'yaml';
import { ShipperParser } from '../shipper-parser.js';
import { resolveLayer } from '../core/layer.js';
import { checkName, createDirectory, mountDirectory, removeCrate as removeShip, removeImage as removeCrate, writeImageFile } from '../core/core.js';
import chalk from 'chalk';
import { TailLog } from '../utils/logging.js';

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
    console.error(chalk.red('Error: Name not specified.'));
    process.exit(1);
  }

  if(await checkName(options.name)) {
    console.error(chalk.red('Error: Name already exists.'));
    process.exit(1);
  }

  if (!fs.existsSync('Shipperfile.yml')) {
    console.error(chalk.red('Error: Shipperfile.yml not found.'));
    console.error(chalk.red('Please run "shipper init" to create a new Shipperfile.yml.'));
    process.exit(1);
  }

  const config = ShipperParser.parseFromFile('Shipperfile.yml');
  console.log(chalk.blue('Parsed Shipperfile.yml configuration:'));
  console.log(chalk.blue(JSON.stringify(config, null, 2)));

  // So here we start to build the crate
  // Steps
  // 1. Propagate layer (aka resolve from) [v]
  // 2. Reserve OverlayFS (using name to create a directory) [v]
  // 3. Mount OverlayFS (using name to mount the directory) [v]
  // 4. Verify OverlayFS [v]
  // 5. Build the image (run command in the steps config) [-]
  // 6. Save the image to the database (save the upperdir (aka name) to the database)

  // 1. Propagate layer
  console.log(chalk.magenta('Starting build process for:'), chalk.cyan(options.name));
  console.log(chalk.magenta('Base image:'), chalk.cyan(config.build_context.base_image));
  
  const image = config.build_context.base_image;
  console.log(chalk.yellow('Resolving base image layers...'));
  const lowerlayers = await resolveLayer(image);
  console.log(chalk.green('Successfully resolved'), chalk.cyan(lowerlayers.length), chalk.green('layers'));
  
  const upperdir = options.name;
  const upperdir_path = process.env.BASE_DIRECTORY + "/crates/" + upperdir;

  const workdir_path = upperdir_path + "_work";
  const merge_path = upperdir_path + "_merge";

  createDirectory(upperdir_path);
  createDirectory(workdir_path);
  createDirectory(merge_path);

  let lowerdir = ""

  console.log(chalk.yellow('Processing lower layers...'));
  for (let dir of lowerlayers) {
    console.log(chalk.cyan('Processing layer:'), chalk.yellow(dir));
    if (dir == "debian") {
      console.log(chalk.blue('Mapping debian layer to debian_rootfs'));
      dir = "debian_rootfs";
    }
    const dir_path = process.env.BASE_DIRECTORY + "/crates/" + dir;
    console.log(chalk.green('Resolved layer path:'), chalk.cyan(dir_path));
    lowerdir += dir_path + ":";
  }

  lowerdir = lowerdir.slice(0, -1); // Remove the last colon
  console.log(chalk.magenta('Layer configuration:'));
  console.log(chalk.cyan('Lower layers:'), chalk.yellow(lowerdir));
  console.log(chalk.cyan('Upper directory:'), chalk.yellow(upperdir_path));
  console.log(chalk.cyan('Work directory:'), chalk.yellow(workdir_path));
  console.log(chalk.cyan('Merge directory:'), chalk.yellow(merge_path));
  
  // Mounting the directory
  console.log(chalk.yellow('Mounting OverlayFS...'));
  mountDirectory(lowerdir, upperdir_path, workdir_path, merge_path);
  console.log(chalk.green('Successfully mounted OverlayFS at merge point:'), chalk.cyan(merge_path));

  // Update the database
  console.log(chalk.yellow('Updating database...'));
  // Write the image file to the database
  await writeImageFile(options.name, lowerdir);
  console.log(chalk.green('Successfully updated database.'));

  // Setup crate (later)
  console.log(chalk.yellow('Setting up crate...'));

  await sleep(3000);
  try {
    for (let step of config.build_steps) {
      console.log(chalk.blue('Processing build step:'), chalk.yellow(step.action));
      await sleep(1000);
      if (step.action == "execute_command") {
        if(!step.command || step.command.length == 0) {
          console.error(chalk.red('Error: Command not specified.'));
          process.exit(1);
        }
        console.log(chalk.magenta('Running command:'), chalk.cyan(step.command));
        await runCommandInCrate(step.command.join(" "), options.name);
      } else if (step.action == "copy_files") {
        if(!step.source || step.source.length == 0) {
          console.error(chalk.red('Error: Source not specified.'));
          process.exit(1);
        }
        if(!step.destination || step.destination.length == 0) {
          console.error(chalk.red('Error: Destination not specified.'));
          process.exit(1);
        }


        console.log(chalk.magenta('Copying files:'), chalk.cyan(step.source), chalk.magenta('to:'), chalk.cyan(step.destination));

        // Destination directory
        const destination_dir = process.env.BASE_DIRECTORY + "/crates/" + options.name + "/" + step.destination;
        if (!fs.existsSync(destination_dir)) {
          console.log(chalk.yellow('Destination directory does not exist. Creating it...'));
          fs.mkdirSync(destination_dir, { recursive: true });
        }

        fs.copyFileSync(step.source, step.destination);
        console.log(chalk.green('Files copied successfully.'));
      }
    }
  } catch (error: any) {
    console.log(chalk.red("Build failed. Please check the logs for more information."));
    // Clean up the crate
    console.log(chalk.yellow('Cleaning up crate...'));
    await sleep(1000);
    await removeCrate(options.name);
  }
};

async function runCommandInCrate(command: string, crate: string) {
  // Run the command in the crate
  const crate_path = process.env.BASE_DIRECTORY + "/crates/" + crate + "_merge";
  console.log(chalk.magenta('Running command in crate:'), chalk.cyan(crate_path));
  console.log(chalk.blue('Command:'), chalk.yellow(command));

  const command_w_proot = `proot -R ${crate_path} ${command}`;

  // Execute the command
  try {
    await executeCommandRealtime(command_w_proot);
    console.log(chalk.green('Command executed successfully.'));
  } catch (error: any) {
    console.error(chalk.red('Error executing command:'), chalk.yellow(command));
    console.error(chalk.red('Error:'), chalk.yellow(error.toString()));
    // process.exit(1);
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeCommandRealtime(commandString: string) {

  const parts = commandString.split(' ');
  const command = parts[0];
  const args = parts.slice(1);

  console.log(chalk.magenta('Running command realtime:'), chalk.cyan(command), chalk.magenta('with args:'), chalk.cyan(args.toString()));

  return new Promise((resolve, reject) => {
    // Spawn the child process
    const child = spawn(command, args);

    const logg = new TailLog();

    // Listen for data on standard output (stdout)
    child.stdout.on('data', (data: any) => {
      // console.log(`[stdout]: ${data.toString().trim()}`);
      logg.log(chalk.green(data.toString().trim()));
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