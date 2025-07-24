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
    console.log(chalk.blue(`📁 Bout to create this directory like it's my main character era: ${path}`));
    execSync(`sudo mkdir -p ${path}`);
    console.log(chalk.green(`✅ Directory created and it's giving main character vibes bestie: ${path}`));
}

export function mountOverlayDirectory(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {
    console.log(chalk.blue(`🔧 Time to mount this overlay like we're building the ultimate tech stack:
    Lower: ${lowerdir}
    Upper: ${upperdir}
    Work: ${workdir}
    Merge: ${merge_path}`));
    execSync(`sudo mount -t overlay overlay -o lowerdir=${lowerdir},upperdir=${upperdir},workdir=${workdir} ${merge_path}`);
    console.log(chalk.green(`✅ Overlay mounted and it's absolutely sending me bestie: ${merge_path}`));
}

export function mountBindDrive(path: string, mountpoint: string): void {
    console.log(chalk.blue(`🔗 Binding this drive like we're creating the ultimate connection: ${path} to ${mountpoint}`));
    execSync(`sudo mount --bind ${path} ${mountpoint}`);
    console.log(chalk.green(`✅ Bind drive mounted successfully bestie: ${mountpoint}`));
}

export function checkMountpoint(mountpoint: string): boolean {
    console.log(chalk.blue(`🔍 Checking if this mountpoint is giving what it's supposed to give: ${mountpoint}`));
    try {
        execSync(`mountpoint -q ${mountpoint}`);
        console.log(chalk.yellow(`⚠️  Mountpoint ${mountpoint} said "I'm already here bestie" - no cap detected`));
        return true;
    } catch (err: any) {
        console.log(chalk.green(`✅ Mountpoint ${mountpoint} is available bestie`));
        return false;
    }
}

export function mountCrate(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {

    if(checkMountpoint(merge_path)) {
        console.log(chalk.yellow('⚠️  Mountpoint said "I already exist bestie" - skipping this whole situation'));
        return;
    }

    // Mount the directory
    console.log(chalk.yellow('🔧 Mounting OverlayFS...'));
    mountOverlayDirectory(lowerdir, upperdir, workdir, merge_path);
    console.log(chalk.green('✅ OverlayFS mounted successfully:'), chalk.cyan(merge_path));


    // Mounting other system directories
    console.log(chalk.yellow('🔧 Mounting system directories...'));

    mountBindDrive("/proc", merge_path + "/proc");
    mountBindDrive("/dev", merge_path + "/dev");
    mountBindDrive("/sys", merge_path + "/sys");

    // Mount DevPTS
    execSync(`mount -t devpts devpts ${merge_path}/dev/pts`);


    console.log(chalk.green('✅ System directories mounted and they\'re serving functionality realness'));
}

export function unmountCrate(merge_path: string): void {
    
    if (!checkMountpoint(merge_path)) {
        console.log(chalk.yellow('⚠️  Mountpoint said "I don\'t exist" - can\'t unmount what\'s not there bestie'));
        return;
    }

    // Unmounting other system directories
    console.log(chalk.yellow('🧹 Time to unmount these system directories - cleanup era activated...'));
    try {
        execSync(`sudo umount ${merge_path}/dev/pts`);
        execSync(`sudo umount ${merge_path}/proc`);
        execSync(`sudo umount ${merge_path}/dev`);
        execSync(`sudo umount ${merge_path}/sys`);
    } catch (err: any) {
        console.log(chalk.yellow(`❌ System directories said "nah fam" and refused to unmount: ${err.message}`));
    }


    // Unmount the directory
    console.log(chalk.yellow('🧹 Unmounting OverlayFS - time to clean up this tech sandwich...'));
    try {
        execSync(`sudo umount ${merge_path}`);
        console.log(chalk.green('✅ OverlayFS unmounted and we\'re back to a clean slate - very demure, very mindful'));
    } catch (err: any) {
        console.log(chalk.yellow(`❌ OverlayFS said "I'm not going anywhere" and refused to unmount: ${err.message}`));
    }

    console.log(chalk.green('✅ System directories unmounted - cleanup complete and we\'re feeling fresh'));
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
        
        console.log(chalk.yellow(`🧹 About to yeet this crate into the void: ${cratePath}`));
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        console.log(chalk.green(`✅ Crate successfully yeeted - it\'s giving clean slate energy: ${cratePath}`));
        
    } catch (err: any) {
        if (options.force) {
            console.warn(`⚠️  Force removing image ${name} even though it\'s being dramatic:`, err.message);
        } else {
            throw new Error(`❌ Failed to remove image ${name}: ${err.message}`);
        }
    }
}

export async function removeGzipCrate(name: string, options: { force?: boolean } = {}): Promise<void> {
    try {

        // Check if the crate is existing
        if (!await checkName(name)) {
            console.log(chalk.yellow(`⚠️  Crate ${name} said "I don\'t exist bestie" - can\'t delete what\'s not there`));
            return;
        }

        const gzipCratePath = `${PATHS.crates}/${name}.tar.gz`;
        
        console.log(chalk.yellow(`🧹 Time to delete this gzip crate like it never happened: ${gzipCratePath}`));
        const rmCommand = `sudo rm -rf ${gzipCratePath}`
        execSync(rmCommand);
        console.log(chalk.green(`✅ Gzip crate deleted and it\'s giving fresh start vibes: ${gzipCratePath}`));

    } catch (err: any) {
        if (options.force) {
            console.warn(`⚠️  Force removing image ${name} even though it's throwing a tantrum:`, err.message);
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
        
        console.log(chalk.yellow(`🧹 About to delete this ship like it sailed away: ${cratePath}`));
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        console.log(chalk.green(`✅ Ship successfully deleted - bon voyage bestie: ${cratePath}`));
    } catch (err: any) {
        if (!options.force) {
            throw new Error(`❌ Failed to remove crate ${shipID}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`⚠️  Force removing crate ${shipID} even though it's being extra dramatic:`, err instanceof Error ? err.message : String(err));
    }
}