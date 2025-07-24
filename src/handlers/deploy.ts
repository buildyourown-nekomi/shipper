import fs from 'fs-extra';
import * as fs_original from 'fs';
import { execSync } from 'child_process';
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

import net from 'net';
import xpipe from 'xpipe';

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

  console.log(chalk.magenta('🚀 Preparing to deploy in crate:'), chalk.cyan(command_w_chroot));

  // Ensure the log directory exists
  const logDir = `${process.env.BASE_DIRECTORY}/logs/${options.name}`;
  await fs.ensureDir(logDir);

  // Connect to daemon via named pipe, fallback to TCP if not supported
  const connectToDaemon = () => {
    return new Promise<void>((resolve, reject) => {
      const message = {
        type: 'deploy',
        shipID,
        command: command_w_chroot,
        logDir,
        imageId: file_data[0].id
      };

      // Try named pipe first
      const pipePath = xpipe.eq('keelan-daemon');
      const client = net.createConnection(pipePath, () => {
        client.write(JSON.stringify(message));
      });

      client.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.status === 'success') {
          console.log(chalk.green('✅ Command executed successfully. PID:'), chalk.yellow(response.pid));
        } else {
          console.error(chalk.red('❌ Deployment failed:'), response.message);
        }
        client.end();
        resolve();
      });

      client.on('error', (err: any) => {
        if (err.code === 'ENOTSUP' || err.code === 'ENOTFOUND' || err.code === 'ENOENT') {
          console.log(chalk.yellow('⚠️  Named pipe not available, trying TCP connection...'));
          client.destroy();
          
          // Fallback to TCP
          const tcpClient = net.createConnection(9876, 'localhost', () => {
            tcpClient.write(JSON.stringify(message));
          });

          tcpClient.on('data', (data) => {
            const response = JSON.parse(data.toString());
            if (response.status === 'success') {
              console.log(chalk.green('✅ Command executed successfully. PID:'), chalk.yellow(response.pid));
            } else {
              console.error(chalk.red('❌ Deployment failed:'), response.message);
            }
            tcpClient.end();
            resolve();
          });

          tcpClient.on('error', (tcpErr) => {
            console.error(chalk.red('❌ Error connecting to daemon via TCP:'), tcpErr.message);
            reject(tcpErr);
          });
        } else {
          console.error(chalk.red('❌ Error connecting to daemon:'), err.message);
          reject(err);
        }
      });
    });
  };

  try {
    await connectToDaemon();
  } catch (error) {
    console.error(chalk.red('❌ Failed to connect to daemon'));
    process.exit(1);
  }

  console.log(chalk.green('🎉 Deploy initiated!'));
  console.log(chalk.blue('📊 Monitoring handled by daemon...'));
  console.log(chalk.gray(`📁 Logs: ${process.env.BASE_DIRECTORY}/logs/${options.name}/`));
};