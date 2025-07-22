import { execSync } from "child_process";
import { db } from "../database/db.js";
import { shipperFiles } from "../database/schema.js";
import sha256 from "sha256";
import { eq } from "drizzle-orm";
import load_env from "dotenv";
load_env.config();

export function createDirectory(path: string): void {
    // Create the directory
    execSync(`sudo mkdir -p ${path}`);
}

export function mountDirectory(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {
    // Mount the directory
    execSync(`sudo mount -t overlay overlay -o lowerdir=${lowerdir},upperdir=${upperdir},workdir=${workdir} ${merge_path}`);
}

export async function writeImageFile(name: string, content: string): Promise<any> {
    return db.
        insert(shipperFiles)
        .values({
            name: name,
            content: content,
            checksum: sha256(content)
        }).returning();
}

export async function checkName(name: string): Promise<boolean> {
    const result = await db.select().from(shipperFiles).where(
        eq(shipperFiles.name, name)
    ).limit(1);
    console.log(result);
    return result.length > 0;
}

export async function removeImage(name: string, options: { force?: boolean } = {}): Promise<void> {
    try {
        await db.delete(shipperFiles)
            .where(eq(shipperFiles.name, name))
            .execute();

        // Remove the directory of the image
        const cratePath = `${process.env.BASE_DIRECTORY}/crates/${name}`;
        const workcratePath = `${cratePath}_work`;
        const mergecratePath = `${cratePath}_merge`;
        execSync(`sudo umount ${mergecratePath} || ${options.force ? 'true' : 'false'}`);
        
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        
    } catch (err: any) {
        if (options.force) {
            console.warn(`Force removal of image ${name} despite error:`, err.message);
        } else {
            throw new Error(`Failed to remove image ${name}: ${err.message}`);
        }
    }
}

export async function removeCrate(name: string, options: { force?: boolean; recursive?: boolean } = {}): Promise<void> {
    try {
        await db.delete(shipperFiles)
            .where(eq(shipperFiles.name, name))
            .execute();

        // Remove the directory of the image
        const cratePath = `${process.env.BASE_DIRECTORY}/crates/${name}`;
        const workcratePath = `${cratePath}_work`;
        const mergecratePath = `${cratePath}_merge`;
        execSync(`sudo umount ${mergecratePath} || ${options.force ? 'true' : 'false'}`);
        
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
    } catch (err: any) {
        if (!options.force) {
            throw new Error(`Failed to remove crate ${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`Force removal of crate ${name} despite error:`, err instanceof Error ? err.message : String(err));
    }
}