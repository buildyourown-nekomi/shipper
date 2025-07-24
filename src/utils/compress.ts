import path from "path";
import { pipeline } from "stream";
import fs from "fs";
import crypto from "crypto";
import chalk from "chalk";
// import { create, extract } from "tar";
import * as tar from 'tar'
import { execSync } from "child_process";
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);



export async function compress(sourceDirectory: string, dist: string, outputTarGzFile: string) {
    const cmd = `tar --exclude='*/var/lib/apt/lists/*' -czf ${outputTarGzFile} -C ${sourceDirectory} ${dist}`;
    console.log(chalk.blue(`📦 About to compress this crate like it's going on a diet: ${sourceDirectory}`));
    console.log(chalk.cyan(`📄 Output file: ${outputTarGzFile}`));
    console.log(chalk.blue(`🔧 Running command:`), chalk.yellow(cmd));
    execSync(cmd);
    console.log(chalk.green(`✅ Crate compressed successfully and it's giving compact energy.`));
}

/**
 * Calculates the SHA256 digest of a given file and returns its size.
 * @param {string} filePath - The path to the file to process.
 * @returns {Promise<{ digest: string, fileSize: number }>} - A promise that resolves with the file path, its SHA256 digest, and its size.
 */
export async function getFileDigest(filePath: string): Promise<{ digest: string, fileSize: number }> {
    console.log(chalk.blue(`🔍 Calculating SHA256 digest for file like we're doing math homework: ${filePath}`));

    return new Promise(async (resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const readStream = fs.createReadStream(filePath);

        readStream.on('error', (err) => {
            console.error(chalk.red('💥 readStream error - bestie, something went wrong fr:'), err);
            reject(err);
        });

        hash.on('error', (err) => {
            console.error(chalk.red('💥 hash error - fam, the math isn\'t mathing bestie:'), err);
            reject(err);
        });

        try {
            await pipelineAsync(
                readStream, // Source: read file stream
                hash        // Transform: calculate hash
            );

            const digest = hash.digest('hex');
            console.log(chalk.green(`✅ Digest calculated and it's giving secure vibes for: ${filePath}`));
            console.log(chalk.yellow(`🔑 SHA256 Digest: ${digest}`));

            const stats = await fs.promises.stat(filePath);
            const fileSize = stats.size;
            console.log(chalk.magenta(`📊 File Size: ${fileSize} bytes`));

            resolve({ digest, fileSize });
        } catch (err) {
            console.error(chalk.red('❌ Error during file reading or hashing bestie:'), err);
            reject(err);
        }
    });
}

/**
 * Extracts a .tar.gz file to a specified destination directory.
 */
// export async function extractTarGz(sourceTarGzFile: string, destinationDirectory: string) {
//     console.log(chalk.blue(`📂 Extracting ${sourceTarGzFile} to ${destinationDirectory}`));
//     await fs.promises.mkdir(destinationDirectory, { recursive: true });

//     return new Promise((resolve, reject) => {
//         const readStream = fs.createReadStream(sourceTarGzFile);
//         const extractStream = extract({
//             cwd: destinationDirectory // Set the destination for extraction
//         });

//         pipeline(
//             readStream,
//             extractStream,
//             (err) => {
//                 if (err) {
//                     console.error(chalk.red('❌ Error during extraction:'), err);
//                     return reject(err);
//                 }
//                 console.log(chalk.green('✅ Extraction complete.'));
//                 resolve(true);
//             }
//         );
//     });
// }