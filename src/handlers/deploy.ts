import fs from 'fs-extra';
import * as fs_original from 'fs';
import { execSync, spawn, spawnSync } from 'child_process';
import { parse } from 'yaml';
import chalk from 'chalk';
import { KeelanParser } from '../keelan-parser.js';
import { keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../database/db.js';
import { makeid } from '../utils/utils.js';
import { resolveLayer } from '../core/layer.js';
import { createDirectory } from '../core/core.js';
import { createAndMountOverlay } from '../utils/layer.js';
import { ChildProcess } from 'child_process';

// Type definitions for command arguments
interface DeployOptions {
  env: 'dev' | 'staging' | 'production';
  name: string;
}

export const deployHandler = async (options: DeployOptions) => {
  
  const file_data = await db.select().from(keelanFiles).where(
    eq(keelanFiles.name, options.name)
  )

  if (!file_data.length) {
    console.error(chalk.red('❌ Error: Crate not found.'));
    process.exit(1);
  }

  // console.log(file_data[0].content)

  const config = KeelanParser.parseFromString(file_data[0].content);

  const steps = config.runtime_command || config.runtime_entrypoint;
  if (!steps) {
    console.error(chalk.red('❌ Error: No "deploy" configuration found in Keelanfile.yml.'));
    process.exit(1);
  }

  console.log(chalk.cyan('🚢 Ready to sail!'));

  // Create ship
  const shipID = makeid(12)

  // Reserve space for the ship
  console.log(chalk.yellow('🔍 Resolving base image layers...'));
  const lowerlayers = await resolveLayer(file_data[0].name);
  console.log(chalk.green('✅ Successfully resolved'), chalk.cyan(lowerlayers.length), chalk.green('layers'));

  const upperdir_path = process.env.BASE_DIRECTORY + "/ships/" + shipID;

  const workdir_path = upperdir_path + "_work";
  const merge_path = upperdir_path + "_merge";

  await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);

  const command_w_chroot = `chroot ${process.env.BASE_DIRECTORY}/ships/${shipID}_merge ${steps.join(' ')}`;

  console.log(chalk.magenta('🚀 Running command in crate:'), chalk.cyan(command_w_chroot));

  // Ensure the log directory exists
  const logDir = `${process.env.BASE_DIRECTORY}/logs/${options.name}`;
  await fs.ensureDir(logDir);

  const out = fs.openSync(`${logDir}/out.log`, 'a');
  const err = fs.openSync(`${logDir}/err.log`, 'a');

  // Spawn the process with detached option for proper background execution
  const child = spawn(command_w_chroot, { 
    shell: true, 
    stdio: ['ignore', out, err],
    detached: true,  // This allows the process to run independently
    windowsHide: true  // Hide console window on Windows
  });
  
  const pid = child.pid;

  console.log(chalk.green('✅ Command executed successfully. PID:'), chalk.yellow(pid));

  // Insert ship record into database
  await db.insert(keelanShips)
    .values({
      name: shipID,
      imageId: file_data[0].id,
      processId: pid,
      status: "running",
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null
    }).returning();

  // Set up process monitoring in background
  setupProcessMonitoring(child, shipID, pid);
  
  // Detach the child process from the parent
  child.unref();

  console.log(chalk.green('🎉 Deploy completed successfully!'));
  console.log(chalk.blue('📊 Monitoring deployment...'));
  console.log(chalk.gray(`📁 Logs: ${process.env.BASE_DIRECTORY}/logs/${options.name}/`));
};

/**
 * Sets up background process monitoring for a detached child process
 * This allows the CLI to exit while still tracking the process lifecycle
 */
export function setupProcessMonitoring(child: ChildProcess, shipID: string, pid: number | undefined) {
  if (!pid) {
    console.error(chalk.red('❌ Failed to get process PID'));
    return;
  }

  // Handle process completion
  child.on('close', async (code) => {
    try {
      if (code === 0) {
        console.log(chalk.green(`✅ Process ${pid} completed successfully!`));
      } else {
        console.log(chalk.yellow(`⚠️  Process ${pid} exited with code ${code}`));
      }
      
      await db.update(keelanShips)
        .set({
          status: "stopped",
          stoppedAt: new Date().toISOString(),
          exitCode: code
        })
        .where(eq(keelanShips.name, shipID))
        .execute();
    } catch (error) {
      console.error(chalk.red('❌ Error updating ship status:'), error);
    }
  });

  // Handle process errors
  child.on('error', async (err: any) => {
    try {
      console.error(chalk.red(`❌ Process ${pid} encountered an error:`, err.message));
      
      await db.update(keelanShips)
        .set({
          status: "error",
          stoppedAt: new Date().toISOString(),
          exitCode: err.code || -1
        })
        .where(eq(keelanShips.name, shipID))
        .execute();
    } catch (error) {
      console.error(chalk.red('❌ Error updating ship status:'), error);
    }
  });

  // Optional: Set up periodic health checks
  const healthCheckInterval = setInterval(async () => {
    try {
      // Check if process is still running using the PID
      const isRunning = await isProcessRunning(pid);
      
      if (!isRunning) {
        // Process died without triggering close event
        await db.update(keelanShips)
          .set({
            status: "stopped",
            stoppedAt: new Date().toISOString(),
            exitCode: null
          })
          .where(eq(keelanShips.name, shipID))
          .execute();
        
        clearInterval(healthCheckInterval);
      }
    } catch (error) {
      // Ignore errors in health check to avoid spam
    }
  }, 30000); // Check every 30 seconds

  // Clean up interval when process ends
  child.on('close', () => {
    clearInterval(healthCheckInterval);
  });
}

/**
 * Check if a process is still running by PID
 */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    // On Unix-like systems, sending signal 0 checks if process exists
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // ESRCH means process doesn't exist
    return error.code !== 'ESRCH';
  }
}

/**
 * Background monitoring engine that can run independently
 * This function can be called periodically to check all running ships
 */
export async function monitorAllShips() {
  try {
    const runningShips = await db.select()
      .from(keelanShips)
      .where(eq(keelanShips.status, "running"))
      .execute();

    for (const ship of runningShips) {
      if (ship.processId) {
        const isRunning = await isProcessRunning(ship.processId);
        
        if (!isRunning) {
          // Update ship status if process is no longer running
          await db.update(keelanShips)
            .set({
              status: "stopped",
              stoppedAt: new Date().toISOString(),
              exitCode: null
            })
            .where(eq(keelanShips.id, ship.id))
            .execute();
          
          console.log(chalk.yellow(`📋 Updated status for ship ${ship.name}: process ${ship.processId} no longer running`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error in background monitoring:'), error);
  }
}