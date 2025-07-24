import chalk from 'chalk';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import { db } from '../database/db.js';
import { keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { KeelanParser } from '../keelan-parser.js';
import { resolveLayer } from '../core/layer.js';
import { createAndMountOverlay } from '../utils/layer.js';
import { makeid } from '../utils/utils.js';

// Type definitions
interface ShipOptions {
  name: string;
  force?: boolean;
}

interface StartShipOptions extends ShipOptions {
  env?: 'dev' | 'staging' | 'production';
}

// Helper function to check if process is running
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error.code !== 'ESRCH';
  }
}

// Start a ship
export const startShipHandler = async (options: StartShipOptions) => {
  const { name, env = 'dev' } = options;
  
  try {
    // Check if ship already exists and is running
    const existingShip = await db.select()
      .from(keelanShips)
      .where(eq(keelanShips.name, name))
      .limit(1);
    
    if (existingShip.length > 0) {
      const ship = existingShip[0];
      if (ship.status === 'running' && ship.processId) {
        const isRunning = await isProcessRunning(ship.processId);
        if (isRunning) {
          console.log(chalk.yellow(`⚠️  Ship '${name}' is already running (PID: ${ship.processId})`));
          return;
        }
      }
    }
    
    // Get the crate data to restart the ship
    const shipData = existingShip.length > 0 ? existingShip[0] : null;
    if (!shipData) {
      console.error(chalk.red(`❌ Ship '${name}' not found. Use 'keelan ship deploy' to create a new ship.`));
      process.exit(1);
    }
    
    // Get the crate configuration
    const crateData = await db.select()
      .from(keelanFiles)
      .where(eq(keelanFiles.id, shipData.imageId))
      .limit(1);
    
    if (!crateData.length) {
      console.error(chalk.red(`❌ Crate data not found for ship '${name}'.`));
      process.exit(1);
    }
    
    const config = KeelanParser.parseFromString(crateData[0].content);
    const steps = config.runtime_command || config.runtime_entrypoint;
    
    if (!steps) {
      console.error(chalk.red('❌ Error: No runtime configuration found in Keelanfile.yml.'));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`🚀 Starting ship '${name}'...`));
    
    // Resolve layers and mount overlay
    const lowerlayers = await resolveLayer(crateData[0].name);
    const upperdir_path = process.env.BASE_DIRECTORY + "/ships/" + name;
    const workdir_path = upperdir_path + "_work";
    const merge_path = upperdir_path + "_merge";
    
    await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);
    
    const command_w_chroot = `chroot ${process.env.BASE_DIRECTORY}/ships/${name}_merge ${steps.join(' ')}`;
    
    // Ensure log directory exists
    const logDir = `${process.env.BASE_DIRECTORY}/logs/${name}`;
    await fs.ensureDir(logDir);
    
    const out = fs.openSync(`${logDir}/out.log`, 'a');
    const err = fs.openSync(`${logDir}/err.log`, 'a');
    
    // Spawn the process
    const child = spawn(command_w_chroot, {
      shell: true,
      stdio: ['ignore', out, err],
      detached: true,
      windowsHide: true
    });
    
    const pid = child.pid;
    
    // Close file descriptors in parent process to prevent resource leaks
    fs.closeSync(out);
    fs.closeSync(err);
    
    if (!pid) {
      console.error(chalk.red('❌ Failed to start ship process'));
      process.exit(1);
    }
    
    console.log(chalk.green(`✅ Ship '${name}' started successfully. PID: ${pid}`));
    
    // Update ship status in database
    await db.update(keelanShips)
      .set({
        processId: pid,
        status: "running",
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        exitCode: null
      })
      .where(eq(keelanShips.name, name))
      .execute();
    
    // Detach the child process - monitoring is handled by the daemon
    child.unref();
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Error starting ship '${name}':`, errorMessage));
    process.exit(1);
  }
};

// Stop a ship
export const stopShipHandler = async (options: ShipOptions) => {
  const { name, force = false } = options;
  
  try {
    // Find the ship
    const ships = await db.select()
      .from(keelanShips)
      .where(eq(keelanShips.name, name))
      .limit(1);
    
    if (!ships.length) {
      console.error(chalk.red(`❌ Ship '${name}' not found.`));
      process.exit(1);
    }
    
    const ship = ships[0];
    
    if (ship.status !== 'running' || !ship.processId) {
      console.log(chalk.yellow(`⚠️  Ship '${name}' is not running.`));
      return;
    }
    
    // Check if process is actually running
    const isRunning = await isProcessRunning(ship.processId);
    if (!isRunning) {
      console.log(chalk.yellow(`⚠️  Ship '${name}' process is not running. Updating status...`));
      await db.update(keelanShips)
        .set({
          status: "stopped",
          stoppedAt: new Date().toISOString()
        })
        .where(eq(keelanShips.name, name))
        .execute();
      return;
    }
    
    console.log(chalk.cyan(`🛑 Stopping ship '${name}' (PID: ${ship.processId})...`));
    
    try {
      // Try graceful shutdown first (SIGTERM)
      process.kill(ship.processId, 'SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if process is still running
      const stillRunning = await isProcessRunning(ship.processId);
      
      if (stillRunning) {
        if (force) {
          console.log(chalk.yellow(`⚠️  Force killing ship '${name}'...`));
          process.kill(ship.processId, 'SIGKILL');
        } else {
          console.log(chalk.yellow(`⚠️  Ship '${name}' did not stop gracefully. Use --force to kill it.`));
          return;
        }
      }
      
      console.log(chalk.green(`✅ Ship '${name}' stopped successfully.`));
      
      // Update ship status
      await db.update(keelanShips)
        .set({
          status: "stopped",
          stoppedAt: new Date().toISOString()
        })
        .where(eq(keelanShips.name, name))
        .execute();
        
    } catch (killError: any) {
      if (killError.code === 'ESRCH') {
        console.log(chalk.yellow(`⚠️  Ship '${name}' process was already stopped.`));
        await db.update(keelanShips)
          .set({
            status: "stopped",
            stoppedAt: new Date().toISOString()
          })
          .where(eq(keelanShips.name, name))
          .execute();
      } else {
        throw killError;
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Error stopping ship '${name}':`, errorMessage));
    process.exit(1);
  }
};

