#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { parse } from 'yaml';

// Type definitions for command arguments
interface DeployOptions {
  env: 'dev' | 'staging' | 'production';
  'dry-run': boolean;
  workingDirectory: string;
}

interface BuildOptions {
  watch: boolean;
  production: boolean;
  workingDirectory: string;
}

interface ConfigOptions {
  key?: string;
  value?: string;
  list: boolean;
  reset: boolean;
}

interface ListOptions {
  type: 'container' | 'images';
  all: boolean;
}

const execute = (command: 'build' | 'deploy', options: BuildOptions | DeployOptions) => {
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

  const steps = config[command];
  if (!steps) {
    console.error(`Error: No "${command}" configuration found in Shipperfile.yml.`);
    process.exit(1);
  }

  console.log(`Executing "${command}" steps...`);

  if (steps.commands) {
    for (const cmd of steps.commands) {
      console.log(`$ ${cmd}`);
      try {
        execSync(cmd, { stdio: 'inherit' });
      } catch (error) {
        console.error(`Error executing command: ${cmd}`);
        process.exit(1);
      }
    }
  }

  if (command === 'deploy' && steps.cmd) {
    const cmd = `${steps.cmd} ${steps.args.join(' ')}`;
    console.log(`$ ${cmd}`);
    try {
      execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
      console.error(`Error executing command: ${cmd}`);
      process.exit(1);
    }
  }

  console.log(`✅ ${command} completed.`);
};

const config = async (options: ConfigOptions) => {
  console.log('Configuring project...');
  console.log('Options:', options);
  console.log('✅ Configuration updated (dummy)');
};

const list = async (options: ListOptions) => {
  console.log(`Listing ${options.type}...`);
  if (options.all) {
    console.log('All items would be listed here');
  } else {
    console.log(`Items of type ${options.type} would be listed here`);
  }
};

// CLI setup
const argv = yargs(hideBin(process.argv))
  .scriptName('shipper')
  .usage('Usage: $0 <command> [options]')
  .command(
    'deploy',
    'Deploy the project',
    (yargs) => {
      return yargs
        .option('env', {
          alias: 'e',
          type: 'string',
          description: 'Environment to deploy to',
          choices: ['dev', 'staging', 'production'] as const,
          default: 'dev'
        })
        .option('dry-run', {
          type: 'boolean',
          description: 'Show what would be deployed without actually deploying',
          default: false
        })
        .option('workingDirectory', {
          type: 'string',
          description: 'Working directory for deployment'
        });
    },
    (argv) => execute('deploy', argv as any)
  )
  .command(
    'build',
    'Build the project',
    (yargs) => {
      return yargs
        .option('watch', {
          alias: 'w',
          type: 'boolean',
          description: 'Watch for changes',
          default: false
        })
        .option('production', {
          alias: 'p',
          type: 'boolean',
          description: 'Build for production',
          default: false
        })
        .option('workingDirectory', {
          type: 'string',
          description: 'Working directory for build'
        });
    },
    (argv) => execute('build', argv as any)
  )
  .command(
    'config [key] [value]',
    'Manage configuration',
    (yargs) => {
      return yargs
        .positional('key', {
          describe: 'Configuration key',
          type: 'string'
        })
        .positional('value', {
          describe: 'Configuration value',
          type: 'string'
        })
        .option('list', {
          alias: 'l',
          type: 'boolean',
          description: 'List all configuration',
          default: false
        })
        .option('reset', {
          type: 'boolean',
          description: 'Reset to default configuration',
          default: false
        });
    },
    (argv) => config(argv as any)
  )
  .command(
    'list [type]',
    'List containers or images',
    (yargs) => {
      return yargs
        .positional('type', {
          describe: 'Type of items to list',
          type: 'string',
          choices: ['container', 'images'] as const,
          default: 'container'
        })
        .option('all', {
          alias: 'a',
          type: 'boolean',
          description: 'List all items',
          default: false
        });
    },
    (argv) => list(argv as any)
  )
  .command(
    'init',
    'Initialize a new Shipper project',
    () => {
      // No options for init command
    },
    (argv) => {
      const shipperfileContent = `
        # Shipperfile for project
        # See https://shipper.dev/docs/shipperfile
        
        build:
          engine: debian_rootfs
          commands:
            - apt-get update
            - apt-get install -y curl
            - curl -sL https://deb.nodesource.com/setup_18.x | bash -
            - apt-get install -y nodejs
        
        deploy:
          cmd: 'node'
          args: ['dist/index.js']
      `;
      
      fs.writeFileSync('Shipperfile.yml', shipperfileContent.trim());
      
      console.log('✅ Shipperfile.yml created successfully.');
    }
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
    default: false
  })
  .option('quiet', {
    alias: 'q',
    type: 'boolean',
    description: 'Run quietly',
    default: false
  })
  .help()
  .alias('help', 'h')
  .version('1.0.0')
  .alias('version', 'V')
  .demandCommand(1, 'You need at least one command before moving on')
  .strict()
  .parse();

// Handle global options
if ('verbose' in argv && argv.verbose) {
  console.log('Verbose mode enabled');
}

if ('quiet' in argv && argv.quiet) {
  console.log = () => {};
}
