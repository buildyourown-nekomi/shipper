-- Table to store the Keelanfile content
CREATE TABLE IF NOT EXISTS keelan_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique identifier for the Keelanfile (e.g., a SHA256 hash of its content, or a UUID)
    name TEXT NOT NULL, -- A user-friendly name for the Keelanfile (e.g., "my-web-app-Keelanfile")
    content TEXT NOT NULL, -- The full YAML content of the Keelanfile
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of creation (ISO8601 format)
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of last update
    checksum TEXT UNIQUE -- SHA256 or similar hash of the content for integrity/deduplication
);

-- Index for faster lookups by name
CREATE INDEX IF NOT EXISTS idx_keelan_files_name ON keelan_files (name);

-- Table to store metadata about built Keelan crate
CREATE TABLE IF NOT EXISTS keelan_crate (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique identifier for the image (e.g., image digest/hash)
    name TEXT NOT NULL, -- Repository name of the image (e.g., "my-app")
    tag TEXT NOT NULL, -- Tag of the image (e.g., "latest", "v1.0", "dev")
    keelan_file_id TEXT, -- Foreign key linking to the keelan_files table
    base_image TEXT NOT NULL, -- The base image used (e.g., "ubuntu:24.04", "alpine:3.18")
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of image creation
    size_bytes INTEGER, -- Size of the image in bytes
    digest TEXT UNIQUE, -- Unique content-addressable hash (e.g., "sha256:...")
    layer TEXT, -- The layer CACHED (e.g., "debian", "python:3.10")

    FOREIGN KEY (keelan_file_id) REFERENCES keelan_files(id) ON DELETE SET NULL,
    UNIQUE(name, tag) -- Ensure unique image name and tag combinations
);

-- Index for faster lookups by name and tag
CREATE INDEX IF NOT EXISTS idx_keelan_crate_name_tag ON keelan_crate (name, tag);

CREATE TABLE IF NOT EXISTS keelan_ships (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique identifier for the ship (e.g., a UUID or short hash)
    name TEXT UNIQUE NOT NULL, -- A user-assigned unique name for the ship
    image_id TEXT NOT NULL, -- Foreign key linking to the keelan_crate table
    status TEXT NOT NULL, -- Current status (e.g., "running", "stopped", "exited", "paused")
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of ship creation
    started_at TEXT, -- Timestamp when the ship was started (nullable)
    stopped_at TEXT, -- Timestamp when the ship was stopped (nullable)
    exit_code INTEGER, -- Exit code if the ship exited (nullable)
    process_id INTEGER, -- Process ID of the ship (nullable)

    FOREIGN KEY (image_id) REFERENCES keelan_crate(id) ON DELETE CASCADE
);