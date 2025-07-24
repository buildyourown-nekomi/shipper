import { execSync } from "child_process";
import { db } from "../database/db.js";
import { keelanCrate, keelanFiles } from "../database/schema.js";
import sha256 from "sha256";
import { eq } from "drizzle-orm";
import load_env from "dotenv";
import chalk from "chalk";
import { PATHS } from "../constants.js";
load_env.config({ quiet: true });

export function createDirectory(path: string): void {
    console.log(chalk.blue(`📁 Creating directory: ${path}`));
    execSync(`sudo mkdir -p ${path}`);
    console.log(chalk.green(`✅ Successfully created directory: ${path}`));
}

export function mountOverlayDirectory(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {
    console.log(chalk.blue(`🔧 Mounting overlay directory:
    📂 Lowerdir: ${lowerdir}
    📁 Upperdir: ${upperdir}
    🔧 Workdir: ${workdir}
    📂 Merge path: ${merge_path}`));
    execSync(`sudo mount -t overlay overlay -o lowerdir=${lowerdir},upperdir=${upperdir},workdir=${workdir} ${merge_path}`);
    console.log(chalk.green(`✅ Successfully mounted overlay at: ${merge_path}`));
}

export function mountBindDrive(path: string, mountpoint: string): void {
    console.log(chalk.blue(`🔗 Mounting bind drive from ${path} to ${mountpoint}`));
    execSync(`sudo mount --bind ${path} ${mountpoint}`);
    console.log(chalk.green(`✅ Successfully mounted bind drive to ${mountpoint}`));
}

export function checkMountpoint(mountpoint: string): boolean {
    console.log(chalk.blue(`🔍 Checking mountpoint status: ${mountpoint}`));
    try {
        execSync(`mountpoint -q ${mountpoint}`);
        console.log(chalk.yellow(`⚠️  Mountpoint ${mountpoint} is already mounted`));
        return true;
    } catch (err: any) {
        console.log(chalk.green(`✅ Mountpoint ${mountpoint} is available`));
        return false;
    }
}

export function mountCrate(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {

    if(checkMountpoint(merge_path)) {
        console.log(chalk.yellow('⚠️  Mountpoint already exists. Skipping mounting.'));
        return;
    }

    // Mount the directory
    console.log(chalk.yellow('🔧 Mounting OverlayFS...'));
    mountOverlayDirectory(lowerdir, upperdir, workdir, merge_path);
    console.log(chalk.green('✅ Successfully mounted OverlayFS at merge point:'), chalk.cyan(merge_path));


    // Mounting other system directories
    console.log(chalk.yellow('🔧 Mounting system directories...'));

    mountBindDrive("/proc", merge_path + "/proc");
    mountBindDrive("/dev", merge_path + "/dev");
    mountBindDrive("/sys", merge_path + "/sys");

    // Mount DevPTS
    execSync(`mount -t devpts devpts ${merge_path}/dev/pts`);


    console.log(chalk.green('✅ Successfully mounted system directories.'));
}

export function unmountCrate(merge_path: string): void {
    
    if (!checkMountpoint(merge_path)) {
        console.log(chalk.yellow('⚠️  Mountpoint does not exist. Skipping unmounting.'));
        return;
    }

    // Unmounting other system directories
    console.log(chalk.yellow('🧹 Unmounting system directories...'));
    try {
        execSync(`sudo umount ${merge_path}/dev/pts`);
        execSync(`sudo umount ${merge_path}/proc`);
        execSync(`sudo umount ${merge_path}/dev`);
        execSync(`sudo umount ${merge_path}/sys`);
    } catch (err: any) {
        console.log(chalk.yellow(`❌ Failed to unmount system directories: ${err.message}`));
    }


    // Unmount the directory
    console.log(chalk.yellow('🧹 Unmounting OverlayFS...'));
    try {
        execSync(`sudo umount ${merge_path}`);
        console.log(chalk.green('✅ Successfully unmounted OverlayFS.'));
    } catch (err: any) {
        console.log(chalk.yellow(`❌ Failed to unmount OverlayFS: ${err.message}`));
    }

    console.log(chalk.green('✅ Successfully unmounted system directories.'));
}

export async function writeCrateFile(name: string, content: string) {
    return db.
        insert(keelanFiles)
        .values({
            name: name,
            content: content,
            checksum: sha256(content)
        }).returning();
}

export async function writeCrate(name: string, image: string, layer: string, sizeBytes: number, digest: string, keelanFileId: number): Promise<any> {
    return db
    .insert(keelanCrate)
    .values({
        name: name,
        tag: "latest",
        keelanFileId: keelanFileId,
        baseImage: image,
        layer: layer,
        sizeBytes: sizeBytes,
        digest: digest,
    })
}


export async function checkName(name: string): Promise<boolean> {
    const result = await db.select().from(keelanFiles).where(
        eq(keelanFiles.name, name)
    ).limit(1);
    return result.length > 0;
}

export async function removeCrate(name: string, options: { force?: boolean } = {}): Promise<void> {
    try {

        // Check if the crate is existing

        // Remove the directory of the image
        const cratePath = `${PATHS.crates}/${name}`;
        const workcratePath = `${cratePath}_work`;
        const mergecratePath = `${cratePath}_merge`;
        // execSync(`sudo umount ${mergecratePath} || ${options.force ? 'true' : 'false'}`);

        unmountCrate(mergecratePath);
        
        console.log(chalk.yellow(`🧹 Removing crate: ${cratePath}`));
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        console.log(chalk.green(`✅ Successfully removed crate: ${cratePath}`));
        
    } catch (err: any) {
        if (options.force) {
            console.warn(`⚠️  Force removal of image ${name} despite error:`, err.message);
        } else {
            throw new Error(`❌ Failed to remove image ${name}: ${err.message}`);
        }
    }
}

export async function removeGzipCrate(name: string, options: { force?: boolean } = {}): Promise<void> {
    try {

        // Check if the crate is existing
        if (!await checkName(name)) {
            console.log(chalk.yellow(`⚠️  Crate ${name} does not exist. Skipping removal.`));
            return;
        }

        const gzipCratePath = `${PATHS.crates}/${name}.tar.gz`;
        
        console.log(chalk.yellow(`🧹 Removing gzip crate: ${gzipCratePath}`));
        const rmCommand = `sudo rm -rf ${gzipCratePath}`
        execSync(rmCommand);
        console.log(chalk.green(`✅ Successfully removed gzip crate: ${gzipCratePath}`));

    } catch (err: any) {
        if (options.force) {
            console.warn(`⚠️  Force removal of image ${name} despite error:`, err.message);
        } else {
            throw new Error(`❌ Failed to remove image ${name}: ${err.message}`);
        }
    }
}

export async function removeShip(shipID: string, options: { force?: boolean; recursive?: boolean } = {}): Promise<void> {
    try {
        // Remove the directory of the image
        const cratePath = `${PATHS.ships}/${shipID}`;
        const workcratePath = `${cratePath}_work`;
        const mergecratePath = `${cratePath}_merge`;
        unmountCrate(mergecratePath);
        
        console.log(chalk.yellow(`🧹 Removing ship: ${cratePath}`));
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        console.log(chalk.green(`✅ Successfully removed ship: ${cratePath}`));
    } catch (err: any) {
        if (!options.force) {
            throw new Error(`❌ Failed to remove crate ${shipID}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`⚠️  Force removal of crate ${shipID} despite error:`, err instanceof Error ? err.message : String(err));
    }
}