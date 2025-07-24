import chalk from 'chalk';
import fs from 'fs-extra';
import net from 'net';
import { db } from '../database/db.js';
import { keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { KeelanParser } from '../keelan-parser.js';
import { resolveLayer } from '../core/layer.js';
import { createAndMountOverlay } from '../utils/layer.js';
import { PATHS } from '../constants.js';

// Type definitions
interface ShipOptions {
  name: string;
  force?: boolean;
}

interface StartShipOptions extends ShipOptions {
  env?: 'dev' | 'staging' | 'production';
}



// Helper function to send message to daemon
async function sendMessageToDaemon(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(9876, 'localhost', () => {
      client.write(JSON.stringify(message));
    });

    client.on('data', (data) => {
      const response = JSON.parse(data.toString());
      client.end();
      resolve(response);
    });

    client.on('error', (err) => {
      reject(new Error(`Failed to connect to daemon: ${err.message}`));
    });
  });
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
        console.log(chalk.yellow(`⚠️  Ship '${name}' is already running (PID: ${ship.processId})`));
        return;
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
    const upperdir_path = `${PATHS.ships}/${name}`;
    const workdir_path = upperdir_path + "_work";
    const merge_path = upperdir_path + "_merge";
    
    await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);
    
    const command_w_chroot = `chroot ${PATHS.ships}/${name}_merge ${steps.join(' ')}`;
    
    // Ensure log directory exists
    const logDir = `${PATHS.logs}/${name}`;
    await fs.ensureDir(logDir);
    
    // Send start message to daemon
    try {
      const message = {
        type: 'start',
        shipName: name,
        command: command_w_chroot,
        logDir: logDir,
        imageId: shipData.imageId
      };
      
      const response = await sendMessageToDaemon(message);
      
      if (response.status === 'success') {
        console.log(chalk.green(`✅ Ship '${name}' started successfully. PID: ${response.pid}`));
      } else {
        console.error(chalk.red(`❌ Failed to start ship '${name}': ${response.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to communicate with daemon: ${error}`));
      console.log(chalk.yellow('💡 Make sure the daemon is running with: keelan daemon start'));
      process.exit(1);
    }
    
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
    console.log(chalk.cyan(`🛑 Stopping ship '${name}'...`));
    
    // Send stop message to daemon
    try {
      const message = {
        type: 'stop',
        shipName: name,
        force: force
      };
      
      const response = await sendMessageToDaemon(message);
      
      if (response.status === 'success') {
        console.log(chalk.green(`✅ Ship '${name}' stopped successfully`));
      } else {
        console.error(chalk.red(`❌ Failed to stop ship '${name}': ${response.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to communicate with daemon: ${error}`));
      console.log(chalk.yellow('💡 Make sure the daemon is running with: keelan daemon start'));
      process.exit(1);
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
  
  try {
    console.log(chalk.cyan(`🔄 Restarting ship '${name}'...`));
    
    // Stop the ship first
    await stopShipHandler({ name, force: true });
    
    // Wait a moment before starting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start the ship
    await startShipHandler(options);
    
    console.log(chalk.green(`✅ Ship '${name}' restarted successfully`));
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Error restarting ship '${name}':`, errorMessage));
    process.exit(1);
  }
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
    console.log(chalk.gray(`  📁 Logs: ${PATHS.logs}/${ship.name}/`));
    console.log(); // Empty line for readability
  }
};