// Restart a ship
export const restartShipHandler = async (options: StartShipOptions) => {
  const { name } = options;
  
  console.log(chalk.cyan(`🔄 Restarting ship '${name}'...`));
  
  // Stop the ship first
  await stopShipHandler({ name, force: true });
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Start the ship
  await startShipHandler(options);
};

// List ships (moved from list.ts for consistency)
export const listShipsHandler = async () => {
  console.log(chalk.blue('🚢 Ships:'));
  const ships = await db.select({
    name: keelanShips.name,
    imageName: keelanFiles.name,
    status: keelanShips.status,
    processId: keelanShips.processId,
    startedAt: keelanShips.startedAt,
    stoppedAt: keelanShips.stoppedAt,
    exitCode: keelanShips.exitCode
  })
  .from(keelanShips)
  .leftJoin(keelanFiles, eq(keelanShips.imageId, keelanFiles.id));
  
  for (const ship of ships) {
    const statusColor = ship.status === 'running' ? chalk.green : 
                       ship.status === 'stopped' ? chalk.yellow : chalk.red;
    
    console.log(chalk.blue(`- ${ship.name}`));
    console.log(chalk.gray(`  🔗 Image: ${ship.imageName || 'Unknown'}`));
    console.log(chalk.gray(`  ${statusColor('●')} Status: ${ship.status}`));
    if (ship.processId) {
      console.log(chalk.gray(`  🆔 PID: ${ship.processId}`));
    }
    console.log(chalk.gray(`  📅 Started: ${ship.startedAt}`));
    if (ship.stoppedAt) {
      console.log(chalk.gray(`  📅 Stopped: ${ship.stoppedAt}`));
    }
    if (ship.exitCode !== null) {
      console.log(chalk.gray(`  💀 Exit code: ${ship.exitCode}`));
    }
    console.log(chalk.gray(`  📁 Logs: ${process.env.BASE_DIRECTORY}/logs/${ship.name}/`));
    console.log(); // Empty line for readability
  }
};