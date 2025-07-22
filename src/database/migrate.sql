-- Table to store the Shipperfile content
CREATE TABLE IF NOT EXISTS shipper_files (
    id INT PRIMARY KEY, -- Unique identifier for the Shipperfile (e.g., a SHA256 hash of its content, or a UUID)
    name TEXT NOT NULL, -- A user-friendly name for the Shipperfile (e.g., "my-web-app-shipperfile")
    content TEXT NOT NULL, -- The full YAML content of the Shipperfile
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of creation (ISO8601 format)
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of last update
    checksum TEXT UNIQUE -- SHA256 or similar hash of the content for integrity/deduplication
);

-- Index for faster lookups by name
CREATE INDEX IF NOT EXISTS idx_shipper_files_name ON shipper_files (name);

-- Table to store metadata about built Shipper images
CREATE TABLE IF NOT EXISTS shipper_images (
    id INT PRIMARY KEY, -- Unique identifier for the image (e.g., image digest/hash)
    name TEXT NOT NULL, -- Repository name of the image (e.g., "my-app")
    tag TEXT NOT NULL, -- Tag of the image (e.g., "latest", "v1.0", "dev")
    shipper_file_id TEXT, -- Foreign key linking to the shipper_files table
    base_image TEXT NOT NULL, -- The base image used (e.g., "ubuntu:24.04", "alpine:3.18")
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of image creation
    size_bytes INTEGER, -- Size of the image in bytes
    digest TEXT UNIQUE, -- Unique content-addressable hash (e.g., "sha256:...")

    FOREIGN KEY (shipper_file_id) REFERENCES shipper_files(id) ON DELETE SET NULL,
    UNIQUE(name, tag) -- Ensure unique image name and tag combinations
);

-- Index for faster lookups by name and tag
CREATE INDEX IF NOT EXISTS idx_shipper_images_name_tag ON shipper_images (name, tag);

-- Table to store metadata about running/stopped Shipper crates
CREATE TABLE IF NOT EXISTS shipper_crates (
    id INT PRIMARY KEY, -- Unique identifier for the crate instance (e.g., a UUID or short hash)
    name TEXT UNIQUE NOT NULL, -- A user-assigned unique name for the crate
    image_id TEXT NOT NULL, -- Foreign key linking to the shipper_images table
    status TEXT NOT NULL, -- Current status (e.g., "running", "stopped", "exited", "paused")
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Timestamp of crate creation
    started_at TEXT, -- Timestamp when the crate was started (nullable)
    stopped_at TEXT, -- Timestamp when the crate was stopped (nullable)
    exit_code INTEGER, -- Exit code if the crate exited (nullable)
    ports_mapping TEXT, -- JSON string of port mappings (e.g., '[{"host":8080, "crate":80, "protocol":"tcp"}]')
    volumes_mapping TEXT, -- JSON string of volume mappings (e.g., '[{"host":"/local/data", "crate":"/app/data"}]')
    environment_variables TEXT, -- JSON string of environment variables (e.g., '{"APP_ENV":"production"}')

    FOREIGN KEY (image_id) REFERENCES shipper_images(id) ON DELETE CASCADE
);

-- Index for faster lookups by image_id and status
CREATE INDEX IF NOT EXISTS idx_shipper_crates_image_status ON shipper_crates (image_id, status);
