import { db } from "../database/db.js"; 
import { eq } from "drizzle-orm";
import { keelanCrate } from "../database/schema.js";

export async function resolveLayer(name: string): Promise<string[]> {
    
    // Query the database for the layer
    if (name == "debian") {
        // Default image, return the name
        return [name];
    }

    // Query the database for the layer
    const result = await db.select().from(keelanCrate).where(
        eq(keelanCrate.name, name)
    ).limit(1);
    
    if (!result || result.length === 0) {
        throw new Error(`Layer ${name} not found`);
    }
    
    // Recursively resolve the base layer
    const baseLayers = await resolveLayer(result[0].baseImage);
    
    // Check if the current layer is already in the base layers to prevent duplicates
    if (!baseLayers.includes(name)) {
        baseLayers.unshift(name);
    }
    
    return baseLayers;
}
