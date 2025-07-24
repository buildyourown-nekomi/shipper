#!/usr/bin/env node

/**
 * Keelan Monitor Daemon
 * 
 * A standalone background service that monitors all running ships
 * and updates their status in the database. This daemon can run
 * independently of the main CLI application.
 * 
 * Usage:
 *   node monitor-daemon.js [--interval=30] [--log-file=monitor.log]
 */


import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanShips } from '../database/schema.js';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs-extra';
import net from 'net';
import dotenv from 'dotenv';
import path from 'path';
import { eq } from 'drizzle-orm';
import { parseArgs } from 'util';
import { PATHS } from '../constants.js';

// Load environment variables
dotenv.config({ quiet: true });

// Configuration
interface DaemonConfig {
  interval: number;  // Monitoring interval in seconds
  logFile?: string;  // Optional log file path
  pidFile?: string;  // PID file for daemon management
}

class MonitorDaemon {
  private config: DaemonConfig;
  private monitorInterval?: NodeJS.Timeout;
  private isRunning = false;
  private logStream?: fs.WriteStream;
  private socketServer?: net.Server;

  constructor(config: DaemonConfig) {
    this.config = config;
    this.setupLogging();
    this.setupSignalHandlers();
  }

  private setupLogging() {
    if (this.config.logFile) {
      // Ensure log directory exists
      const logDir = path.dirname(this.config.logFile);
      fs.ensureDirSync(logDir);

      // Create log stream
      this.logStream = fs.createWriteStream(this.config.logFile, { flags: 'a' });
    }
  }

  private log(message: string, level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS' | 'DEPLOY' | 'STOP' | 'START' = 'INFO') {
    const timestamp = new Date().toISOString();
    let emoji = '';
    let color = chalk.blue;
    
    // Add emojis and colors based on log level
    switch (level) {
      case 'ERROR':
        emoji = '❌';
        color = chalk.red;
        break;
      case 'WARN':
        emoji = '⚠️ ';
        color = chalk.yellow;
        break;
      case 'SUCCESS':
        emoji = '✅';
        color = chalk.green;
        break;
      case 'DEPLOY':
        emoji = '🚀';
        color = chalk.cyan;
        break;
      case 'START':
        emoji = '▶️ ';
        color = chalk.green;
        break;
      case 'STOP':
        emoji = '⏹️ ';
        color = chalk.red;
        break;
      default:
        emoji = 'ℹ️ ';
        color = chalk.blue;
    }
    
    const logMessage = `[${timestamp}] [${level}] ${emoji} ${message}`;
    const fileLogMessage = `[${timestamp}] [${level}] ${message}`; // No emoji for file logs

    // Log to console with emoji and color
    console.log(color(logMessage));

    // Log to file if configured (without emoji to keep file logs clean)
    if (this.logStream) {
      this.logStream.write(fileLogMessage + '\n');
    }
  }

