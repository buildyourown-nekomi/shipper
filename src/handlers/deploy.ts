import fs from 'fs-extra';
import * as fs_original from 'fs';
import { execSync } from 'child_process';
import { parse } from 'yaml';
import chalk from 'chalk';
import { KeelanParser } from '../keelan-parser.js';

// Type definitions for command arguments
interface DeployOptions {
  env: 'dev' | 'staging' | 'production';
  'dry-run': boolean;
  workingDirectory: string;
  name: string;
}

export const deployHandler = (options: DeployOptions) => {
  if (options.workingDirectory) {
    process.chdir(options.workingDirectory);
  }

  if (!fs_original.existsSync('Keelanfile.yml')) {
    console.error('Error: Keelanfile.yml not found.');
    console.error('Please run "Keelan init" to create a new Keelanfile.yml.');
    process.exit(1);
  }

  const config = KeelanParser.parseFromFile('Keelanfile.yml');

  const steps = config.runtime_command || config.runtime_entrypoint;
  if (!steps) {
    console.error('Error: No "deploy" configuration found in Keelanfile.yml.');
    process.exit(1);
  }

  // console.log(chalk.cyan('Executing deploy steps...'));

  // if (steps.commands) {
  //   for (const cmd of steps.commands) {
  //     console.log(chalk.yellow(`$ ${cmd}`));
  //     try {
  //       execSync(cmd, { stdio: 'inherit' });
  //     } catch (error) {
  //       console.error(chalk.red(`Error executing command: ${cmd}`));
  //       process.exit(1);
  //     }
  //   }
  // }

  // if (steps.cmd) {
  //   const cmd = `${steps.cmd} ${steps.args.join(' ')}`;
  //   console.log(chalk.yellow(`$ ${cmd}`));
  //   try {
  //     execSync(cmd, { stdio: 'inherit' });
  //   } catch (error) {
  //     console.error(chalk.red(`Error executing command: ${cmd}`));
  //     process.exit(1);
  //   }
  // }

  console.log(chalk.green('✅ Deploy completed.'));
};