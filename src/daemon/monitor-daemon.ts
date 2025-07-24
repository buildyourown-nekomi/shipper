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
import xpipe from 'xpipe';

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

  private log(message: string, level: 'INFO' | 'ERROR' | 'WARN' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Log to console
    switch (level) {
      case 'ERROR':
        console.error(chalk.red(logMessage));
        break;
      case 'WARN':
        console.warn(chalk.yellow(logMessage));
        break;
      default:
        console.log(chalk.blue(logMessage));
    }
    
    // Log to file if configured
    if (this.logStream) {
      this.logStream.write(logMessage + '\n');
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

    this.log(`Starting Keelan Monitor Daemon (PID: ${process.pid})`);
    this.log(`Monitoring interval: ${this.config.interval} seconds`);
    
    await this.writePidFile();
    
    this.isRunning = true;
    
    // Run initial monitoring check
    await this.runMonitoringCycle();
    
    // Set up periodic monitoring
    this.monitorInterval = setInterval(async () => {
      await this.runMonitoringCycle();
    }, this.config.interval * 1000);
    
    this.log('Monitor daemon started successfully');
    this.setupSocketServer();
  }

  private async runMonitoringCycle() {
    try {
      this.log('Running monitoring cycle...');
      await monitorAllShips();
      this.log('Monitoring cycle completed');
    } catch (error) {
      this.log(`Error in monitoring cycle: ${error}`, 'ERROR');
    }
  }

  private handleSocketData = async (socket: net.Socket, data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'deploy') {
        const { shipID, command, logDir } = message;
        await fs.ensureDir(logDir);
        const out = fs.openSync(`${logDir}/out.log`, 'a');
        const err = fs.openSync(`${logDir}/err.log`, 'a');
        const child = spawn(command, { 
          shell: true, 
          stdio: ['ignore', out, err],
          detached: true,
          windowsHide: true 
        });
        const pid = child.pid;
        fs.closeSync(out);
        fs.closeSync(err);
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
      }
    } catch (error: any) {
      socket.write(JSON.stringify({ status: 'error', message: error.message }));
    }
  };

  private createSocketServer(): net.Server {
    return net.createServer((socket) => {
      socket.on('data', (data) => this.handleSocketData(socket, data));
    });
  }

  private setupSocketServer() {
    // Try named pipes first, fallback to TCP if not supported (e.g., WSL2)
    const pipePath = xpipe.eq('keelan-daemon');
    this.socketServer = this.createSocketServer();
    
    // Try named pipe first
    this.socketServer.listen(pipePath, () => {
      this.log(`Socket server listening on named pipe: ${pipePath}`);
    });
    
    // Handle named pipe errors (e.g., WSL2 doesn't support them)
    this.socketServer.on('error', (error: any) => {
      if (error.code === 'ENOTSUP' || error.code === 'ENOTFOUND') {
        this.log('Named pipes not supported, falling back to TCP socket on port 9876', 'WARN');
        // Close the failed server
        this.socketServer?.close();
        
        // Create new TCP server with the same handler
        this.socketServer = this.createSocketServer();
        
        // Listen on TCP port
        this.socketServer.listen(9876, 'localhost', () => {
          this.log('Socket server listening on TCP port 9876');
        });
      } else {
        this.log(`Socket server error: ${error.message}`, 'ERROR');
        throw error;
      }
    });
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.log('Stopping monitor daemon...');
    this.isRunning = false;
    
    // Clear monitoring interval
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    
    // Close log stream
    if (this.logStream) {
      this.logStream.end();
    }
    
    // Remove PID file
    await this.removePidFile();
    
    this.log('Monitor daemon stopped');
    if (this.socketServer) {
      if (this.socketServer.listening) {
        this.socketServer.close();
      }
    }
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
    const logDir = process.env.BASE_DIRECTORY ? 
      path.join(process.env.BASE_DIRECTORY, 'logs') : 
      path.join(process.cwd(), 'logs');
    config.logFile = path.join(logDir, 'monitor-daemon.log');
  }
  
  // Set default PID file if not specified
  if (!config.pidFile) {
    const pidDir = process.env.BASE_DIRECTORY ? 
      path.join(process.env.BASE_DIRECTORY, 'run') : 
      path.join(process.cwd(), 'run');
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