  private setupSignalHandlers() {
    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down gracefully...');
      this.stop();
    });

    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down gracefully...');
      this.stop();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.log(`Uncaught exception: ${error.message}`, 'ERROR');
      this.log(error.stack || '', 'ERROR');
      this.stop();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'ERROR');
    });
  }

  private async writePidFile() {
    if (this.config.pidFile) {
      try {
        await fs.writeFile(this.config.pidFile, process.pid.toString());
        this.log(`PID file written: ${this.config.pidFile}`);
      } catch (error) {
        this.log(`Failed to write PID file: ${error}`, 'ERROR');
      }
    }
  }

  private async removePidFile() {
    if (this.config.pidFile) {
      try {
        await fs.remove(this.config.pidFile);
        this.log(`PID file removed: ${this.config.pidFile}`);
      } catch (error) {
        // Ignore errors when removing PID file
      }
    }
  }

  async start() {
    if (this.isRunning) {
      this.log('Daemon is already running', 'WARN');
      return;
    }

    this.log(`Starting Keelan Monitor Daemon (PID: ${process.pid})`, 'START');
    this.log(`Monitoring interval: ${this.config.interval} seconds`);

    await this.writePidFile();

    this.isRunning = true;

    // Run initial monitoring check
    await this.runMonitoringCycle();

    // Set up periodic monitoring
    this.monitorInterval = setInterval(async () => {
      await this.runMonitoringCycle();
    }, this.config.interval * 1000);

    this.log('Monitor daemon started successfully', 'SUCCESS');
    this.setupSocketServer();
  }

  private async runMonitoringCycle() {
    try {
      const ships = await db.select().from(keelanShips).where(eq(keelanShips.status, 'running'));
      
      if (ships.length > 0) {
        this.log(`Monitoring ${ships.length} running ship(s)`);
      }
      
      for (const ship of ships) {
        if (ship.processId && !isProcessRunning(ship.processId)) {
          // Process has stopped, update database
          await db.update(keelanShips)
            .set({ 
              status: 'stopped',
              stoppedAt: new Date().toISOString()
            })
            .where(eq(keelanShips.id, ship.id));
          
          this.log(`Ship '${ship.name}' (PID: ${ship.processId}) has stopped unexpectedly`, 'WARN');
        }
      }
    } catch (error: any) {
      this.log(`Error during monitoring cycle: ${error.message}`, 'ERROR');
    }
  }

  private parseCommand(command: string): { executable: string; args: string[] } {
    // Split command string into executable and arguments
    // Handle quoted arguments properly
    const parts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    const executable = parts[0] || '';
    const args = parts.slice(1);
    
    return { executable, args };
  }

  private handleSocketData = async (socket: net.Socket, data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'deploy') {
        const { shipID, command, logDir } = message;
        this.log(`Deploying ship '${shipID}' with command: ${command}`, 'DEPLOY');
        
        await fs.ensureDir(logDir);
        const out = fs.openSync(`${logDir}/out.log`, 'a');
        const err = fs.openSync(`${logDir}/err.log`, 'a');
        
        const { executable, args } = this.parseCommand(command);
        this.log(`Executing: ${executable} ${args.join(' ')}`);
        
        const child = spawn(executable, args, {
          stdio: ['ignore', out, err],
          detached: true,
          windowsHide: true,
          env: { ...process.env, PATH: process.env.PATH + ':/usr/sbin:/sbin' }
        });
        const pid = child.pid;
        fs.closeSync(out);
        fs.closeSync(err);
        
        if (pid) {
          this.log(`Ship '${shipID}' deployed successfully with PID: ${pid}`, 'SUCCESS');
        } else {
          this.log(`Failed to get PID for ship '${shipID}'`, 'ERROR');
        }
        
        await db.insert(keelanShips).values({
          name: shipID,
          imageId: message.imageId,
          processId: pid,
          status: "running",
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          exitCode: null
        });
        setupProcessMonitoring(child, shipID, pid);
        socket.write(JSON.stringify({ status: 'success', pid }));
      } else if (message.type === 'start') {
        const { shipName, command, logDir, imageId } = message;
        this.log(`Starting ship '${shipName}' with command: ${command}`, 'START');
        
        await fs.ensureDir(logDir);
        const out = fs.openSync(`${logDir}/out.log`, 'a');
        const err = fs.openSync(`${logDir}/err.log`, 'a');
        
        const { executable, args } = this.parseCommand(command);
        this.log(`Executing: ${executable} ${args.join(' ')}`);
        
        const child = spawn(executable, args, {
          stdio: ['ignore', out, err],
          detached: true,
          windowsHide: true,
          env: { ...process.env, PATH: process.env.PATH + ':/usr/sbin:/sbin' }
        });
        const pid = child.pid;
        fs.closeSync(out);
        fs.closeSync(err);
        
        if (pid) {
          this.log(`Ship '${shipName}' started successfully with PID: ${pid}`, 'SUCCESS');
        } else {
          this.log(`Failed to get PID for ship '${shipName}'`, 'ERROR');
        }

        // Update existing ship record
        await db.update(keelanShips)
          .set({
            processId: pid,
            status: "running",
            startedAt: new Date().toISOString(),
            stoppedAt: null,
            exitCode: null
          })
          .where(eq(keelanShips.name, shipName))
          .execute();

        setupProcessMonitoring(child, shipName, pid);
        socket.write(JSON.stringify({ status: 'success', pid }));
      } else if (message.type === 'stop') {
        const { shipName, force = false } = message;
        this.log(`Stopping ship '${shipName}'`, 'STOP');

        // Get ship data from database
        const shipData = await db.select().from(keelanShips).where(eq(keelanShips.name, shipName)).limit(1);
        if (shipData.length === 0) {
          this.log(`Ship '${shipName}' not found`, 'WARN');
          socket.write(JSON.stringify({ status: 'error', message: 'Ship not found' }));
          return;
        }

        const ship = shipData[0];
        if (!ship.processId || ship.status !== 'running') {
          // Check if process is actually running
          if (ship.processId && !isProcessRunning(ship.processId)) {
            // Process is not running, just update database
            this.log(`Ship '${shipName}' was already stopped, updating status`, 'INFO');
            await db.update(keelanShips)
              .set({
                status: "stopped",
                stoppedAt: new Date().toISOString()
              })
              .where(eq(keelanShips.name, shipName))
              .execute();
            socket.write(JSON.stringify({ status: 'success', message: 'Ship was already stopped, updated status' }));
            return;
          }
          this.log(`Ship '${shipName}' is not running`, 'WARN');
          socket.write(JSON.stringify({ status: 'error', message: 'Ship is not running' }));
          return;
        }

        try {
          // Try graceful shutdown first
          this.log(`Sending SIGTERM to PID: ${ship.processId}`);
          process.kill(ship.processId, 'SIGTERM');

          // Wait for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Check if process is still running
          if (isProcessRunning(ship.processId)) {
            if (force) {
              // Force kill if still running and force is requested
              this.log(`Force killing ship '${shipName}' with SIGKILL`, 'WARN');
              process.kill(ship.processId, 'SIGKILL');
            } else {
              this.log(`Ship '${shipName}' did not stop gracefully`, 'WARN');
              socket.write(JSON.stringify({ status: 'error', message: 'Ship did not stop gracefully. Use --force to kill it.' }));
              return;
            }
          }

          // Update database
          await db.update(keelanShips)
            .set({
              status: "stopped",
              stoppedAt: new Date().toISOString(),
              exitCode: null
            })
            .where(eq(keelanShips.name, shipName))
            .execute();

          this.log(`Ship '${shipName}' stopped successfully`, 'SUCCESS');
          socket.write(JSON.stringify({ status: 'success', message: 'Ship stopped successfully' }));
        } catch (error: any) {
          if (error.code === 'ESRCH') {
            // Process was already stopped
            this.log(`Ship '${shipName}' was already stopped`, 'INFO');
            await db.update(keelanShips)
              .set({
                status: "stopped",
                stoppedAt: new Date().toISOString()
              })
              .where(eq(keelanShips.name, shipName))
              .execute();
            socket.write(JSON.stringify({ status: 'success', message: 'Ship was already stopped' }));
          } else {
            this.log(`Failed to stop ship '${shipName}': ${error.message}`, 'ERROR');
            socket.write(JSON.stringify({ status: 'error', message: `Failed to stop ship: ${error.message}` }));
          }
        }
      }
    } catch(error: any) {
      socket.write(JSON.stringify({ status: 'error', message: error.message }));
    }
  };

  private createSocketServer(): net.Server {
  return net.createServer((socket) => {
    socket.on('data', (data) => this.handleSocketData(socket, data));
  });
}

  private setupSocketServer() {
  this.socketServer = this.createSocketServer();

  // Listen on TCP port
  this.socketServer.listen(9876, 'localhost', () => {
    this.log('Socket server listening on TCP port 9876', 'SUCCESS');
  });

  // Handle errors
  this.socketServer.on('error', (error: any) => {
    this.log(`Socket server error: ${error.message}`, 'ERROR');
    throw error;
  });
}

  async stop() {
  if (!this.isRunning) {
    this.log('Daemon is not running', 'WARN');
    return;
  }

  this.log('Stopping monitor daemon...', 'STOP');
  this.isRunning = false;

  // Clear monitoring interval
  if (this.monitorInterval) {
    clearInterval(this.monitorInterval);
    this.monitorInterval = undefined;
    this.log('Monitoring interval cleared');
  }

  // Close log stream
  if (this.logStream) {
    this.logStream.end();
    this.log('Log stream closed');
  }

  // Close socket server
  if (this.socketServer) {
    if (this.socketServer.listening) {
      this.socketServer.close();
      this.log('Socket server closed');
    }
  }

  // Remove PID file
  await this.removePidFile();

  this.log('Monitor daemon stopped successfully', 'SUCCESS');
  process.exit(0);
}
}

