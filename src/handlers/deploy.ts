import * as fs from 'fs';
import { execSync } from 'child_process';
import { parse } from 'yaml';
import chalk from 'chalk';

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

  if (!fs.existsSync('Shipperfile.yml')) {
    console.error('Error: Shipperfile.yml not found.');
    console.error('Please run "shipper init" to create a new Shipperfile.yml.');
    process.exit(1);
  }

  const shipperfile = fs.readFileSync('Shipperfile.yml', 'utf8');
  const config = parse(shipperfile);

  const steps = config.deploy;
  if (!steps) {
    console.error('Error: No "deploy" configuration found in Shipperfile.yml.');
    process.exit(1);
  }

  console.log(chalk.cyan('Executing deploy steps...'));

  if (steps.commands) {
    for (const cmd of steps.commands) {
      console.log(chalk.yellow(`$ ${cmd}`));
      try {
        execSync(cmd, { stdio: 'inherit' });
      } catch (error) {
        console.error(chalk.red(`Error executing command: ${cmd}`));
        process.exit(1);
      }
    }
  }

  if (steps.cmd) {
    const cmd = `${steps.cmd} ${steps.args.join(' ')}`;
    console.log(chalk.yellow(`$ ${cmd}`));
    try {
      execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red(`Error executing command: ${cmd}`));
      process.exit(1);
    }
  }

  console.log(chalk.green('✅ Deploy completed.'));
};