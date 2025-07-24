import chalk from "chalk";
import { createDirectory, mountCrate } from "../core/core.js";
import { PATHS } from "../constants.js";

export async function createAndMountOverlay(
    upperdir_path: string, 
    lowerlayers: string[],
    workdir_path: string,
    merge_path: string
) {
    createDirectory(upperdir_path);
    createDirectory(workdir_path);
    createDirectory(merge_path);

    let lowerdir = ""

    console.log(chalk.yellow('🔧 Processing lower layers...'));
    for (let dir of lowerlayers) {
        console.log(chalk.cyan('📦 Processing layer:'), chalk.yellow(dir));
        const dir_path = `${PATHS.crates}/${dir}`;
        console.log(chalk.green('📁 Resolved layer path:'), chalk.cyan(dir_path));
        lowerdir += dir_path + ":";
    }

    lowerdir = lowerdir.slice(0, -1); // Remove the last colon
    console.log(chalk.magenta('⚙️  Layer configuration:'));
    console.log(chalk.cyan('🔽 Lower layers:'), chalk.yellow(lowerdir));
    console.log(chalk.cyan('🔼 Upper directory:'), chalk.yellow(upperdir_path));
    console.log(chalk.cyan('🔧 Work directory:'), chalk.yellow(workdir_path));
    console.log(chalk.cyan('📂 Merge directory:'), chalk.yellow(merge_path));

    // Mounting the directory
    mountCrate(lowerdir, upperdir_path, workdir_path, merge_path);

    return lowerdir

}