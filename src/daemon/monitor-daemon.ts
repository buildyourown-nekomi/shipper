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

import { monitorAllShips } from '../handlers/deploy.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import load_env from 'dotenv';
import { parseArgs } from 'util';

// Load environment variables
load_env.config();

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

export { MonitorDaemon };