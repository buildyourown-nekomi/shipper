# Keelan Engine - The Lightweight Container Engine

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Keelan Engine** is a minimalist container engine built from scratch.  
No daemons. No virtualization modules. No overhead.

Run multiple isolated apps on a single VPS with zero conflict and near-zero cost.

---

## ✨ Philosophy

> Build your own tools. Run them your way.

Keelan Engine isn't here to replace Docker.  
It's for devs who want to understand everything they run — down to the filesystem.

Every **crate** is a portable, isolated root filesystem.  
Every **ship** is a live process.  
No cgroups. No kernel modules. Just you and the system.

---

## 🚀 Features

- ⚡ **Ultra-fast** builds and execution (<100ms startup)
- 📦 **No dependency conflicts** – each app has its own rootfs
- 🧱 **Custom syntax** via `Keelanfile.yml`
- 🧊 **Zero overhead** – no daemons, no idle RAM usage
- 🛠️ **Designed for VPS & low-resource systems**

---

## 📦 Keelanfile.yml Example

```yaml
# Keelanfile.yml
build_context:
  base_image: "debian"
  work_directory: "/app"

build_steps:
  - action: execute_command
    description: "Update apt"
    command: ["apt-get", "update", "-y"]

  - action: execute_command
    description: "Install Python pip"
    command: ["apt-get", "install", "-y", "python3-pip"]

crate_config:
  expose_ports: [8000]
  environment_variables:
    PORT: "8000"

runtime_command: ["python3", "-m", "http.server", "8000"]
```

---

## ⚙️ Usage

```bash
# Build a crate from a directory with Keelanfile.yml
keelan build -w <directory> -n <name>

# Deploy the container (a.k.a. ship)
keelan ship deploy <name>

# List all crates and ships
keelan list

# Remove a crate
```

Each ship runs in its own environment using OverlayFS and `chroot`.  
It feels like Docker, but runs like native.

---

## 🚀 Get Started

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd shipper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run database migration:
   ```bash
   npm run migrate
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Start using Keelan:
   ```bash
   npx keelan
   ```

---

## 💡 Ideal For

- Personal VPS hosting
- CI sandboxing
- Local experiments
- Embedded systems

---

## 🧠 Requirements

- Linux with OverlayFS support
- Node.js and npm
- No Docker required. No kernel modules.

---

## 📖 Documentation

- [docs/](docs/)
- [examples/](examples/)

---

## 🤝 Contributing

This project is mostly built for personal use — but PRs are welcome if they align with the minimalist philosophy.

---

## 📄 License

Licensed under the [Apache 2.0 License](LICENSE)

---

> "When you build it yourself, you control everything."  
> — Keelan Engine