// Parse command line arguments
function parseCommandLineArgs(): DaemonConfig {
  const defaultConfig: DaemonConfig = {
    interval: 30  // Default 30 seconds
  };

  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        'interval': {
          type: 'string',
          short: 'i'
        },
        'log-file': {
          type: 'string',
          short: 'l'
        },
        'pid-file': {
          type: 'string',
          short: 'p'
        }
      },
      allowPositionals: false
    });

    return {
      interval: values.interval ? parseInt(values.interval) : defaultConfig.interval,
      logFile: values['log-file'] || defaultConfig.logFile,
      pidFile: values['pid-file'] || defaultConfig.pidFile
    };
  } catch (error) {
    // Fallback to manual parsing if util.parseArgs fails
    const args = process.argv.slice(2);
    const config: DaemonConfig = { ...defaultConfig };

    for (const arg of args) {
      if (arg.startsWith('--interval=')) {
        const interval = parseInt(arg.split('=')[1]);
        if (!isNaN(interval) && interval > 0) {
          config.interval = interval;
        }
      } else if (arg.startsWith('--log-file=')) {
        config.logFile = arg.split('=')[1];
      } else if (arg.startsWith('--pid-file=')) {
        config.pidFile = arg.split('=')[1];
      }
    }

    return config;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseCommandLineArgs();

  // Set default log file if not specified
  if (!config.logFile) {
    config.logFile = path.join(PATHS.logs, 'monitor-daemon.log');
  }

  // Set default PID file if not specified
  if (!config.pidFile) {
    const pidDir = PATHS.pids;
    config.pidFile = path.join(pidDir, 'monitor-daemon.pid');
  }

  const daemon = new MonitorDaemon(config);
  daemon.start().catch((error) => {
    console.error(chalk.red('Failed to start daemon:'), error);
    process.exit(1);
  });
}

/**
 * Sets up background process monitoring for a detached child process
 * This allows the CLI to exit while still tracking the process lifecycle
 */
function setupProcessMonitoring(child: ChildProcess, shipID: string, pid: number | undefined) {
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
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error.code !== 'ESRCH';
  }
}

/**
 * Background monitoring engine that can run independently
 * This function can be called periodically to check all running ships
 */
async function monitorAllShips() {
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

export { MonitorDaemon, monitorAllShips };