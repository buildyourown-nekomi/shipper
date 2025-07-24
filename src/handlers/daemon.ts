import chalk from 'chalk';
import { spawn, exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PATHS } from '../constants.js';

const execAsync = promisify(exec);

interface DaemonOptions {
  action: 'start' | 'stop' | 'status' | 'restart';
  interval?: number;
  logFile?: string;
  pidFile?: string;
  detach?: boolean;
}

export const daemonHandler = async (options: DaemonOptions) => {
  const logDir = PATHS.logs;
  const pidDir = PATHS.pids;
  
  // Ensure directories exist
  await fs.ensureDir(logDir);
  await fs.ensureDir(pidDir);
  
  const defaultLogFile = path.join(logDir, 'monitor-daemon.log');
  const defaultPidFile = path.join(pidDir, 'monitor-daemon.pid');
  
  const logFile = options.logFile || defaultLogFile;
  const pidFile = options.pidFile || defaultPidFile;
  const interval = options.interval || 10;
  
  switch (options.action) {
    case 'start':
      await startDaemon(interval, logFile, pidFile, options.detach);
      break;
    case 'stop':
      await stopDaemon(pidFile);
      break;
    case 'status':
      await getDaemonStatus(pidFile, logFile);
      break;
    case 'restart':
      await stopDaemon(pidFile);
      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));
      await startDaemon(interval, logFile, pidFile, options.detach);
      break;
    default:
      console.error(chalk.red('❌ Invalid daemon action. Use: start, stop, status, or restart'));
      process.exit(1);
  }
};

async function startDaemon(interval: number, logFile: string, pidFile: string, detach: boolean = true) {
  try {
    // Check if daemon is already running
    if (await isDaemonRunning(pidFile)) {
      console.log(chalk.yellow('⚠️  Daemon is already running'));
      return;
    }
    
    console.log(chalk.cyan('🚀 Starting Keelan Monitor Daemon...'));
    
    // Path to the daemon script
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const daemonScript = path.join(__dirname, '..', 'daemon', 'monitor-daemon.js');
    
    // Check if compiled daemon exists, if not use TypeScript version
    const daemonPath = fs.existsSync(daemonScript) 
      ? daemonScript 
      : path.join(__dirname, '..', 'daemon', 'monitor-daemon.ts');
    
    const command = fs.existsSync(daemonScript) 
      ? 'node'
      : 'tsx';
    
    const args = [
      daemonPath,
      `--interval=${interval}`,
      `--log-file=${logFile}`,
      `--pid-file=${pidFile}`
    ];
    
    if (detach) {
      // Start daemon as detached process
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
      
      child.unref();
      
      console.log(chalk.gray(`🚀 Daemon started with PID: ${child.pid}`));
      // Wait a moment to check if it started successfully
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      if (await isDaemonRunning(pidFile)) {
        console.log(chalk.green('✅ Daemon started successfully'));
        console.log(chalk.gray(`📁 Log file: ${logFile}`));
        console.log(chalk.gray(`📋 PID file: ${pidFile}`));
        console.log(chalk.gray(`⏱️  Monitoring interval: ${interval} seconds`));
      } else {
        console.error(chalk.red('❌ Failed to start daemon'));
        process.exit(1);
      }
    } else {
      // Start daemon in foreground (for debugging)
      console.log(chalk.blue('🔍 Starting daemon in foreground mode...'));
      console.log(chalk.gray('Press Ctrl+C to stop'));
      
      const child = spawn(command, args, {
        stdio: 'inherit'
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ Daemon stopped gracefully'));
        } else {
          console.error(chalk.red(`❌ Daemon exited with code ${code}`));
        }
      });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error starting daemon:'), error);
    process.exit(1);
  }
}

async function stopDaemon(pidFile: string) {
  try {
    if (!(await fs.pathExists(pidFile))) {
      console.log(chalk.yellow('⚠️  Daemon is not running (no PID file found)'));
      return;
    }
    
    const pidStr = await fs.readFile(pidFile, 'utf8');
    const pid = parseInt(pidStr.trim());
    
    if (isNaN(pid)) {
      console.error(chalk.red('❌ Invalid PID in PID file'));
      await fs.remove(pidFile);
      return;
    }
    
    console.log(chalk.cyan(`🛑 Stopping daemon (PID: ${pid})...`));
    
    try {
      // Send SIGTERM to gracefully stop the daemon
      process.kill(pid, 'SIGTERM');
      
      // Wait for the daemon to stop
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          // Check if process is still running
          process.kill(pid, 0);
          attempts++;
        } catch (error: any) {
          // Process is no longer running
          if (error.code === 'ESRCH') {
            break;
          }
          throw error;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log(chalk.yellow('⚠️  Daemon did not stop gracefully, forcing termination...'));
        process.kill(pid, 'SIGKILL');
      }
      
      // Clean up PID file
      await fs.remove(pidFile);
      
      console.log(chalk.green('✅ Daemon stopped successfully'));
      
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        console.log(chalk.yellow('⚠️  Daemon process not found (may have already stopped)'));
        await fs.remove(pidFile);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error stopping daemon:'), error);
    process.exit(1);
  }
}

async function getDaemonStatus(pidFile: string, logFile: string) {
  try {
    console.log(chalk.cyan('📊 Keelan Monitor Daemon Status'));
    console.log(chalk.gray('─'.repeat(40)));
    
    if (!(await fs.pathExists(pidFile))) {
      console.log(chalk.red('Status: ❌ Not running'));
      console.log(chalk.gray(`PID file: ${pidFile} (not found)`));
      return;
    }
    
    const pidStr = await fs.readFile(pidFile, 'utf8');
    const pid = parseInt(pidStr.trim());
    
    if (isNaN(pid)) {
      console.log(chalk.red('Status: ❌ Invalid PID file'));
      return;
    }
    
    try {
      // Check if process is running
      process.kill(pid, 0);
      console.log(chalk.green('Status: ✅ Running'));
      console.log(chalk.gray(`PID: ${pid}`));
      console.log(chalk.gray(`PID file: ${pidFile}`));
      
      // Show log file info if it exists
      if (await fs.pathExists(logFile)) {
        const stats = await fs.stat(logFile);
        console.log(chalk.gray(`Log file: ${logFile}`));
        console.log(chalk.gray(`Log size: ${(stats.size / 1024).toFixed(2)} KB`));
        console.log(chalk.gray(`Last modified: ${stats.mtime.toISOString()}`));
        
        // Show last few log lines
        try {
          const { stdout } = await execAsync(`tail -n 5 "${logFile}"`);
          if (stdout.trim()) {
            console.log(chalk.gray('\nRecent log entries:'));
            console.log(chalk.gray(stdout.trim()));
          }
        } catch (error) {
          // Ignore errors reading log file
        }
      } else {
        console.log(chalk.gray(`Log file: ${logFile} (not found)`));
      }
      
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        console.log(chalk.red('Status: ❌ Not running (stale PID file)'));
        console.log(chalk.gray(`Stale PID: ${pid}`));
        console.log(chalk.yellow('💡 Run "keelan daemon stop" to clean up'));
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error checking daemon status:'), error);
    process.exit(1);
  }
}

async function isDaemonRunning(pidFile: string): Promise<boolean> {
  try {
    if (!(await fs.pathExists(pidFile))) {
      return false;
    }
    
    const pidStr = await fs.readFile(pidFile, 'utf8');
    const pid = parseInt(pidStr.trim());
    
    if (isNaN(pid)) {
      return false;
    }
    
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error.code !== 'ESRCH';
  }
}