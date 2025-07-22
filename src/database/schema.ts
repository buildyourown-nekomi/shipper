import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const shipperFiles = sqliteTable('shipper_files', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    checksum: text('checksum').unique()
}, (table) => ({
    nameIdx: index('idx_shipper_files_name').on(table.name)
}));

export const shipperImages = sqliteTable('shipper_images', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    shipperFileId: text('shipper_file_id').references(() => shipperFiles.id, { onDelete: 'set null' }),
    baseImage: text('base_image').notNull(),
    createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    sizeBytes: integer('size_bytes'),
    digest: text('digest').unique()
}, (table) => ({
    nameTagIdx: uniqueIndex('idx_shipper_images_name_tag').on(table.name, table.tag)
}));

export const shipperCrates = sqliteTable('shipper_crates', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    imageId: text('image_id').notNull().references(() => shipperImages.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    startedAt: text('started_at'),
    stoppedAt: text('stopped_at'),
    exitCode: integer('exit_code'),
    portsMapping: text('ports_mapping'),
    volumesMapping: text('volumes_mapping'),
    environmentVariables: text('environment_variables')
}, (table) => ({
    imageStatusIdx: index('idx_shipper_crates_image_status').on(table.imageId, table.status)
}));

//* Ignore Credentials for now :DD
// export const shipperRegistryCredentials = sqliteTable('shipper_registry_credentials', {
//     id: integer('id').primaryKey({ autoIncrement: true }),
//     serverAddress: text('server_address').notNull().unique(),
//     username: text('username').notNull(),
//     passwordHash: text('password_hash'),
//     authToken: text('auth_token'),
//     createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
//     updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
// }, (table) => ({
//     serverAddressIdx: index('idx_shipper_registry_credentials_server').on(table.serverAddress)
// }));