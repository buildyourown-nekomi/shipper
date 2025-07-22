import { db } from "../database/db.js"; 
import { eq } from "drizzle-orm";
import { shipperImages } from "../database/schema.js";

export async function resolveLayer(name: string, layers: string[] = []): Promise<string[]> {
    
    // Query the database for the layer
    if (name == "debian") {
        // Default image, return the name
        layers.push(name);
        return layers;
    }

    // Query the database for the layer
    const result = await db.select().from(shipperImages).where(
        eq(shipperImages.name, name)
    ).limit(1);
    
    if (!result) {
        throw new Error(`Layer ${name} not found`);
    }
    
    // Recursively resolve the layer
    layers.push(name);
    layers.push(...(await resolveLayer(result[0].baseImage, layers)));

    return layers;
}
