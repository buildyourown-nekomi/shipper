# Shipper - The Lightweight Container Engine for Hackers

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Shipper** is a minimalist container engine built from scratch.  
No daemons. No virtualization modules. No overhead.

Run multiple isolated apps on a single VPS with zero conflict and near-zero cost.

---

## ✨ Philosophy

> Build your own tools. Run them your way.

Shipper isn't here to replace Docker.  
It's for devs who want to understand everything they run — down to the filesystem.

Every **crate** is a portable, isolated root filesystem.  
Every **ship** is a live process.  
No cgroups. No kernel modules. Just you and the system.

---

## 🚀 Features

- ⚡ **Ultra-fast** builds and execution (<100ms startup)
- 📦 **No dependency conflicts** – each app has its own rootfs
- 🧱 **Custom syntax** via `Shipperfile`
- 🧊 **Zero overhead** – no daemons, no idle RAM usage
- 🛠️ **Designed for VPS & low-resource systems**
- 🧠 **Hackable by design** – you can read the whole codebase

---

## 📦 Shipperfile Example

```yaml
# Shipperfile
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
# Build the crate from Shipperfile
shipper build

# Run the container (a.k.a. ship)
shipper run
```

Each ship runs in its own environment using OverlayFS and `proot`.  
It feels like Docker, but runs like native.

---

## 💡 Ideal For

- Personal VPS hosting
- CI sandboxing
- Local experiments
- Embedded systems
- Hackers who want full control

---

## 🧠 Requirements

- Linux with OverlayFS support
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

> “When you build it yourself, you control everything.”  
> — Shipper
