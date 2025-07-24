/**
 * Application constants and configuration
 */

import path from 'path';
import os from 'os';

// Base directory for Keelan data storage
// Use environment variable if set, otherwise use platform-appropriate default
export const BASE_DIRECTORY = process.env.BASE_DIRECTORY || 
  (os.platform() === 'win32' 
    ? path.join(os.homedir(), 'AppData', 'Local', 'keelan')
    : '/var/lib/keelan');

// Derived paths
export const PATHS = {
  crates: path.join(BASE_DIRECTORY, 'crates'),
  ships: path.join(BASE_DIRECTORY, 'ships'),
  logs: path.join(BASE_DIRECTORY, 'logs'),
  database: path.join(BASE_DIRECTORY, 'database'),
  pids: path.join(BASE_DIRECTORY, 'run')
} as const;