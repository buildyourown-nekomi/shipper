import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs-extra';
import load_env from 'dotenv';
load_env.config();

// Import handler functions from their respective modules
import { buildHandler } from './handlers/build.js';
import { deployHandler } from './handlers/deploy.js';
import { configHandler } from './handlers/config.js';
import { listHandler } from './handlers/list.js';
import { removeCrateHandler, removeShipHandler } from './handlers/remove.js';

// CLI setup
const argv = yargs(hideBin(process.argv))
  .scriptName('keelan')
  .usage('Usage: $0 <command> [options]')
  .command(
    ['deploy', 'up'],
    'Deploy the project (alias: up)',
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
          alias: "w",
          type: 'string',
          description: 'Working directory for deployment'
        })
        .option('name', {
          alias: 'n',
          type: 'string',
          description: 'Name of the deployment',
          demandOption: true
        });
    },
    (argv) => deployHandler(argv as any)
  )
  .command(
    'build',
    'Build the project',
    (yargs) => {
      return yargs
        .option('watch', {
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
          alias: "w",
          type: 'string',
          description: 'Working directory for build'
        })
        .option('name', {
          alias: 'n',
          type: 'string',
          description: 'Name of the build',
          demandOption: true
        });
    },
    (argv) => buildHandler(argv as any)
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
    (argv) => configHandler(argv as any)
  )
  .command(
    'list [type]',
    'List crates or ships',
    (yargs) => {
      return yargs
        .positional('type', {
          describe: 'Type of items to list',
          type: 'string',
          choices: ['crate', 'ship'] as const,
          default: 'crate'
        })
        .option('all', {
          alias: 'a',
          type: 'boolean',
          description: 'List all items',
          default: false
        });
    },
    (argv) => listHandler(argv as any)
  )
  .command(
    'init',
    'Initialize a new Keelan project',
    () => {
      // No options for init command
    },
    (argv) => {
      const KeelanfileContent = `
        # Keelanfile for project
        # See https://Keelan.dev/docs/Keelanfile
        
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
      
      fs.writeFileSync('Keelanfile.yml', KeelanfileContent.trim());
      
      console.log('✅ Keelanfile.yml created successfully.');
    }
  )
  .command(
    'remove-image <name>',
    'Remove a Keelan image',
    (yargs) => {
      return yargs
        .positional('name', {
          describe: 'Name of the image to remove',
          type: 'string',
          demandOption: true
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          description: 'Force removal of the image',
          default: false
        });
    },
    (argv) => removeCrateHandler(argv as any)
  )
  .command(
    'remove-crate <name>',
    'Remove a Keelan crate',
    (yargs) => {
      return yargs
        .positional('name', {
          describe: 'Name of the crate to remove',
          type: 'string',
          demandOption: true
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          description: 'Force removal of the crate',
          default: false
        })
        .option('recursive', {
          alias: 'r',
          type: 'boolean',
          description: 'Recursively remove crate and its contents',
          default: false
        });
    },
    (argv) => removeShipHandler(argv as any)
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
